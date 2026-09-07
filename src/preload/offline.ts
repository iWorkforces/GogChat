/**
 * Offline page handler
 * Manages connectivity checks and restores the offline UI after a failed
 * recovery attempt without reloading the document. On a true reply for the
 * current attempt, navigates once to the app URL via location.replace.
 * Older or unknown attemptIds cannot clear the deadline, restore retry, or navigate.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants.js';
import { validateOnlineStatusData } from '../shared/dataValidators.js';
import type { OnlineStatusData } from '../shared/types/domain.js';
import urls from '../urls.js';

let unsubscribe: (() => void) | null = null;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
let deadlineFailed = false;
let currentAttemptId: string | null = null;
export const ONLINE_CHECK_DEADLINE_MS = 6_000;

function createAttemptId(): string {
  return globalThis.crypto.randomUUID();
}

function clearOnlineDeadline(): void {
  if (deadlineTimer !== null) {
    clearTimeout(deadlineTimer);
    deadlineTimer = null;
  }
}

/** Clears the in-flight attempt and its deadline. Used on unload and in tests. */
export function clearOfflineCheck(): void {
  currentAttemptId = null;
  deadlineFailed = false;
  clearOnlineDeadline();
}

function armOnlineDeadline(attemptId: string): void {
  clearOnlineDeadline();
  deadlineFailed = false;
  deadlineTimer = setTimeout(() => {
    deadlineTimer = null;
    if (currentAttemptId !== attemptId || deadlineFailed) {
      return;
    }
    deadlineFailed = true;
    currentAttemptId = null;
    window.dispatchEvent(new Event(ONLINE_CHECK_FAILED_EVENT));
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
 * Only the current attemptId may settle the deadline or change location.
 * True → single app-URL replacement. False → DOM signal only (no reload).
 * Exported for unit tests.
 */
export const handleOnlineStatus = (status: OnlineStatusData): void => {
  if (currentAttemptId === null || status.attemptId !== currentAttemptId) {
    return;
  }
  clearOnlineDeadline();
  deadlineFailed = true;
  currentAttemptId = null;
  if (status.online) {
    // Back online - redirect to GogChat exactly once for this attempt
    window.location.replace(urls.appUrl);
  } else {
    // Still offline - retain the fallback document; signal the page to
    // restore retry state without a full reload.
    window.dispatchEvent(new Event(ONLINE_CHECK_FAILED_EVENT));
  }
};

/**
 * Handle check connectivity button click from offline.html.
 * Starts a new attempt; older in-flight results become stale.
 * Exported for unit tests. Returns the new attemptId.
 */
export const handleCheckOnline = (): string => {
  const attemptId = createAttemptId();
  currentAttemptId = attemptId;
  armOnlineDeadline(attemptId);
  if (window.gogchat?.checkIfOnline) {
    window.gogchat.checkIfOnline(attemptId);
    return attemptId;
  }
  ipcRenderer.send(IPC_CHANNELS.CHECK_IF_ONLINE, { attemptId });
  return attemptId;
};

export function installOffline(): void {
  window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('app:checkIfOnline', handleCheckOnline);

    if (window.gogchat?.onOnlineStatus) {
      unsubscribe = window.gogchat.onOnlineStatus(handleOnlineStatus);
    } else {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown) => {
        try {
          handleOnlineStatus(validateOnlineStatusData(data));
        } catch {
          // Malformed or unknown payloads must not settle the current attempt.
        }
      };
      ipcRenderer.on(IPC_CHANNELS.ONLINE_STATUS, listener);
      unsubscribe = () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ONLINE_STATUS, listener);
      };
    }
  });

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('app:checkIfOnline', handleCheckOnline);
    clearOfflineCheck();

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
}
