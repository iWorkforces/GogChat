/**
 * Offline page handler
 * Manages connectivity checks and restores the offline UI after a failed
 * recovery attempt without reloading the document. On the first true reply,
 * navigates once to the app URL via location.replace.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants.js';
import urls from '../urls.js';

let unsubscribe: (() => void) | null = null;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
let deadlineFailed = false;
export const ONLINE_CHECK_DEADLINE_MS = 6_000;

function clearOnlineDeadline(): void {
  if (deadlineTimer !== null) {
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }
}

function armOnlineDeadline(): void {
  clearOnlineDeadline();
  deadlineFailed = false;
  deadlineTimer = setTimeout(() => {
    deadlineTimer = null;
    if (!deadlineFailed) {
      deadlineFailed = true;
      window.dispatchEvent(new Event(ONLINE_CHECK_FAILED_EVENT));
    }
  }, ONLINE_CHECK_DEADLINE_MS);
}

/**
 * DOM-only signal that a connectivity check finished with a false reply.
 * The offline page listens and re-enables the retry control.
 * Does not reload the document.
 */
export const ONLINE_CHECK_FAILED_EVENT = 'app:onlineCheckFailed';

/**
 * Handle online status response from main process.
 * True → single app-URL replacement. False → DOM signal only (no reload).
 * Exported for unit tests.
 */
export const handleOnlineStatus = (online: boolean): void => {
  clearOnlineDeadline();
  deadlineFailed = true;
  if (online) {
    // Back online - redirect to GogChat exactly once
    window.location.replace(urls.appUrl);
  } else {
    // Still offline - retain the fallback document; signal the page to
    // restore retry state without a full reload.
    window.dispatchEvent(new Event(ONLINE_CHECK_FAILED_EVENT));
  }
};

/**
 * Handle check connectivity button click from offline.html.
 * Exported for unit tests.
 */
export const handleCheckOnline = (): void => {
  armOnlineDeadline();
  if (window.gogchat?.checkIfOnline) {
    window.gogchat.checkIfOnline();
    return;
  }
  ipcRenderer.send(IPC_CHANNELS.CHECK_IF_ONLINE);
};

export function installOffline(): void {
  window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('app:checkIfOnline', handleCheckOnline);

    if (window.gogchat?.onOnlineStatus) {
      unsubscribe = window.gogchat.onOnlineStatus(handleOnlineStatus);
    } else {
      const listener = (_event: Electron.IpcRendererEvent, online: boolean) => {
        handleOnlineStatus(online);
      };
      ipcRenderer.on(IPC_CHANNELS.ONLINE_STATUS, listener);
      unsubscribe = () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ONLINE_STATUS, listener);
      };
    }
  });

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('app:checkIfOnline', handleCheckOnline);
    clearOnlineDeadline();

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
}
