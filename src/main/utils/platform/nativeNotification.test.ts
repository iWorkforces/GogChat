/**
 * Unit tests for shared native OS notification helper and unread-delta policy.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeNotification {
  static all: FakeNotification[] = [];
  static isSupported = vi.fn().mockReturnValue(true);

  title: string;
  body?: string;
  icon?: string;
  silent: boolean;
  closed = false;
  clickHandler: (() => void) | null = null;
  closeHandler: (() => void) | null = null;

  constructor(options: { title: string; body?: string; icon?: string; silent?: boolean }) {
    this.title = options.title;
    this.body = options.body;
    this.icon = options.icon;
    this.silent = options.silent ?? false;
    FakeNotification.all.push(this);
  }

  on(event: 'click' | 'close', handler: () => void) {
    if (event === 'click') this.clickHandler = handler;
    else this.closeHandler = handler;
  }

  show() {}

  close() {
    this.closed = true;
    this.closeHandler?.();
    FakeNotification.all = FakeNotification.all.filter((n) => n !== this);
  }

  simulateClick() {
    this.clickHandler?.();
  }

  static resetAll() {
    FakeNotification.all = [];
    FakeNotification.isSupported.mockReturnValue(true);
  }
}

vi.mock('electron', () => ({
  Notification: FakeNotification,
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/constants.js', () => ({
  TIMING: { NOTIFICATION_AUTO_DISMISS: 10000 },
}));

const createTrackedTimeoutMock = vi.fn(
  (callback: () => void, _delay: number, _name?: string) => setTimeout(callback, 100)
);
vi.mock('../lifecycle/resourceCleanup.js', () => ({
  createTrackedTimeout: (cb: () => void, delay: number, name?: string) =>
    createTrackedTimeoutMock(cb, delay, name),
}));

function makeWindow(overrides: Partial<{ isFocused: boolean; isVisible: boolean }> = {}) {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    isMinimized: vi.fn().mockReturnValue(false),
    isVisible: vi.fn().mockReturnValue(overrides.isVisible ?? false),
    isFocused: vi.fn().mockReturnValue(overrides.isFocused ?? false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

describe('nativeNotification', () => {
  beforeEach(() => {
    vi.resetModules();
    FakeNotification.resetAll();
    createTrackedTimeoutMock.mockClear();
    createTrackedTimeoutMock.mockImplementation(
      (callback: () => void, _delay: number, _name?: string) => setTimeout(callback, 100)
    );
  });

  describe('shouldShowUnreadDeltaNotification', () => {
    it('returns false when disabled', async () => {
      const { shouldShowUnreadDeltaNotification } = await import('./nativeNotification.js');
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: false,
          previousCount: 0,
          nextCount: 1,
          isWindowFocused: false,
        })
      ).toBe(false);
    });

    it('returns false when window is focused', async () => {
      const { shouldShowUnreadDeltaNotification } = await import('./nativeNotification.js');
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: 0,
          nextCount: 2,
          isWindowFocused: true,
        })
      ).toBe(false);
    });

    it('returns false on first observed count', async () => {
      const { shouldShowUnreadDeltaNotification } = await import('./nativeNotification.js');
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: undefined,
          nextCount: 3,
          isWindowFocused: false,
        })
      ).toBe(false);
    });

    it('returns false when count decreases or stays same', async () => {
      const { shouldShowUnreadDeltaNotification } = await import('./nativeNotification.js');
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: 5,
          nextCount: 4,
          isWindowFocused: false,
        })
      ).toBe(false);
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: 5,
          nextCount: 5,
          isWindowFocused: false,
        })
      ).toBe(false);
    });

    it('returns true on unfocused increase', async () => {
      const { shouldShowUnreadDeltaNotification } = await import('./nativeNotification.js');
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: 1,
          nextCount: 2,
          isWindowFocused: false,
        })
      ).toBe(true);
    });
  });

  describe('buildUnreadDeltaNotificationBody', () => {
    it('uses singular and plural copy', async () => {
      const { buildUnreadDeltaNotificationBody } = await import('./nativeNotification.js');
      expect(buildUnreadDeltaNotificationBody(1)).toBe('You have a new unread message');
      expect(buildUnreadDeltaNotificationBody(4)).toBe('You have 4 unread messages');
    });
  });

  describe('showNativeNotification', () => {
    it('returns false when unsupported', async () => {
      FakeNotification.isSupported.mockReturnValue(false);
      const { showNativeNotification } = await import('./nativeNotification.js');
      const win = makeWindow();
      expect(showNativeNotification({ title: 'T' }, win as never)).toBe(false);
      expect(FakeNotification.all.length).toBe(0);
    });

    it('shows notification and focuses window on click', async () => {
      const { showNativeNotification } = await import('./nativeNotification.js');
      const win = makeWindow({ isVisible: false, isFocused: false });
      expect(
        showNativeNotification({ title: 'Hello', body: 'World', tag: 't1' }, win as never)
      ).toBe(true);
      expect(FakeNotification.all[0]?.title).toBe('Hello');
      FakeNotification.all[0]?.simulateClick();
      expect(win.show).toHaveBeenCalled();
      expect(win.focus).toHaveBeenCalled();
    });

    it('replaces existing notification with same tag', async () => {
      const { showNativeNotification } = await import('./nativeNotification.js');
      const win = makeWindow();
      showNativeNotification({ title: 'First', tag: 'same' }, win as never);
      const first = FakeNotification.all[0];
      showNativeNotification({ title: 'Second', tag: 'same' }, win as never);
      expect(first?.closed).toBe(true);
      expect(FakeNotification.all.length).toBe(1);
      expect(FakeNotification.all[0]?.title).toBe('Second');
    });

    it('cleanupActiveNativeNotifications closes all', async () => {
      const { showNativeNotification, cleanupActiveNativeNotifications } = await import(
        './nativeNotification.js'
      );
      const win = makeWindow();
      showNativeNotification({ title: 'A', tag: 'a' }, win as never);
      showNativeNotification({ title: 'B', tag: 'b' }, win as never);
      cleanupActiveNativeNotifications();
      expect(FakeNotification.all.every((n) => n.closed)).toBe(true);
    });
  });
});
