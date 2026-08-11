// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: { send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

import { installSearchShortcut } from './searchShortcut.js';

describe('searchShortcut', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input name="q" id="search" />';
    Object.defineProperty(window, 'gogchat', {
      configurable: true,
      value: {
        onSearchShortcut: (cb: () => void) => {
          cb();
          return () => undefined;
        },
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('focuses the visible search input when the shortcut fires', () => {
    const input = document.getElementById('search');
    if (input) {
      Object.defineProperty(input, 'offsetWidth', { configurable: true, value: 20 });
      Object.defineProperty(input, 'offsetHeight', { configurable: true, value: 20 });
    }
    installSearchShortcut();
    window.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.activeElement?.id).toBe('search');
  });

  it('does not throw when the search input is missing', () => {
    document.body.innerHTML = '';
    installSearchShortcut();
    expect(() => window.dispatchEvent(new Event('DOMContentLoaded'))).not.toThrow();
  });

  it('unsubscribes on beforeunload', () => {
    const unsub = vi.fn();
    Object.defineProperty(window, 'gogchat', {
      configurable: true,
      value: { onSearchShortcut: () => unsub },
    });
    installSearchShortcut();
    window.dispatchEvent(new Event('DOMContentLoaded'));
    window.dispatchEvent(new Event('beforeunload'));
    expect(unsub).toHaveBeenCalled();
  });
});
