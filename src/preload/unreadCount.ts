/**
 * Unread count tracker - Updated for new Google Chat UI (2025+)
 * Monitors GogChat sidebar for unread message counts
 *
 * NEW SELECTOR LOGIC: Google Chat now uses:
 * - RuSDjb containers with OK1FOb/zY9JEf badge children
 * - aria-label="N unread message" on the badge element
 *
 * PERF: Uses scoped observers on .RuSDjb containers (not document.body subtree)
 * to avoid mutation-storm overhead from Google Chat's mutation-heavy DOM.
 * A lightweight body-level childList watcher detects container insertion/removal.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, SELECTORS } from '../shared/constants.js';

let previousCount = -1;
let bodyObserver: MutationObserver | null = null;
let containerObservers: Map<Element, MutationObserver> = new Map();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

type UnreadSnapshot = {
  count: number;
  containers: number;
  matchedBadges: number;
};

/**
 * Extract unread message count from GogChat DOM
 * UPDATED: New Google Chat UI uses RuSDjb containers with OK1FOb badges
 */
const getMessageCount = (): UnreadSnapshot => {
  let counter = 0;
  let matchedBadges = 0;

  let containers: NodeListOf<Element>;
  try {
    containers = document.querySelectorAll(SELECTORS.UNREAD_BADGE_CONTAINER);
  } catch {
    // Degrade gracefully if selector becomes invalid
    return { count: 0, containers: 0, matchedBadges: 0 };
  }

  containers.forEach((container) => {
    const primaryBadge = container.querySelector(SELECTORS.UNREAD_BADGE);
    const altBadge = container.querySelector(SELECTORS.UNREAD_BADGE_ALT);

    const badge = primaryBadge || altBadge;
    if (badge) {
      const ariaLabel = badge.getAttribute('aria-label') || badge.getAttribute('aria') || '';
      if (ariaLabel.toLowerCase().includes('unread')) {
        matchedBadges += 1;
        const text = badge.textContent?.trim();
        if (text) {
          const count = Number(text);
          if (!isNaN(count) && count > 0) {
            counter += count;
          }
        }
      }
    }
  });

  return {
    count: counter,
    containers: containers.length,
    matchedBadges,
  };
};

/**
 * Emit unread count to main process (only if changed)
 */
const emitCount = () => {
  const snapshot = getMessageCount();
  const { count } = snapshot;

  if (previousCount === count) {
    return;
  }

  console.info(
    `[UnreadCount] count=${count} previous=${previousCount} containers=${snapshot.containers} matched=${snapshot.matchedBadges} hidden=${document.hidden} visibility=${document.visibilityState}`
  );

  previousCount = count;

  if (window.gogchat?.sendUnreadCount) {
    window.gogchat.sendUnreadCount(count);
  } else {
    ipcRenderer.send(IPC_CHANNELS.UNREAD_COUNT, count);
  }
};

/**
 * Schedule a debounced emit. PERF: 200ms debounce batches rapid DOM mutations.
 * NOTE: Bare setTimeout is required here — preload sandbox blocks tracked-timer
 * helpers from the main process.
 */
const scheduleEmit = () => {
  if (debounceTimer !== null) {
    return;
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    emitCount();
  }, 200);
};

/**
 * Attach a scoped observer to a single .RuSDjb container.
 * Watches only the mutations needed to detect badge changes:
 * - childList: badge element added/removed
 * - characterData: badge text content (count) changes
 * - attributes: aria-label changes (when count flips between unread/read)
 */
const attachContainerObserver = (container: Element) => {
  if (containerObservers.has(container)) {
    return;
  }

  let observer: MutationObserver;
  try {
    observer = new MutationObserver(scheduleEmit);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria'],
    });
  } catch {
    // Degrade gracefully — don't throw if Google's HTML changes break observation
    return;
  }

  containerObservers.set(container, observer);
};

/**
 * Disconnect and forget any container observers whose targets have been
 * removed from the DOM. Prevents memory leaks when Google re-renders the
 * sidebar.
 */
const reconcileContainerObservers = () => {
  // Disconnect observers for detached containers
  for (const [container, observer] of containerObservers) {
    if (!container.isConnected) {
      observer.disconnect();
      containerObservers.delete(container);
    }
  }

  // Attach observers to any new containers
  let containers: NodeListOf<Element>;
  try {
    containers = document.querySelectorAll(SELECTORS.UNREAD_BADGE_CONTAINER);
  } catch {
    return;
  }
  containers.forEach(attachContainerObserver);
};

/**
 * Initialize observers:
 * 1. Body-level childList watcher (no subtree on attributes/characterData)
 *    to detect when .RuSDjb containers appear or disappear.
 * 2. Per-container scoped observers for the actual badge mutations.
 */
const initObserver = () => {
  if (bodyObserver) {
    bodyObserver.disconnect();
  }
  for (const observer of containerObservers.values()) {
    observer.disconnect();
  }
  containerObservers.clear();

  console.info(
    `[UnreadCount] observer-init hidden=${document.hidden} visibility=${document.visibilityState}`
  );

  emitCount();
  reconcileContainerObservers();

  bodyObserver = new MutationObserver(() => {
    // Body-level: cheap, only fires for childList. Reconcile container set
    // (attach to new ones, drop detached ones), then schedule a debounced emit.
    reconcileContainerObservers();
    scheduleEmit();
  });

  if (document.body) {
    try {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } catch {
      // Degrade gracefully if body observation fails
    }
  }
};

/**
 * Cleanup to prevent memory leaks
 */
const cleanup = () => {
  console.info('[UnreadCount] observer-cleanup');

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }
  for (const observer of containerObservers.values()) {
    observer.disconnect();
  }
  containerObservers.clear();
};

export function installUnreadCount(): void {
  window.addEventListener('visibilitychange', () => {
    console.info(
      `[UnreadCount] visibility-change hidden=${document.hidden} visibility=${document.visibilityState}`
    );
    emitCount();
  });

  window.addEventListener('DOMContentLoaded', initObserver);
  window.addEventListener('beforeunload', cleanup);
}
