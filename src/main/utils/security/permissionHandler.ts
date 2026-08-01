/**
 * Chromium-level permission request & check handlers for BrowserWindow sessions.
 * Handles media TCC integration (camera/microphone) on macOS and a trusted-origin
 * allowlist for non-media permissions (notifications, mediaKeySystem, geolocation).
 */

import { type BrowserWindow, systemPreferences } from 'electron';
import log from 'electron-log';
import { checkAndRequestMediaAccess, showDeniedPermissionDialog } from './mediaAccess.js';
import { asType } from '../../../shared/typeUtils.js';

const ALLOWED_PERMISSIONS = ['notifications', 'mediaKeySystem', 'geolocation'] as const;

const TRUSTED_PERMISSION_ORIGINS = new Set([
  'https://accounts.google.com',
  'https://chat.google.com',
  'https://mail.google.com',
]);

interface PermissionOriginDetails {
  readonly requestingUrl?: string;
  readonly securityOrigin?: string;
  // embeddingOrigin is intentionally ignored for allow decisions — a trusted
  // embedder must not grant permissions to an untrusted requesting frame.
}

function parseOrigin(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
}

function isTrustedOrigin(value: string | undefined): boolean {
  const origin = parseOrigin(value);
  return origin !== null && TRUSTED_PERMISSION_ORIGINS.has(origin);
}

function readOriginDetails(details: unknown): PermissionOriginDetails {
  if (details === null || typeof details !== 'object') {
    return {};
  }

  return asType<PermissionOriginDetails>(details);
}

/**
 * Trust algorithm (request + check handlers must agree):
 * First present identity must be trusted (do not rescue an untrusted
 * requesting URL/origin via securityOrigin):
 *   1. requestingOriginArg (check-handler string; request-handler usually omits)
 *   2. details.requestingUrl → origin (when non-empty)
 *   3. details.securityOrigin → origin
 * NEVER use details.embeddingOrigin for allow decisions.
 */
function isTrustedPermissionOrigin(
  requestingOrigin: string | undefined,
  details: unknown
): boolean {
  if (requestingOrigin !== undefined && requestingOrigin.trim().length > 0) {
    return isTrustedOrigin(requestingOrigin);
  }

  const { requestingUrl, securityOrigin } = readOriginDetails(details);
  if (requestingUrl !== undefined && requestingUrl.trim().length > 0) {
    return isTrustedOrigin(requestingUrl);
  }
  return isTrustedOrigin(securityOrigin);
}

/**
 * Install the asynchronous permission request handler on the window's session.
 * For 'media' permission: checks macOS TCC status before granting.
 * For non-media: uses a trusted-origin allowlist.
 */
export function installPermissionRequestHandler(window: BrowserWindow): void {
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      void (async () => {
        if (!isTrustedPermissionOrigin(undefined, details)) {
          log.warn(`[Security] Permission denied for untrusted origin: ${permission}`);
          callback(false);
          return;
        }

        if (permission === 'media') {
          const mediaTypes: string[] = asType<{ mediaTypes?: string[] }>(details).mediaTypes ?? [];

          // Empty or missing mediaTypes must not auto-grant (KD6).
          if (mediaTypes.length === 0) {
            log.warn('[Security] Media permission denied: empty mediaTypes');
            callback(false);
            return;
          }

          // Require at least one known media type — unknown-only lists must not grant.
          const hasVideo = mediaTypes.includes('video');
          const hasAudio = mediaTypes.includes('audio');
          if (!hasVideo && !hasAudio) {
            log.warn(
              `[Security] Media permission denied: no video/audio in mediaTypes (${mediaTypes.join(', ')})`
            );
            callback(false);
            return;
          }

          let granted = true;
          if (hasVideo) {
            granted &&= await checkAndRequestMediaAccess('camera');
          }
          if (hasAudio) {
            granted &&= await checkAndRequestMediaAccess('microphone');
          }

          if (!granted) {
            // Show dialog for denied types (non-blocking — don't block callback)
            if (
              mediaTypes.includes('video') &&
              systemPreferences.getMediaAccessStatus('camera') === 'denied'
            ) {
              void showDeniedPermissionDialog(window, 'camera');
            }
            if (
              mediaTypes.includes('audio') &&
              systemPreferences.getMediaAccessStatus('microphone') === 'denied'
            ) {
              void showDeniedPermissionDialog(window, 'microphone');
            }
          }

          log.debug(
            `[Security] Media permission ${granted ? 'granted' : 'denied'}: ${mediaTypes.join(', ')}`
          );
          callback(granted);
          return;
        }

        if (asType<readonly string[]>(ALLOWED_PERMISSIONS).includes(permission)) {
          log.debug(`[Security] Permission granted: ${permission}`);
          callback(true);
        } else {
          log.warn(`[Security] Permission denied: ${permission}`);
          callback(false);
        }
      })();
    }
  );
}

/**
 * Install the synchronous permission check handler on the window's session.
 * Returns cached TCC status for media; allowlist check for others.
 */
export function installPermissionCheckHandler(window: BrowserWindow): void {
  window.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      if (!isTrustedPermissionOrigin(requestingOrigin, details)) {
        return false;
      }

      if (permission === 'media') {
        const mediaType = asType<{ mediaType?: string }>(details).mediaType;
        if (mediaType === 'video') {
          return systemPreferences.getMediaAccessStatus('camera') === 'granted';
        }
        if (mediaType === 'audio') {
          return systemPreferences.getMediaAccessStatus('microphone') === 'granted';
        }
        return false;
      }
      return asType<readonly string[]>(ALLOWED_PERMISSIONS).includes(permission);
    }
  );
}

/**
 * Install both permission handlers on a BrowserWindow's session.
 */
export function installPermissionHandlers(window: BrowserWindow): void {
  installPermissionRequestHandler(window);
  installPermissionCheckHandler(window);
}
