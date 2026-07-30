import type { BrowserWindow, IpcMainEvent } from 'electron';
import { BrowserWindow as ElectronBrowserWindow, Notification } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS, TIMING, RATE_LIMITS } from '../../shared/constants.js';
import { defineIPC } from '../utils/ipc/defineIPC.js';
import { getRateLimiter } from '../utils/ipc/rateLimiter.js';
import { validateNotificationData } from '../../shared/dataValidators.js';
import { createTrackedTimeout } from '../utils/lifecycle/resourceCleanup.js';

let notificationShowCleanup: (() => void) | null = null;
let notificationClickedCleanup: (() => void) | null = null;

// Store active notifications and their timeouts
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

/**
 * Prefer the BrowserWindow that owns the IPC sender (correct multi-account
 * account). Fall back to the feature-init window when the sender has no
 * owning window (e.g. WebContentsView host edge cases).
 */
function resolveNotificationFocusWindow(
  event: IpcMainEvent | undefined,
  fallback: BrowserWindow
): BrowserWindow {
  if (event?.sender && !event.sender.isDestroyed()) {
    const fromSender = ElectronBrowserWindow.fromWebContents(event.sender);
    if (fromSender && !fromSender.isDestroyed()) {
      return fromSender;
    }
  }
  return fallback;
}

function focusIfNeeded(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  if (!window.isVisible() || !window.isFocused()) {
    restoreAndFocusWindow(window);
    log.debug('[Notification] Window shown from notification click');
  }
}

export default (window: BrowserWindow) => {
  void getRateLimiter();

  // Handle notification creation
  notificationShowCleanup = defineIPC({
    kind: 'on',
    channel: IPC_CHANNELS.NOTIFICATION_SHOW,
    validator: validateNotificationData,
    rateLimit: RATE_LIMITS.IPC_NOTIFICATION,
    description: 'Notification show',
    handler: (validated, event) => {
      try {
        if (!Notification.isSupported()) {
          log.warn('[Notification] Desktop notifications are not supported; ignoring show request');
          return;
        }

        const focusWindow = resolveNotificationFocusWindow(event, window);

        log.debug(
          '[Notification] Creating notification:',
          validated.title,
          'tag=',
          validated.tag ?? '(none)',
          'hasBody=',
          validated.body !== undefined
        );

        // Create native Electron notification
        const notification = new Notification({
          title: validated.title,
          ...(validated.body !== undefined && { body: validated.body }),
          ...(validated.icon !== undefined && { icon: validated.icon }),
          silent: false,
        });

        // Handle notification click — focus the account window that produced it
        notification.on('click', () => {
          try {
            focusIfNeeded(focusWindow);
          } catch (error: unknown) {
            log.error('[Notification] Failed to handle notification click:', error);
          }
        });

        // Handle notification close
        notification.on('close', () => {
          // Clean up from active notifications map
          if (validated.tag) {
            const entry = activeNotifications.get(validated.tag);
            if (entry) {
              clearTimeout(entry.timeout);
              activeNotifications.delete(validated.tag);
            }
          }
          log.debug('[Notification] Notification closed:', validated.title);
        });

        // Show the notification
        notification.show();

        // Set up auto-dismiss timeout (10 seconds)
        const timeout = createTrackedTimeout(
          () => {
            try {
              notification.close();
              log.debug('[Notification] Notification auto-dismissed after 10s:', validated.title);
            } catch (error: unknown) {
              log.error('[Notification] Failed to auto-dismiss notification:', error);
            }
          },
          TIMING.NOTIFICATION_AUTO_DISMISS,
          'notification-auto-dismiss'
        );

        // Store notification and timeout for cleanup
        if (validated.tag) {
          // If there's already a notification with this tag, close it first
          const existing = activeNotifications.get(validated.tag);
          if (existing) {
            clearTimeout(existing.timeout);
            existing.notification.close();
          }

          activeNotifications.set(validated.tag, {
            notification,
            timeout,
          });
        }
      } catch (error: unknown) {
        log.error('[Notification] Failed to create notification:', error);
      }
    },
  });

  // Handle notification click from preload (legacy support)
  notificationClickedCleanup = defineIPC({
    kind: 'on',
    channel: IPC_CHANNELS.NOTIFICATION_CLICKED,
    validator: () => undefined,
    rateLimit: 5,
    description: 'Notification clicked',
    handler: (_validated, event) => {
      try {
        const focusWindow = resolveNotificationFocusWindow(event, window);
        focusIfNeeded(focusWindow);
      } catch (error: unknown) {
        log.error('[Notification] Failed to handle notification click:', error);
      }
    },
  });
};

/**
 * Cleanup function for notification handler
 */
export function cleanupNotificationHandler(): void {
  try {
    log.debug('[Notification] Cleaning up notification handler');

    // Close all active notifications and clear timeouts
    activeNotifications.forEach((entry) => {
      clearTimeout(entry.timeout);
      entry.notification.close();
    });
    activeNotifications.clear();

    // Remove IPC listeners
    if (notificationShowCleanup) {
      notificationShowCleanup();
      notificationShowCleanup = null;
    }

    if (notificationClickedCleanup) {
      notificationClickedCleanup();
      notificationClickedCleanup = null;
    }

    log.info('[Notification] Notification handler cleaned up');
  } catch (error: unknown) {
    log.error('[Notification] Failed to cleanup notification handler:', error);
  }
}
