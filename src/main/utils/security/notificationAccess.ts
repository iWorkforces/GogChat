/**
 * macOS notification permission utility.
 *
 * Electron has no first-class notification authorization status API (unlike
 * camera/mic TCC). The reliable way to trigger UNUserNotificationCenter's
 * requestAuthorization is to show a silent Electron Notification once.
 *
 * First-run UX (when a parent BrowserWindow is provided):
 *   1. In-app dialog explaining desktop notifications
 *   2. Enable → silent probe (may also surface the OS authorization sheet)
 *   3. Open System Settings → deep-link + probe
 *   4. Not Now → skip for this process; next launch may prompt again
 *
 * Semantics of `app.notificationPermissionRequested`:
 *   true  → a probe Notification emitted `show` for this profile (request path
 *           completed successfully). Does NOT mean the user currently allows
 *           banners (they may revoke later in System Settings).
 *   false → probe never completed; next ensure() may schedule again.
 */

import { type BrowserWindow, Notification, dialog, shell } from 'electron';
import log from 'electron-log';
import { configGet, configSet } from '../../config.js';
import { validateAppleSystemPreferencesURL } from '../../../shared/urlValidators.js';
import { openExternal } from './shellWrapper.js';
import { platform } from '../platform/platformDetection.js';

/** Deep link into macOS Notifications settings (Ventura+ preferred, legacy fallback). */
export const NOTIFICATION_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.Notifications-Settings.extension';

export const NOTIFICATION_SETTINGS_URL_LEGACY =
  'x-apple.systempreferences:com.apple.preference.notifications';

export type NotificationPermissionEnsureResult =
  | 'unsupported'
  | 'skipped-ci'
  | 'already-requested'
  | 'prompt-declined'
  | 'scheduled'
  | 'failed-to-schedule';

export type EnsureNotificationPermissionOptions = {
  /** When set, show the first-run in-app dialog before the OS probe. */
  parentWindow?: BrowserWindow;
};

/**
 * Process-level guard: collapses same-tick multi-window bursts so only one
 * silent probe Notification and one configSet are issued.
 */
let notificationPermissionScheduled = false;

/**
 * User chose "Not Now" on the first-run dialog this process lifetime.
 * Avoid re-prompting every account window create.
 */
let notificationPermissionPromptDeclinedThisSession = false;

/**
 * Reset in-process scheduling state. For unit tests only.
 */
export function resetNotificationPermissionSchedulingForTests(): void {
  notificationPermissionScheduled = false;
  notificationPermissionPromptDeclinedThisSession = false;
}

function isCiEnvironment(): boolean {
  return process.env['CI'] === '1' || process.env['CI'] === 'true';
}

function logEnsureResult(
  result: NotificationPermissionEnsureResult,
  detail?: string
): NotificationPermissionEnsureResult {
  const suffix = detail !== undefined ? ` (${detail})` : '';
  if (result === 'failed-to-schedule') {
    log.error(`[NotificationAccess] ensure → ${result}${suffix}`);
  } else if (result === 'unsupported' || result === 'already-requested' || result === 'prompt-declined') {
    log.debug(`[NotificationAccess] ensure → ${result}${suffix}`);
  } else {
    log.info(`[NotificationAccess] ensure → ${result}${suffix}`);
  }
  return result;
}

/**
 * Fire the silent Electron Notification that triggers macOS requestAuthorization.
 * Must only be called after process/config guards have approved a schedule.
 */
function showPermissionProbe(): void {
  try {
    const probe = new Notification({
      title: 'GogChat',
      body: 'Notifications enabled',
      silent: true,
    });
    probe.on('show', () => {
      probe.close();
      configSet('app.notificationPermissionRequested', true);
      notificationPermissionScheduled = false;
      log.info('[NotificationAccess] macOS notification permission request completed (show)');
    });
    probe.on('failed', () => {
      notificationPermissionScheduled = false;
      log.warn('[NotificationAccess] macOS notification permission probe failed');
    });
    probe.show();
  } catch (error: unknown) {
    notificationPermissionScheduled = false;
    log.error('[NotificationAccess] Failed to show permission probe:', error);
  }
}

/**
 * First-run dialog then probe. Runs asynchronously after ensure() returns `scheduled`.
 */
async function runFirstRunPromptThenProbe(parentWindow: BrowserWindow): Promise<void> {
  try {
    if (parentWindow.isDestroyed()) {
      log.warn('[NotificationAccess] Parent window destroyed before first-run prompt; probing only');
      showPermissionProbe();
      return;
    }

    const response = await dialog.showMessageBox(parentWindow, {
      type: 'info',
      title: 'Enable Notifications',
      message: 'Get notified about new Chat messages',
      detail: 'You can change this later in Preferences → Notification Settings…',
      buttons: ['Enable', 'System Settings', 'Not Now'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    if (response.response === 2) {
      notificationPermissionPromptDeclinedThisSession = true;
      notificationPermissionScheduled = false;
      log.info('[NotificationAccess] User declined first-run notification prompt (Not Now)');
      return;
    }

    if (response.response === 1) {
      log.info('[NotificationAccess] User chose Open System Settings from first-run prompt');
      await openNotificationSystemSettings();
    } else {
      log.info('[NotificationAccess] User chose Enable Notifications from first-run prompt');
    }

    showPermissionProbe();
  } catch (error: unknown) {
    notificationPermissionScheduled = false;
    log.error('[NotificationAccess] First-run notification prompt failed:', error);
  }
}

/**
 * Ensure macOS notification authorization has been requested once for this profile.
 *
 * Non-blocking: schedules the first-run dialog (when a parent window is given) and/or
 * the silent OS probe via setImmediate so callers never wait on TCC/XPC before loadURL.
 *
 * Prefer calling after the window is ready-to-show with `{ parentWindow }` so the
 * in-app dialog is visible and any OS sheet is attached to a shown window.
 */
export function ensureNotificationPermission(
  options?: EnsureNotificationPermissionOptions
): NotificationPermissionEnsureResult {
  if (!platform.isMac) {
    return logEnsureResult('unsupported', 'not macOS');
  }

  if (!Notification.isSupported()) {
    return logEnsureResult('unsupported', 'Notification.isSupported() is false');
  }

  if (isCiEnvironment()) {
    return logEnsureResult('skipped-ci');
  }

  if (configGet('app.notificationPermissionRequested')) {
    return logEnsureResult('already-requested', 'config flag set');
  }

  if (notificationPermissionPromptDeclinedThisSession) {
    return logEnsureResult('prompt-declined', 'Not Now this session');
  }

  if (notificationPermissionScheduled) {
    return logEnsureResult('already-requested', 'probe/prompt already in flight');
  }

  notificationPermissionScheduled = true;
  const parentWindow = options?.parentWindow;

  try {
    if (parentWindow !== undefined && !parentWindow.isDestroyed()) {
      setImmediate(() => {
        void runFirstRunPromptThenProbe(parentWindow);
      });
      return logEnsureResult('scheduled', 'first-run dialog then probe');
    }

    setImmediate(() => {
      showPermissionProbe();
    });
    return logEnsureResult('scheduled', 'probe only (no parent window)');
  } catch (error: unknown) {
    notificationPermissionScheduled = false;
    log.error('[NotificationAccess] Failed to schedule permission prompt/probe:', error);
    return logEnsureResult('failed-to-schedule');
  }
}

/**
 * Open macOS System Settings at the Notifications pane.
 * Tries Ventura+ deep link first, then legacy, then System Settings app.
 */
export async function openNotificationSystemSettings(): Promise<void> {
  const candidates = [NOTIFICATION_SETTINGS_URL, NOTIFICATION_SETTINGS_URL_LEGACY];

  for (const settingsURL of candidates) {
    try {
      const validatedURL = validateAppleSystemPreferencesURL(settingsURL);
      await openExternal(validatedURL);
      log.info('[NotificationAccess] Opened System Settings Notifications pane');
      return;
    } catch (error: unknown) {
      log.warn('[NotificationAccess] Failed to open settings URL:', settingsURL, error);
    }
  }

  try {
    await shell.openPath('/System/Applications/System Settings.app');
    log.info('[NotificationAccess] Opened System Settings app (fallback)');
  } catch (fallbackError: unknown) {
    log.error('[NotificationAccess] Fallback System Settings open failed:', fallbackError);
  }
}

/**
 * Dialog guiding the user to enable notifications in System Settings.
 * Wording avoids claiming the OS status is known when it is not.
 */
export async function showNotificationSettingsDialog(window: BrowserWindow): Promise<void> {
  const response = await dialog.showMessageBox(window, {
    type: 'info',
    title: 'Notification Settings',
    message: 'Enable notifications for GogChat',
    detail:
      'To receive desktop notifications for Google Chat messages:\n\n' +
      '1. Click "Open System Settings" below\n' +
      '2. Find GogChat in Notifications and turn notifications on\n' +
      '3. Also enable desktop notifications inside Google Chat settings\n' +
      '4. Restart GogChat if the system permission was previously denied',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (response.response === 0) {
    await openNotificationSystemSettings();
  }
}
