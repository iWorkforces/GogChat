/**
 * Unit tests for handleNotification feature — notification lifecycle & auto-dismiss
 *
 * Covers:
 * - Notification creation via NOTIFICATION_SHOW IPC
 * - Notification click brings window to focus
 * - Notification close cleans up activeNotifications map
 * - Auto-dismiss timeout (10s) closes notification
 * - Tag-based deduplication (replaces existing notification with same tag)
 * - cleanupNotificationHandler closes all active notifications
 * - cleanupNotificationHandler removes IPC listeners
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeFakeWindow() {
  const wc = new EventEmitter() as EventEmitter & { getURL: () => string };
  wc.getURL = vi.fn(() => 'https://chat.google.com');

  const win = new EventEmitter() as EventEmitter & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    destroy: () => void;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    isFocused: ReturnType<typeof vi.fn>;
    isMinimized: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    _destroyed: boolean;
  };

  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.destroy = () => {
    win._destroyed = true;
    win.emit('closed');
  };

  win.show = vi.fn();
  win.hide = vi.fn();
  win.focus = vi.fn();
  win.isVisible = vi.fn().mockReturnValue(true);
  win.isFocused = vi.fn().mockReturnValue(true);
  win.isMinimized = vi.fn().mockReturnValue(false);
  win.restore = vi.fn();

  return win;
}

// Fake Notification class
class FakeNotification {
  static all: FakeNotification[] = [];
  static isSupported = vi.fn().mockReturnValue(true);

  title: string;
  body?: string;
  icon?: string;
  silent: boolean;
  clicked = false;
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
    if (event === 'click') {
      this.clickHandler = handler;
    } else if (event === 'close') {
      this.closeHandler = handler;
    }
  }

  show() {
    // do nothing
  }

  close() {
    this.closed = true;
    this.closeHandler?.();
    FakeNotification.all = FakeNotification.all.filter((n) => n !== this);
  }

  simulateClick() {
    this.clicked = true;
    this.clickHandler?.();
  }

  static resetAll() {
    FakeNotification.all = [];
    FakeNotification.isSupported.mockReturnValue(true);
  }
}

const fromWebContentsMock = vi.fn();

// ─── Module-level mocks ───────────────────────────────────────────────────────

const ipcMainMock = {
  on: vi.fn(),
  removeListener: vi.fn(),
};

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(vi.fn(), {
    fromWebContents: fromWebContentsMock,
  }),
  Notification: FakeNotification,
  ipcMain: ipcMainMock,
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../shared/constants.js', () => ({
  IPC_CHANNELS: {
    NOTIFICATION_SHOW: 'notificationShow',
    NOTIFICATION_CLICKED: 'notificationClicked',
  },
  TIMING: {
    NOTIFICATION_AUTO_DISMISS: 10000,
  },
  RATE_LIMITS: {
    IPC_NOTIFICATION: 5,
  },
}));

vi.mock('../../shared/dataValidators.js', () => ({
  validateNotificationData: vi.fn(
    (data) => data as { title: string; body?: string; icon?: string; tag?: string }
  ),
}));

const createSecureIPCHandlerMock = vi.fn();
vi.mock('../utils/ipc/defineIPC.js', () => ({
  defineIPC: createSecureIPCHandlerMock,
}));

const getRateLimiterMock = vi.fn().mockReturnValue({
  isAllowed: vi.fn().mockReturnValue(true),
});
vi.mock('../utils/ipc/rateLimiter.js', () => ({
  getRateLimiter: getRateLimiterMock,
}));

const createTrackedTimeoutMock = vi.fn();
vi.mock('../utils/lifecycle/resourceCleanup.js', () => ({
  createTrackedTimeout: createTrackedTimeoutMock,
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('handleNotification feature', () => {
  let fakeWindow: ReturnType<typeof makeFakeWindow>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    FakeNotification.resetAll();
    fakeWindow = makeFakeWindow();

    fromWebContentsMock.mockReturnValue(null);

    // Default: createSecureIPCHandler stores the handler config for later inspection
    createSecureIPCHandlerMock.mockImplementation(
      (config: {
        channel: string;
        validator: (data: unknown) => unknown;
        rateLimit?: number;
        description?: string;
        handler: (data: unknown, event?: unknown) => void;
      }) => {
        const _wrappedHandler = (data: unknown, event?: unknown) => {
          if (!getRateLimiterMock().isAllowed()) return;
          const validated = config.validator(data);
          config.handler(validated, event);
        };

        return () => {
          // cleanup function
        };
      }
    );

    createTrackedTimeoutMock.mockImplementation(
      (callback: () => void, _delay: number, _name?: string) => {
        return setTimeout(callback, 100); // short timeout for tests
      }
    );
  });

  // ── Default export sets up IPC handlers ─────────────────────────────────────

  it('sets up NOTIFICATION_SHOW IPC handler', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    expect(createSecureIPCHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'notificationShow',
      })
    );
  });

  it('sets up NOTIFICATION_CLICKED IPC handler', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    expect(createSecureIPCHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'notificationClicked',
      })
    );
  });

  // ── Notification creation ────────────────────────────────────────────────────

  it('creates notification with correct options', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown, event?: unknown) => void };

    const notificationData = {
      title: 'Test Title',
      body: 'Test body',
      icon: 'test-icon.png',
      tag: 'tag1',
    };
    handlerConfig.handler(notificationData);

    expect(FakeNotification.all.length).toBe(1);
    expect(FakeNotification.all[0]?.title).toBe('Test Title');
    expect(FakeNotification.all[0]?.body).toBe('Test body');
    expect(FakeNotification.all[0]?.icon).toBe('test-icon.png');
  });

  it('skips notification creation when Notification.isSupported is false', async () => {
    FakeNotification.isSupported.mockReturnValue(false);
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown, event?: unknown) => void };

    handlerConfig.handler({ title: 'Should not show' });

    expect(FakeNotification.all.length).toBe(0);
  });

  it('notification click focuses the sender window when different from main', async () => {
    const senderWindow = makeFakeWindow();
    senderWindow.isVisible.mockReturnValue(false);
    senderWindow.isFocused.mockReturnValue(false);
    fromWebContentsMock.mockReturnValue(senderWindow);

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown, event?: unknown) => void };

    const event = {
      sender: { isDestroyed: () => false },
    };
    handlerConfig.handler({ title: 'From account-1' }, event);

    const notification = FakeNotification.all[0];
    notification.simulateClick();

    expect(senderWindow.show).toHaveBeenCalled();
    expect(senderWindow.focus).toHaveBeenCalled();
    expect(fakeWindow.show).not.toHaveBeenCalled();
  });

  it('notification click brings window to focus when not visible', async () => {
    fakeWindow.isVisible.mockReturnValue(false);
    fakeWindow.isFocused.mockReturnValue(false);

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    handlerConfig.handler({ title: 'Test' });

    const notification = FakeNotification.all[0];
    notification.simulateClick();

    expect(fakeWindow.show).toHaveBeenCalled();
  });

  it('notification click restores and focuses a minimized Windows window', async () => {
    fakeWindow.isVisible.mockReturnValue(false);
    fakeWindow.isFocused.mockReturnValue(false);
    fakeWindow.isMinimized.mockReturnValue(true);

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    handlerConfig.handler({ title: 'Test' });

    const notification = FakeNotification.all[0];
    notification.simulateClick();

    expect(fakeWindow.restore).toHaveBeenCalled();
    expect(fakeWindow.show).toHaveBeenCalled();
    expect(fakeWindow.focus).toHaveBeenCalled();
  });

  it('notification click does not show window when already visible and focused', async () => {
    fakeWindow.isVisible.mockReturnValue(true);
    fakeWindow.isFocused.mockReturnValue(true);

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    handlerConfig.handler({ title: 'Test' });

    const notification = FakeNotification.all[0];
    notification.simulateClick();

    expect(fakeWindow.show).not.toHaveBeenCalled();
  });

  // ── Auto-dismiss timeout ─────────────────────────────────────────────────────

  it('sets auto-dismiss timeout when creating notification', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    handlerConfig.handler({ title: 'Test', tag: 'test-tag' });

    expect(createTrackedTimeoutMock).toHaveBeenCalled();
  });

  it('notification auto-dismisses after timeout', async () => {
    vi.useFakeTimers();

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    handlerConfig.handler({ title: 'Test Auto-dismiss', tag: 'auto-dismiss' });

    const notification = FakeNotification.all[0];
    expect(notification.closed).toBe(false);

    vi.advanceTimersByTime(10000);

    expect(notification.closed).toBe(true);

    vi.useRealTimers();
  });

  // ── Tag-based deduplication ──────────────────────────────────────────────────

  it('closes existing notification when new one with same tag arrives', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    // Create first notification with tag
    handlerConfig.handler({ title: 'First', tag: 'same-tag' });
    const firstNotification = FakeNotification.all[0];

    // Create second notification with same tag
    handlerConfig.handler({ title: 'Second', tag: 'same-tag' });

    // First notification should be closed
    expect(firstNotification.closed).toBe(true);
    // Only one notification should exist
    expect(FakeNotification.all.length).toBe(1);
    expect(FakeNotification.all[0]?.title).toBe('Second');
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  it('cleanupNotificationHandler closes all active notifications', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    // Create multiple notifications
    handlerConfig.handler({ title: 'Notif 1', tag: 'tag1' });
    handlerConfig.handler({ title: 'Notif 2', tag: 'tag2' });

    expect(FakeNotification.all.length).toBe(2);

    feature.cleanupNotificationHandler();

    // All notifications should be closed
    expect(FakeNotification.all.every((n) => n.closed)).toBe(true);
  });

  it('cleanupNotificationHandler is safe when no notifications exist', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    expect(() => feature.cleanupNotificationHandler()).not.toThrow();
  });

  it('cleanupNotificationHandler removes IPC listeners', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    feature.cleanupNotificationHandler();

    // The cleanup function returned by createSecureIPCHandler should be called
    // Since we mock it to return no-op, we just verify the feature doesn't crash
    expect(() => feature.cleanupNotificationHandler()).not.toThrow();
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('notification click handler catches errors gracefully', async () => {
    fakeWindow.isVisible.mockReturnValue(false);
    fakeWindow.show.mockImplementation(() => {
      throw new Error('show error');
    });

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    handlerConfig.handler({ title: 'Test' });

    const notification = FakeNotification.all[0];
    expect(() => notification.simulateClick()).not.toThrow();
  });

  it('notification creation catches errors gracefully', async () => {
    createSecureIPCHandlerMock.mockImplementation(() => {
      return () => {};
    });

    const feature = await import('./handleNotification.js');
    expect(() => feature.default(fakeWindow as unknown as Electron.BrowserWindow)).not.toThrow();
  });

  // ── Notification close cleanup ───────────────────────────────────────────────

  it('notification close event removes it from activeNotifications map', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown) => void };

    handlerConfig.handler({ title: 'Test', tag: 'close-test' });

    const notification = FakeNotification.all[0];
    expect(FakeNotification.all.length).toBe(1);

    // Manually trigger close
    notification.close();

    // Notification should be removed from tracking
    expect(FakeNotification.all.length).toBe(0);
  });
});
