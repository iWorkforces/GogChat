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

const focusNotificationSourceMock = vi.fn();

vi.mock('electron', () => ({
  Notification: FakeNotification,
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../shared/constants.js', () => ({
  TIMING: { NOTIFICATION_AUTO_DISMISS: 10000, NOTIFICATION_BRIDGE_COOLDOWN_MS: 8000 },
}));

const createTrackedTimeoutMock = vi.fn(
  (callback: () => void, _delay: number, _name?: string) => setTimeout(callback, 100)
);
vi.mock('../lifecycle/resourceCleanup.js', () => ({
  createTrackedTimeout: (cb: () => void, delay: number, name?: string) =>
    createTrackedTimeoutMock(cb, delay, name),
}));

vi.mock('./notificationFocus.js', () => ({
  focusNotificationSource: (...args: unknown[]) => focusNotificationSourceMock(...args),
}));

function makeWindow() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    isMinimized: vi.fn().mockReturnValue(false),
    isVisible: vi.fn().mockReturnValue(false),
    isFocused: vi.fn().mockReturnValue(false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

describe('nativeNotification', () => {
  beforeEach(async () => {
    vi.resetModules();
    FakeNotification.resetAll();
    createTrackedTimeoutMock.mockClear();
    focusNotificationSourceMock.mockClear();
    createTrackedTimeoutMock.mockImplementation(
      (callback: () => void, _delay: number, _name?: string) => setTimeout(callback, 100)
    );
    const mod = await import('./nativeNotification.js');
    mod.resetBridgeNotificationCooldownForTests();
  });

  describe('shouldShowUnreadDeltaNotification', () => {
    it('returns false when disabled, focused, first count, decrease, or bridge cooldown', async () => {
      const { shouldShowUnreadDeltaNotification } = await import('./nativeNotification.js');
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: false,
          previousCount: 0,
          nextCount: 1,
          isWindowFocused: false,
        })
      ).toBe(false);
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: 0,
          nextCount: 2,
          isWindowFocused: true,
        })
      ).toBe(false);
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: undefined,
          nextCount: 3,
          isWindowFocused: false,
        })
      ).toBe(false);
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
          previousCount: 1,
          nextCount: 2,
          isWindowFocused: false,
          bridgeCooldownActive: true,
        })
      ).toBe(false);
    });

    it('returns true on unfocused increase without bridge cooldown', async () => {
      const { shouldShowUnreadDeltaNotification } = await import('./nativeNotification.js');
      expect(
        shouldShowUnreadDeltaNotification({
          enabled: true,
          previousCount: 1,
          nextCount: 2,
          isWindowFocused: false,
          bridgeCooldownActive: false,
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
      expect(
        showNativeNotification({ title: 'T' }, { focusWindow: win as never })
      ).toBe(false);
      expect(FakeNotification.all.length).toBe(0);
    });

    it('shows bridge notification, marks cooldown, focuses via focus helper on click', async () => {
      const { showNativeNotification, wasBridgeNotificationRecentlyShown } = await import(
        './nativeNotification.js'
      );
      const win = makeWindow();
      const event = { sender: { id: 1 } };
      expect(
        showNativeNotification(
          { title: 'Hello', body: 'World', tag: 't1' },
          { focusWindow: win as never, ipcEvent: event as never, source: 'bridge' }
        )
      ).toBe(true);
      expect(FakeNotification.all[0]?.title).toBe('Hello');
      expect(wasBridgeNotificationRecentlyShown()).toBe(true);
      FakeNotification.all[0]?.simulateClick();
      expect(focusNotificationSourceMock).toHaveBeenCalledWith(event, win);
    });

    it('suppresses unread-delta during bridge cooldown', async () => {
      const { showNativeNotification } = await import('./nativeNotification.js');
      const win = makeWindow();
      showNativeNotification(
        { title: 'Bridge', tag: 'b1' },
        { focusWindow: win as never, source: 'bridge' }
      );
      expect(
        showNativeNotification(
          { title: 'Delta', tag: 'gogchat-unread-delta' },
          { focusWindow: win as never, source: 'unread-delta' }
        )
      ).toBe(false);
      // Only the bridge notification remains
      expect(FakeNotification.all.some((n) => n.title === 'Delta')).toBe(false);
    });

    it('replaces same tag without letting old close wipe the new entry', async () => {
      const { showNativeNotification, cleanupActiveNativeNotifications } = await import(
        './nativeNotification.js'
      );
      const win = makeWindow();
      showNativeNotification(
        { title: 'First', tag: 'same' },
        { focusWindow: win as never, source: 'bridge' }
      );
      const first = FakeNotification.all[0];
      // Simulate async close after replacement: schedule close after set
      const originalClose = first!.close.bind(first);
      first!.close = () => {
        // defer close handler until after second notification is registered
        setTimeout(() => originalClose(), 0);
      };

      showNativeNotification(
        { title: 'Second', tag: 'same' },
        { focusWindow: win as never, source: 'bridge' }
      );
      await new Promise((r) => setTimeout(r, 10));

      // Second should still be trackable (cleanup closes it)
      expect(FakeNotification.all.some((n) => n.title === 'Second' && !n.closed)).toBe(true);
      cleanupActiveNativeNotifications();
      expect(FakeNotification.all.every((n) => n.closed)).toBe(true);
    });

    it('tracks untagged notifications for cleanup', async () => {
      const { showNativeNotification, cleanupActiveNativeNotifications } = await import(
        './nativeNotification.js'
      );
      const win = makeWindow();
      showNativeNotification({ title: 'No tag' }, { focusWindow: win as never });
      expect(FakeNotification.all.length).toBe(1);
      cleanupActiveNativeNotifications();
      expect(FakeNotification.all.every((n) => n.closed)).toBe(true);
    });
  });
});
