/**
 * Offline page handler
 * Manages connectivity checks and restores the offline UI after a failed
 * recovery attempt without reloading the document. On the first true reply,
 * navigates once to the app URL via location.replace.
 */

import urls from '../urls.js';

let unsubscribe: (() => void) | null = null;

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
  if (window.gogchat?.checkIfOnline) {
    window.gogchat.checkIfOnline();
  }
};

// Use secure API exposed via contextBridge
window.addEventListener('DOMContentLoaded', () => {
  // Listen to global event from offline.html
  window.addEventListener('app:checkIfOnline', handleCheckOnline);

  // Listen to online status from main process
  if (window.gogchat?.onOnlineStatus) {
    unsubscribe = window.gogchat.onOnlineStatus(handleOnlineStatus);
  }
});

// Clean up listeners when page unloads
window.addEventListener('beforeunload', () => {
  window.removeEventListener('app:checkIfOnline', handleCheckOnline);

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
});
