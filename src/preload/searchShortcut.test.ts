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

  it('falls back to ipcRenderer when the gogchat bridge is absent', async () => {
    const { ipcRenderer } = await import('electron');
    const { IPC_CHANNELS } = await import('../shared/constants.js');
    delete (window as { gogchat?: unknown }).gogchat;
    const input = document.getElementById('search');
    if (input) {
      Object.defineProperty(input, 'offsetWidth', { configurable: true, value: 20 });
      Object.defineProperty(input, 'offsetHeight', { configurable: true, value: 20 });
    }

    installSearchShortcut();
    window.dispatchEvent(new Event('DOMContentLoaded'));
    expect(ipcRenderer.on).toHaveBeenCalledWith(IPC_CHANNELS.SEARCH_SHORTCUT, expect.any(Function));

    const listener = vi
      .mocked(ipcRenderer.on)
      .mock.calls.find((call) => call[0] === IPC_CHANNELS.SEARCH_SHORTCUT)?.[1] as
      (() => void) | undefined;
    listener?.();
    expect(document.activeElement?.id).toBe('search');

    window.dispatchEvent(new Event('beforeunload'));
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.SEARCH_SHORTCUT,
      expect.any(Function)
    );
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

  it('focuses a zero-size input that still has client rects', () => {
    const input = document.getElementById('search');
    if (input) {
      Object.defineProperty(input, 'offsetWidth', { configurable: true, value: 0 });
      Object.defineProperty(input, 'offsetHeight', { configurable: true, value: 0 });
      input.getClientRects = () =>
        [{ width: 12, height: 12 }] as unknown as ReturnType<Element['getClientRects']>;
    }
    installSearchShortcut();
    window.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.activeElement?.id).toBe('search');
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
