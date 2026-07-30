/**
 * Shared Electron (OS) notification display helper.
 *
 * Used by:
 *   - handleNotification (Chat web Notification bridge IPC)
 *   - badgeHelpers unread-delta fallback (generic banners when enabled)
 *
 * Owns tag de-dupe, auto-dismiss, and click → focus. Does not own IPC.
 */

import type { BrowserWindow } from 'electron';
import { Notification } from 'electron';
import log from 'electron-log';
import { TIMING } from '../../../shared/constants.js';
import { createTrackedTimeout } from '../lifecycle/resourceCleanup.js';

export type NativeNotificationPayload = {
  readonly title: string;
  readonly body?: string;
  readonly icon?: string;
  readonly tag?: string;
};

const activeNotifications = new Map<
  string,
  {
    notification: Notification;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

function restoreAndFocusWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

function focusIfNeeded(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  if (!window.isVisible() || !window.isFocused()) {
    restoreAndFocusWindow(window);
    log.debug('[NativeNotification] Window shown from notification click');
  }
}

/**
 * Show a validated native OS notification. Click focuses `focusWindow`.
 * Returns false when notifications are unsupported or show failed.
 */
export function showNativeNotification(
  payload: NativeNotificationPayload,
  focusWindow: BrowserWindow
): boolean {
  try {
    if (!Notification.isSupported()) {
      log.warn('[NativeNotification] Desktop notifications are not supported; ignoring show');
      return false;
    }

    log.debug(
      '[NativeNotification] Creating notification:',
      payload.title,
      'tag=',
      payload.tag ?? '(none)',
      'hasBody=',
      payload.body !== undefined
    );

    const notification = new Notification({
      title: payload.title,
      ...(payload.body !== undefined && { body: payload.body }),
      ...(payload.icon !== undefined && { icon: payload.icon }),
      silent: false,
    });

    notification.on('click', () => {
      try {
        focusIfNeeded(focusWindow);
      } catch (error: unknown) {
        log.error('[NativeNotification] Failed to handle notification click:', error);
      }
    });

    notification.on('close', () => {
      if (payload.tag) {
        const entry = activeNotifications.get(payload.tag);
        if (entry) {
          clearTimeout(entry.timeout);
          activeNotifications.delete(payload.tag);
        }
      }
      log.debug('[NativeNotification] Notification closed:', payload.title);
    });

    notification.show();

    const timeout = createTrackedTimeout(
      () => {
        try {
          notification.close();
          log.debug(
            '[NativeNotification] Notification auto-dismissed after 10s:',
            payload.title
          );
        } catch (error: unknown) {
          log.error('[NativeNotification] Failed to auto-dismiss notification:', error);
        }
      },
      TIMING.NOTIFICATION_AUTO_DISMISS,
      'notification-auto-dismiss'
    );

    if (payload.tag) {
      const existing = activeNotifications.get(payload.tag);
      if (existing) {
        clearTimeout(existing.timeout);
        existing.notification.close();
      }
      activeNotifications.set(payload.tag, { notification, timeout });
    }

    return true;
  } catch (error: unknown) {
    log.error('[NativeNotification] Failed to create notification:', error);
    return false;
  }
}

/**
 * Close all tracked notifications and clear timers (feature cleanup).
 */
export function cleanupActiveNativeNotifications(): void {
  activeNotifications.forEach((entry) => {
    clearTimeout(entry.timeout);
    entry.notification.close();
  });
  activeNotifications.clear();
}

/** Fixed tag so rapid unread increases replace a single banner instead of stacking. */
export const UNREAD_DELTA_NOTIFICATION_TAG = 'gogchat-unread-delta';

/**
 * Pure policy: whether an unread-count transition should produce a synthetic banner.
 * First observed count (previous undefined) never notifies — avoids login spam.
 */
export function shouldShowUnreadDeltaNotification(options: {
  readonly enabled: boolean;
  readonly previousCount: number | undefined;
  readonly nextCount: number;
  readonly isWindowFocused: boolean;
}): boolean {
  if (!options.enabled) {
    return false;
  }
  if (options.isWindowFocused) {
    return false;
  }
  if (options.previousCount === undefined) {
    return false;
  }
  return options.nextCount > options.previousCount && options.nextCount > 0;
}

export function buildUnreadDeltaNotificationBody(count: number): string {
  if (count === 1) {
    return 'You have a new unread message';
  }
  return `You have ${count} unread messages`;
}
