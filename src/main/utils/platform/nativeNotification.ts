/**
 * Shared Electron (OS) notification display helper.
 *
 * Used by:
 *   - handleNotification (Chat web Notification bridge IPC)
 *   - badgeHelpers unread-delta fallback (generic banners when enabled)
 *
 * Owns tag de-dupe, auto-dismiss, click → focus, and bridge/unread cooldown.
 */

import type { BrowserWindow, IpcMainEvent } from 'electron';
import { Notification } from 'electron';
import log from 'electron-log';
import { TIMING } from '../../../shared/constants.js';
import { createTrackedTimeout } from '../lifecycle/resourceCleanup.js';
import { focusNotificationSource } from './notificationFocus.js';

export type NativeNotificationSource = 'bridge' | 'unread-delta';

export type NativeNotificationPayload = {
  readonly title: string;
  readonly body?: string;
  readonly icon?: string;
  readonly tag?: string;
};

export type ShowNativeNotificationOptions = {
  readonly focusWindow: BrowserWindow;
  /** When set, click re-resolves account focus from this IPC event's sender. */
  readonly ipcEvent?: IpcMainEvent;
  /** Origin of the show — bridge marks cooldown; unread-delta respects it. */
  readonly source?: NativeNotificationSource;
};

type ActiveEntry = {
  notification: Notification;
  timeout: ReturnType<typeof setTimeout>;
  trackingKey: string;
};

const activeNotifications = new Map<string, ActiveEntry>();

/** Monotonic tracking keys for untagged notifications so cleanup can find them. */
let trackingIdCounter = 0;

/** Last time a Chat bridge notification was successfully shown (ms epoch). */
let lastBridgeNotificationAt = 0;

/**
 * Reset bridge cooldown (unit tests only).
 */
export function resetBridgeNotificationCooldownForTests(): void {
  lastBridgeNotificationAt = 0;
}

export function markBridgeNotificationShown(now = Date.now()): void {
  lastBridgeNotificationAt = now;
}

export function wasBridgeNotificationRecentlyShown(now = Date.now()): boolean {
  if (lastBridgeNotificationAt === 0) {
    return false;
  }
  return now - lastBridgeNotificationAt < TIMING.NOTIFICATION_BRIDGE_COOLDOWN_MS;
}

/**
 * Show a validated native OS notification.
 * Returns false when unsupported, suppressed by cooldown, or show failed.
 */
export function showNativeNotification(
  payload: NativeNotificationPayload,
  options: ShowNativeNotificationOptions
): boolean {
  try {
    if (!Notification.isSupported()) {
      log.warn('[NativeNotification] Desktop notifications are not supported; ignoring show');
      return false;
    }

    const source = options.source ?? 'bridge';
    if (source === 'unread-delta' && wasBridgeNotificationRecentlyShown()) {
      log.debug(
        '[NativeNotification] Suppressing unread-delta banner (recent bridge notification)'
      );
      return false;
    }

    log.debug(
      '[NativeNotification] Creating notification:',
      payload.title,
      'tag=',
      payload.tag ?? '(none)',
      'source=',
      source,
      'hasBody=',
      payload.body !== undefined
    );

    const notification = new Notification({
      title: payload.title,
      ...(payload.body !== undefined && { body: payload.body }),
      ...(payload.icon !== undefined && { icon: payload.icon }),
      silent: false,
    });

    const trackingKey = payload.tag ?? `__gogchat-notif-${trackingIdCounter++}`;
    const focusWindow = options.focusWindow;
    const ipcEvent = options.ipcEvent;

    notification.on('click', () => {
      try {
        focusNotificationSource(ipcEvent, focusWindow);
      } catch (error: unknown) {
        log.error('[NativeNotification] Failed to handle notification click:', error);
      }
    });

    notification.on('close', () => {
      // Only remove our own entry — avoids race when replacing the same tag:
      // old close must not wipe the newly inserted ActiveEntry.
      const entry = activeNotifications.get(trackingKey);
      if (entry && entry.notification === notification) {
        clearTimeout(entry.timeout);
        activeNotifications.delete(trackingKey);
      }
      log.debug('[NativeNotification] Notification closed:', payload.title);
    });

    // Replace prior tag entry before show so close of old cannot race with new.
    if (payload.tag) {
      const existing = activeNotifications.get(trackingKey);
      if (existing) {
        clearTimeout(existing.timeout);
        // Detach identity so old close cannot clear the replacement we insert later
        activeNotifications.delete(trackingKey);
        try {
          existing.notification.close();
        } catch {
          // ignore
        }
      }
    }

    notification.show();

    if (source === 'bridge') {
      markBridgeNotificationShown();
    }

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

    activeNotifications.set(trackingKey, { notification, timeout, trackingKey });

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
    try {
      entry.notification.close();
    } catch {
      // ignore
    }
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
  readonly bridgeCooldownActive?: boolean;
}): boolean {
  if (!options.enabled) {
    return false;
  }
  if (options.isWindowFocused) {
    return false;
  }
  if (options.bridgeCooldownActive === true) {
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
