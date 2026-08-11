/**
 * Search shortcut handler
 * Focuses the GogChat search input when triggered from main process
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS, SELECTORS } from '../shared/constants.js';

const getSearchElement = (): HTMLElement | null => {
  return document.querySelector(SELECTORS.SEARCH_INPUT);
};

// https://stackoverflow.com/a/38873788
function isVisible(element: HTMLElement): boolean {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

/**
 * Handle search shortcut trigger
 */
const handleSearchShortcut = () => {
  const element = getSearchElement();

  if (element && isVisible(element)) {
    element.focus();
  }
};

let unsubscribe: (() => void) | null = null;

export function installSearchShortcut(): void {
  window.addEventListener('DOMContentLoaded', () => {
    if (window.gogchat?.onSearchShortcut) {
      unsubscribe = window.gogchat.onSearchShortcut(handleSearchShortcut);
      return;
    }
    const listener = () => {
      handleSearchShortcut();
    };
    ipcRenderer.on(IPC_CHANNELS.SEARCH_SHORTCUT, listener);
    unsubscribe = () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_SHORTCUT, listener);
    };
  });

  window.addEventListener('beforeunload', () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });
}
