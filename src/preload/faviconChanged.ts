/**
 * Favicon change detector - Now using MutationObserver for better performance
 * Replaces polling with reactive DOM observation
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, SELECTORS } from '../shared/constants.js';
import { asType } from '../shared/typeUtils.js';

let previousHref: string = '';
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// PERF: 75ms trailing-edge debounce batches rapid favicon swaps during Google Chat loading
const DEBOUNCE_MS = 75;

/**
 * Notify main process of favicon changes
 */
const emitFaviconChanged = (href: string) => {
  if (previousHref === href || !href) {
    return;
  }

  previousHref = href;

  // Use the secure API exposed via contextBridge
  if (window.gogchat?.sendFaviconChanged) {
    window.gogchat.sendFaviconChanged(href);
  } else {
    ipcRenderer.send(IPC_CHANNELS.FAVICON_CHANGED, href);
  }
};

/**
 * Schedule a debounced emission for the current favicon href.
 * Trailing-edge: collapses rapid mutations into a single send after DEBOUNCE_MS of quiet.
 */
const scheduleEmit = () => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const currentHref = getCurrentFavicon();
    if (currentHref) {
      emitFaviconChanged(currentHref);
    }
  }, DEBOUNCE_MS);
};

/**
 * Get current favicon element and href
 */
const getCurrentFavicon = (): string => {
  // Try shortcut icon first, then regular icon
  const favicon =
    asType<HTMLLinkElement | null>(document.querySelector(SELECTORS.FAVICON_SHORTCUT)) ||
    asType<HTMLLinkElement | null>(document.querySelector(SELECTORS.FAVICON_ICON));

  return favicon?.href || '';
};

/**
 * Initialize MutationObserver to watch for favicon changes
 * Replaces 1-second polling with reactive observation
 */
const initObserver = () => {
  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  // Initial check
  const initialHref = getCurrentFavicon();
  if (initialHref) {
    emitFaviconChanged(initialHref);
  }

  // Create observer for <head> element changes
  observer = new MutationObserver((mutations) => {
    // Check if any mutation affected favicon elements
    for (const mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'attributes') {
        scheduleEmit();
        break; // Only need to check once per batch
      }
    }
  });

  // Observe changes to <head>
  const head = document.head;
  if (head) {
    observer.observe(head, {
      childList: true, // Watch for added/removed nodes
      subtree: true, // Watch descendants
      attributes: true, // Watch for attribute changes
      attributeFilter: ['href', 'rel'], // Only watch relevant attributes
    });
  }
};

// ✅ SECURITY FIX: Add cleanup to prevent memory leaks
const cleanup = () => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

export function installFaviconChanged(): void {
  window.addEventListener('DOMContentLoaded', initObserver);
  window.addEventListener('beforeunload', cleanup);
}
