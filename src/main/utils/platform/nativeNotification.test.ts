/**
 * Unit tests for shared native OS notification helper and unread-delta policy.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeNotification {
  static all: FakeNotification[] = [];
  static isSupported = vi.fn().mockReturnValue(true);
  static lastOptions: Record<string, unknown> | null = null;

  title: string;
  body?: string;
  icon?: string;
  subtitle?: string;
  groupId?: string;
  silent: boolean;
  closed = false;
  clickHandler: (() => void) | null = null;
  closeHandler: (() => void) | null = null;

  constructor(options: {
    title: string;
    body?: string;
    icon?: string;
    subtitle?: string;
    groupId?: string;
    silent?: boolean;
  }) {
    FakeNotification.lastOptions = options as Record<string, unknown>;
    this.title = options.title;
    this.body = options.body;
    this.icon = options.icon;
    this.subtitle = options.subtitle;
    this.groupId = options.groupId;
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
    FakeNotification.lastOptions = null;
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
  BADGE: { DISPLAY_MAX: 99, MAX_COUNT: 9999, CACHE_LIMIT: 99 },
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

vi.mock('./accountLabelStore.js', () => ({
  getStoredAccountLabel: vi.fn().mockReturnValue(undefined),
}));

vi.mock('./accountNotificationIdentity.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accountNotificationIdentity.js')>();
  return {
    ...actual,
    resolveAccountIndexFromIpcEvent: vi.fn().mockReturnValue(null),
  };
});

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

  describe('buildAccountAwareNotificationPayload', () => {
    it('always sets subtitle and namespaces tag', async () => {
      const { buildAccountAwareNotificationPayload } = await import('./nativeNotification.js');
      const p = buildAccountAwareNotificationPayload({
        title: 'Alice',
        body: 'Hi',
        chatTag: 'room-1',
        accountIndex: 0 as never,
      });
      expect(p.subtitle).toBe('Account 1');
      expect(p.groupId).toBe('gogchat-account-0');
      expect(p.tag).toBe('a0:room-1');
      expect(p.title).toBe('Alice');
    });
  });

  describe('shouldShowUnreadDeltaNotification / body / clamp', () => {
    it('clamps display and builds 99+ body', async () => {
      const {
        clampBadgeDisplayCount,
        buildUnreadDeltaNotificationBody,
        shouldShowUnreadDeltaNotification,
      } = await import('./nativeNotification.js');
      expect(clampBadgeDisplayCount(150)).toBe(99);
      expect(buildUnreadDeltaNotificationBody(150)).toBe('You have 99+ unread messages');
      expect(buildUnreadDeltaNotificationBody(1)).toBe('You have a new unread message');
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

  describe('showNativeNotification', () => {
    it('passes subtitle and groupId to Electron Notification', async () => {
      const { showNativeNotification, buildAccountAwareNotificationPayload } = await import(
        './nativeNotification.js'
      );
      const win = makeWindow();
      const payload = buildAccountAwareNotificationPayload({
        title: 'T',
        chatTag: 't',
        accountIndex: 1 as never,
      });
      showNativeNotification(payload, {
        focusWindow: win as never,
        source: 'bridge',
        accountIndex: 1 as never,
      });
      expect(FakeNotification.lastOptions).toMatchObject({
        title: 'T',
        subtitle: 'Account 2',
        groupId: 'gogchat-account-1',
      });
    });

    it('cooldown is per-account', async () => {
      const { showNativeNotification } = await import('./nativeNotification.js');
      const win = makeWindow();
      showNativeNotification(
        { title: 'A', tag: 'a0:x', subtitle: 'Account 1', groupId: 'gogchat-account-0' },
        { focusWindow: win as never, source: 'bridge', accountIndex: 0 as never }
      );
      // Same account unread-delta suppressed
      expect(
        showNativeNotification(
          { title: 'D0', tag: 'a0:delta', subtitle: 'Account 1' },
          { focusWindow: win as never, source: 'unread-delta', accountIndex: 0 as never }
        )
      ).toBe(false);
      // Other account unread-delta allowed
      expect(
        showNativeNotification(
          { title: 'D1', tag: 'a1:delta', subtitle: 'Account 2' },
          { focusWindow: win as never, source: 'unread-delta', accountIndex: 1 as never }
        )
      ).toBe(true);
    });

    it('tracks untagged notifications for cleanup', async () => {
      const { showNativeNotification, cleanupActiveNativeNotifications } = await import(
        './nativeNotification.js'
      );
      const win = makeWindow();
      showNativeNotification({ title: 'No tag' }, { focusWindow: win as never });
      cleanupActiveNativeNotifications();
      expect(FakeNotification.all.every((n) => n.closed)).toBe(true);
    });
  });
});
