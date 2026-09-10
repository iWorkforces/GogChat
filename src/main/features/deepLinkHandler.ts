import { app } from 'electron';
import log from 'electron-log';
import { DEEP_LINK } from '../../shared/constants.js';
import {
  isGoogleAuthUrl,
  validateDeepLinkURL,
  validateExternalURL,
} from '../../shared/urlValidators.js';
import type { IAccountWindowManager } from '../../shared/types/window.js';
import { asAccountIndex, type AccountIndex } from '../../shared/types/branded.js';
import {
  createAccountWindow,
  getAccountWindowManager,
} from '../utils/account/accountWindowManager.js';
import { loadAccountURL, getAccountURL } from '../utils/account/accountNavigation.js';
import { extractDeepLinkFromArgv } from '../utils/account/deepLinkUtils.js';
import { addTrackedListener } from '../utils/lifecycle/resourceCleanup.js';
import { openExternal } from '../utils/security/shellWrapper.js';
import { registerMenuAction } from './menuActionRegistry.js';
import { asType } from '../../shared/typeUtils.js';

let pendingDeepLinkUrl: string | null = null;
let pendingReplayDetach: (() => void) | null = null;
let openUrlListenerRegistered = false;

function getAccountIndexFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/u\/(\d+)(?:\/|$)/);
    return asAccountIndex(match ? Number(match[1]) : 0);
  } catch {
    return asAccountIndex(0);
  }
}

function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search ? '?[redacted]' : ''}`;
  } catch {
    return '[invalid-url]';
  }
}

export function processDeepLink(url: string): void {
  try {
    log.info(`[DeepLink] Received deep link: ${sanitizeUrlForLog(url)}`);
    const validatedUrl = validateDeepLinkURL(url);
    navigateToUrl(validatedUrl);
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to process deep link:', error);
  }
}

function detachPendingReplay(): void {
  if (pendingReplayDetach) {
    pendingReplayDetach();
    pendingReplayDetach = null;
  }
}

/**
 * Replay a buffered deep link once the account leaves a Google auth page.
 * One-shot: the first non-auth `did-navigate` drains `pendingDeepLinkUrl`.
 */
function armPendingReplay(accountIndex: AccountIndex): void {
  detachPendingReplay();
  const manager = getAccountWindowManager();
  const webContents = manager.getAccountWebContents(accountIndex);
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  const onNavigate = (_event: Electron.Event, nextUrl: string): void => {
    if (isGoogleAuthUrl(nextUrl)) {
      return;
    }
    detachPendingReplay();
    processPendingDeepLink();
  };

  webContents.on('did-navigate', onNavigate);
  pendingReplayDetach = () => {
    try {
      if (!webContents.isDestroyed()) {
        webContents.removeListener('did-navigate', onNavigate);
      }
    } catch {
      // webContents already gone
    }
  };
}

function navigateToUrl(url: string): void {
  // Prefer path /u/N/ from the deep link itself (WCV host getAccountIndex is
  // "most recent", not the URL account). Fall back only when path has no /u/N/.
  const accountIndex = getAccountIndexFromUrl(url);
  const manager = getAccountWindowManager();

  // Match externalLinks: missing account → create only (factory/router load).
  // Existing (including dehydrated BW: hasAccount=true, no live window) →
  // focusAccount (hydrate) then loadAccountURL only when the URL differs.
  if (!manager.hasAccount(accountIndex)) {
    const created = createAccountWindow(url, accountIndex);
    if (!created || created.isDestroyed()) {
      pendingDeepLinkUrl = url;
      log.info('[DeepLink] Window not ready, buffering URL');
      return;
    }
    manager.focusAccount(accountIndex);
    return;
  }

  manager.focusAccount(accountIndex);

  const currentUrl = getAccountURL(manager, accountIndex);
  if (currentUrl !== null && isGoogleAuthUrl(currentUrl)) {
    pendingDeepLinkUrl = url;
    log.info('[DeepLink] Google auth in progress, buffering URL');
    armPendingReplay(accountIndex);
    return;
  }

  if (currentUrl !== url) {
    log.info(`[DeepLink] Navigating to: ${sanitizeUrlForLog(url)}`);
    loadAccountURL(manager, accountIndex, url);
  }
}

function processPendingDeepLink(): void {
  if (pendingDeepLinkUrl) {
    log.info('[DeepLink] Processing buffered deep link');
    const url = pendingDeepLinkUrl;
    pendingDeepLinkUrl = null;
    navigateToUrl(url);
  }
}

function openInDefaultBrowser(url: string): void {
  try {
    const sanitizedUrl = validateExternalURL(url);
    log.info(`[DeepLink] Opening external URL in default browser: ${sanitizeUrlForLog(url)}`);
    void openExternal(sanitizedUrl);
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to open external URL:', error);
  }
}

export function setupDeepLinkListener(): void {
  if (openUrlListenerRegistered) {
    log.warn('[DeepLink] open-url listener already registered');
    return;
  }

  const handler = (event: Electron.Event, url: string): void => {
    event.preventDefault();
    log.info(`[DeepLink] open-url event: ${sanitizeUrlForLog(url)}`);

    if (url.startsWith(DEEP_LINK.PREFIX) || url.startsWith('https://chat.google.com')) {
      processDeepLink(url);
    } else if (url.startsWith('https://')) {
      openInDefaultBrowser(url);
    } else {
      log.warn(`[DeepLink] Ignoring unrecognized URL scheme: ${sanitizeUrlForLog(url)}`);
    }
  };

  // Track via resourceCleanup for graceful shutdown
  // Cast needed: addTrackedListener uses a generic EventTarget interface
  // while Electron's app has strongly-typed overloads
  addTrackedListener(
    asType<Parameters<typeof addTrackedListener>[0]>(app),
    'open-url',
    asType<Parameters<typeof addTrackedListener>[2]>(handler),
    'DeepLink open-url'
  );

  openUrlListenerRegistered = true;
  log.info('[DeepLink] open-url listener registered');
}

function registerProtocolClient(protocol: string): void {
  try {
    let result: boolean;

    if (process.defaultApp && process.argv.length >= 2) {
      result = app.setAsDefaultProtocolClient(protocol, process.execPath, [process.argv[1]!]);
    } else {
      result = app.setAsDefaultProtocolClient(protocol);
    }

    if (result) {
      log.info(`[DeepLink] Registered as default protocol client for ${protocol}://`);
    } else {
      log.error(`[DeepLink] Failed to register as default protocol client for ${protocol}://`);
    }
  } catch (error: unknown) {
    log.error('[DeepLink] Error registering protocol client:', error);
  }
}

export function registerDeepLinkProtocol(): void {
  registerProtocolClient(DEEP_LINK.PROTOCOL);
}

export default function initDeepLinkHandler(_context: {
  accountWindowManager?: IAccountWindowManager;
}): void {
  try {
    // No longer storing window reference - use dynamic lookup via account window manager
    registerDeepLinkProtocol();
    const startupDeepLink = extractDeepLinkFromArgv(process.argv);
    if (startupDeepLink) {
      processDeepLink(startupDeepLink);
    }
    processPendingDeepLink();
    log.info('[DeepLink] Deep link handler initialized');

    registerMenuAction('processDeepLink', {
      label: 'Process deep link',
      handler: (url: string) => processDeepLink(url),
    });
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to initialize deep link handler:', error);
  }
}

export function cleanupDeepLinkHandler(): void {
  try {
    log.debug('[DeepLink] Cleaning up deep link handler');
    detachPendingReplay();
    pendingDeepLinkUrl = null;
    // No longer clearing windowRef since we use dynamic lookup
    log.info('[DeepLink] Deep link handler cleaned up');
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to cleanup:', error);
  }
}
