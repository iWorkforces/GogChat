/**
 * Resolve and focus the account UI that produced a notification IPC event.
 *
 * BrowserWindow backend: show/focus the account window from webContents.
 * WebContentsView backend: switch visible view + focus host via focusAccount.
 */

import type { BrowserWindow, IpcMainEvent } from 'electron';
import { BrowserWindow as ElectronBrowserWindow } from 'electron';
import log from 'electron-log';
import { asWebContentsId } from '../../../shared/types/branded.js';
import { getSharedFeatureContext } from '../lifecycle/featureContextStore.js';

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
 * Focus the account (or window) that sent `event`, falling back to `fallback`.
 */
export function focusNotificationSource(
  event: IpcMainEvent | undefined,
  fallback: BrowserWindow
): void {
  try {
    if (event?.sender && !event.sender.isDestroyed()) {
      const manager = getSharedFeatureContext().accountWindowManager;
      if (manager) {
        const accountIndex = manager.getAccountForWebContents(asWebContentsId(event.sender.id));
        if (accountIndex !== null) {
          manager.focusAccount(accountIndex);
          log.debug('[NotificationFocus] Focused account', accountIndex, 'from IPC sender');
          return;
        }
      }

      const fromSender = ElectronBrowserWindow.fromWebContents(event.sender);
      if (fromSender && !fromSender.isDestroyed()) {
        restoreAndFocusWindow(fromSender);
        log.debug('[NotificationFocus] Focused BrowserWindow from sender');
        return;
      }
    }

    if (!fallback.isDestroyed()) {
      restoreAndFocusWindow(fallback);
      log.debug('[NotificationFocus] Focused fallback window');
    }
  } catch (error: unknown) {
    log.error('[NotificationFocus] Failed to focus notification source:', error);
  }
}

/**
 * Best-effort BrowserWindow to associate with a notification at show time
 * (icon parent / fallback for click). Prefer host/account window from sender.
 */
export function resolveNotificationFocusWindow(
  event: IpcMainEvent | undefined,
  fallback: BrowserWindow
): BrowserWindow {
  if (event?.sender && !event.sender.isDestroyed()) {
    const manager = getSharedFeatureContext().accountWindowManager;
    if (manager) {
      const accountIndex = manager.getAccountForWebContents(asWebContentsId(event.sender.id));
      if (accountIndex !== null) {
        const accountWindow = manager.getAccountWindow(accountIndex);
        if (accountWindow && !accountWindow.isDestroyed()) {
          return accountWindow;
        }
      }
    }

    const fromSender = ElectronBrowserWindow.fromWebContents(event.sender);
    if (fromSender && !fromSender.isDestroyed()) {
      return fromSender;
    }
  }
  return fallback;
}
