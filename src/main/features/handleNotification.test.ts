/**
 * Unit tests for handleNotification feature — IPC wiring + focus routing
 *
 * Display/auto-dismiss/tag de-dupe live in nativeNotification.ts (unit-tested there).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

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

const fromWebContentsMock = vi.fn();
const showNativeNotificationMock = vi.fn().mockReturnValue(true);
const cleanupActiveNativeNotificationsMock = vi.fn();

const ipcMainMock = {
  on: vi.fn(),
  removeListener: vi.fn(),
};

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(vi.fn(), {
    fromWebContents: fromWebContentsMock,
  }),
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

vi.mock('../utils/platform/nativeNotification.js', () => ({
  showNativeNotification: (...args: unknown[]) => showNativeNotificationMock(...args),
  cleanupActiveNativeNotifications: () => cleanupActiveNativeNotificationsMock(),
}));

describe('handleNotification feature', () => {
  let fakeWindow: ReturnType<typeof makeFakeWindow>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    showNativeNotificationMock.mockReturnValue(true);
    fakeWindow = makeFakeWindow();
    fromWebContentsMock.mockReturnValue(null);

    createSecureIPCHandlerMock.mockImplementation(
      (config: {
        channel: string;
        validator: (data: unknown) => unknown;
        rateLimit?: number;
        description?: string;
        handler: (data: unknown, event?: unknown) => void;
      }) => {
        return () => {
          // cleanup
        };
      }
    );
  });

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

  it('forwards validated payload to showNativeNotification with fallback window', async () => {
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

    expect(showNativeNotificationMock).toHaveBeenCalledWith(
      {
        title: 'Test Title',
        body: 'Test body',
        icon: 'test-icon.png',
        tag: 'tag1',
      },
      fakeWindow
    );
  });

  it('uses sender window when fromWebContents resolves', async () => {
    const senderWindow = makeFakeWindow();
    fromWebContentsMock.mockReturnValue(senderWindow);

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationShow'
    )?.[0] as { handler: (data: unknown, event?: unknown) => void };

    handlerConfig.handler({ title: 'From account-1' }, {
      sender: { isDestroyed: () => false },
    });

    expect(showNativeNotificationMock).toHaveBeenCalledWith(
      { title: 'From account-1' },
      senderWindow
    );
  });

  it('NOTIFICATION_CLICKED focuses sender window when not visible', async () => {
    const senderWindow = makeFakeWindow();
    senderWindow.isVisible.mockReturnValue(false);
    senderWindow.isFocused.mockReturnValue(false);
    fromWebContentsMock.mockReturnValue(senderWindow);

    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    const handlerConfig = createSecureIPCHandlerMock.mock.calls.find(
      (call: unknown[]) => (call[0] as { channel: string }).channel === 'notificationClicked'
    )?.[0] as { handler: (data: unknown, event?: unknown) => void };

    handlerConfig.handler(undefined, { sender: { isDestroyed: () => false } });

    expect(senderWindow.show).toHaveBeenCalled();
    expect(senderWindow.focus).toHaveBeenCalled();
  });

  it('cleanupNotificationHandler closes native notifications and removes IPC', async () => {
    const feature = await import('./handleNotification.js');
    feature.default(fakeWindow as unknown as Electron.BrowserWindow);

    feature.cleanupNotificationHandler();

    expect(cleanupActiveNativeNotificationsMock).toHaveBeenCalled();
    expect(() => feature.cleanupNotificationHandler()).not.toThrow();
  });
});
