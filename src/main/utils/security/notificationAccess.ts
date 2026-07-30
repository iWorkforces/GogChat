/**
 * macOS notification permission utility.
 *
 * Electron has no first-class notification authorization status API (unlike
 * camera/mic TCC). The reliable way to trigger UNUserNotificationCenter's
 * requestAuthorization is to show a silent Electron Notification once.
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
  | 'scheduled'
  | 'failed-to-schedule';

/**
 * Process-level guard: collapses same-tick multi-window bursts so only one
 * silent probe Notification and one configSet are issued.
 */
let notificationPermissionScheduled = false;

/**
 * Reset in-process scheduling state. For unit tests only.
 */
export function resetNotificationPermissionSchedulingForTests(): void {
  notificationPermissionScheduled = false;
}

function isCiEnvironment(): boolean {
  return process.env['CI'] === '1' || process.env['CI'] === 'true';
}

/**
 * Ensure macOS notification authorization has been requested once for this profile.
 *
 * Non-blocking: schedules the probe via setImmediate so callers (window factory)
 * never wait on the TCC/XPC round-trip before loadURL.
 */
export function ensureNotificationPermission(): NotificationPermissionEnsureResult {
  if (!platform.isMac) {
    return 'unsupported';
  }

  if (!Notification.isSupported()) {
    log.debug('[NotificationAccess] Notifications not supported on this system');
    return 'unsupported';
  }

  if (isCiEnvironment()) {
    log.info('[NotificationAccess] Skipping notification permission request in CI');
    return 'skipped-ci';
  }

  if (configGet('app.notificationPermissionRequested')) {
    return 'already-requested';
  }

  if (notificationPermissionScheduled) {
    return 'already-requested';
  }

  notificationPermissionScheduled = true;
  try {
    setImmediate(() => {
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
    });
    return 'scheduled';
  } catch (error: unknown) {
    notificationPermissionScheduled = false;
    log.error('[NotificationAccess] Failed to schedule permission probe:', error);
    return 'failed-to-schedule';
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
