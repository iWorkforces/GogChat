import type { BrowserWindow, IpcMainEvent } from 'electron';
import { BrowserWindow as ElectronBrowserWindow } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS, RATE_LIMITS } from '../../shared/constants.js';
import { defineIPC } from '../utils/ipc/defineIPC.js';
import { getRateLimiter } from '../utils/ipc/rateLimiter.js';
import { validateNotificationData } from '../../shared/dataValidators.js';
import {
  cleanupActiveNativeNotifications,
  showNativeNotification,
} from '../utils/platform/nativeNotification.js';

let notificationShowCleanup: (() => void) | null = null;
let notificationClickedCleanup: (() => void) | null = null;

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
      const focusWindow = resolveNotificationFocusWindow(event, window);
      showNativeNotification(
        {
          title: validated.title,
          ...(validated.body !== undefined && { body: validated.body }),
          ...(validated.icon !== undefined && { icon: validated.icon }),
          ...(validated.tag !== undefined && { tag: validated.tag }),
        },
        focusWindow
      );
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

    cleanupActiveNativeNotifications();

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
