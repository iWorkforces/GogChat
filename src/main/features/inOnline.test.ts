/**
 * Unit tests for inOnline (connectivity monitoring) feature.
 *
 * Tests the public API: default export (IPC setup), cleanup,
 * and exported functions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Fake BrowserWindow ───────────────────────────────────────────────────────

function makeFakeWindow(url = '') {
  const wc = new EventEmitter() as EventEmitter & {
    getURL: () => string;
    send: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
  };
  wc.getURL = vi.fn(() => url);
  wc.send = vi.fn();
  wc.loadURL = vi.fn().mockResolvedValue(undefined);

  const win = new EventEmitter() as unknown as Electron.BrowserWindow & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    show: () => void;
    _destroyed: boolean;
  };
  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.show = vi.fn();
  win.loadURL = vi.fn().mockResolvedValue(undefined);
  return win;
}

// ─── Mock electron ────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn().mockReturnValue('/Applications/GogChat.app'),
  },
  BrowserWindow: vi.fn(),
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  })),
  ipcMain: {
    on: vi.fn(),
    removeListener: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock rateLimiter
const mockRateLimiter = {
  isAllowed: vi.fn().mockReturnValue(true),
};
vi.mock('../utils/ipc/rateLimiter.js', () => ({
  getRateLimiter: () => mockRateLimiter,
}));

// Mock iconCache
const mockGetIcon = vi.fn().mockReturnValue('/fake/icon.png');
vi.mock('../utils/platform/iconCache.js', () => ({
  getIconCache: () => ({ getIcon: mockGetIcon }),
}));

// Mock defineIPC
const mockDefineIPC = vi.fn().mockReturnValue(vi.fn());
vi.mock('../utils/ipc/defineIPC.js', () => ({
  defineIPC: mockDefineIPC,
}));

// Mock path
vi.mock('path', () => ({
  default: { join: vi.fn((...args: string[]) => args.join('/')) },
}));

vi.mock('fs', () => ({
  default: { existsSync: vi.fn(() => true) },
}));

describe('inOnline feature', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRateLimiter.isAllowed.mockReturnValue(true);
    mockDefineIPC.mockReturnValue(vi.fn());
    mockGetIcon.mockReturnValue('/fake/icon.png');
  });

  // ── IPC handler ───────────────────────────────────────────────────────────

  describe('default export (IPC setup)', () => {
    it('registers CHECK_IF_ONLINE handler', async () => {
      mockDefineIPC.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);

      expect(mockDefineIPC).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'checkIfOnline' })
      );
    });

    it('returns undefined (no cleanup from default export)', async () => {
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      const result = feature.default(win);

      expect(result).toBeUndefined();
    });
  });

  // ── cleanupConnectivityHandler ────────────────────────────────────────────

  describe('cleanupConnectivityHandler', () => {
    it('does not throw when called with no handlers', async () => {
      const feature = await import('./inOnline.js');
      expect(() => feature.cleanupConnectivityHandler()).not.toThrow();
    });

    it('calls cleanup function if registered', async () => {
      const cleanupFn = vi.fn();
      mockDefineIPC.mockReturnValue(cleanupFn);

      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);
      feature.cleanupConnectivityHandler();

      expect(cleanupFn).toHaveBeenCalled();
    });

    it('is idempotent (can be called twice)', async () => {
      const cleanupFn = vi.fn();
      mockDefineIPC.mockReturnValue(cleanupFn);

      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);
      feature.cleanupConnectivityHandler();

      expect(() => feature.cleanupConnectivityHandler()).not.toThrow();
    });
  });

  // ── checkForInternet ──────────────────────────────────────────────────────

  describe('checkForInternet', () => {
    it('is exported and callable', async () => {
      const mod = await import('./inOnline.js');
      expect(mod.checkForInternet).toBeDefined();
      expect(typeof mod.checkForInternet).toBe('function');
    });

    it('does not load the offline page when fetch reports online', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true })
      );
      const win = makeFakeWindow('https://mail.google.com/chat/u/0');
      const mod = await import('./inOnline.js');
      await mod.checkForInternet(win as unknown as Electron.BrowserWindow);
      expect(win.webContents.loadURL).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('loads the offline page after a confirmed offline probe', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('offline'))
      );
      const win = makeFakeWindow('https://mail.google.com/chat/u/0');
      const mod = await import('./inOnline.js');
      await mod.checkForInternet(win as unknown as Electron.BrowserWindow);
      expect(win.loadURL).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('stays on the current page when the confirmation probe succeeds', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      const win = makeFakeWindow('https://mail.google.com/chat/u/0');
      const mod = await import('./inOnline.js');
      await mod.checkForInternet(win as unknown as Electron.BrowserWindow);
      expect(win.loadURL).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('notifies without navigating when the offline page is missing', async () => {
      const fs = await import('fs');
      vi.mocked(fs.default.existsSync).mockReturnValueOnce(false);
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
      const win = makeFakeWindow('https://mail.google.com/chat/u/0');
      const mod = await import('./inOnline.js');
      await mod.checkForInternet(win as unknown as Electron.BrowserWindow);
      expect(win.loadURL).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('IPC handler replies', () => {
    it('replies true when fetch succeeds and skips events without reply', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const feature = await import('./inOnline.js');
      feature.default(win);
      const cfg = mockDefineIPC.mock.calls[0]?.[0] as {
        handler: (data: unknown, event: { reply?: (ch: string, v: boolean) => void }) => void;
        validator: (data: unknown) => unknown;
      };
      expect(cfg.validator(undefined)).toBeUndefined();
      cfg.handler(undefined, {});
      const event = { reply: vi.fn() };
      cfg.handler(undefined, event);
      await vi.waitFor(() =>
        expect(event.reply).toHaveBeenCalledWith('onlineStatus', true)
      );
      vi.unstubAllGlobals();
    });

    it('replies false when the probe rejects', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue('down'));
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const feature = await import('./inOnline.js');
      feature.default(win);
      const cfg = mockDefineIPC.mock.calls[0]?.[0] as {
        handler: (data: unknown, event: { reply: (ch: string, v: boolean) => void }) => void;
      };
      const event = { reply: vi.fn() };
      cfg.handler(undefined, event);
      await vi.waitFor(() =>
        expect(event.reply).toHaveBeenCalledWith('onlineStatus', false)
      );
      vi.unstubAllGlobals();
    });
  });

  // ── IPC handler configuration ─────────────────────────────────────────────

  describe('IPC handler configuration', () => {
    it('handler includes validator', async () => {
      mockDefineIPC.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);

      expect(mockDefineIPC).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'checkIfOnline',
          validator: expect.any(Function),
        })
      );
    });

    it('handler includes rate limiting', async () => {
      mockDefineIPC.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);

      expect(mockDefineIPC).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'checkIfOnline',
          rateLimit: expect.any(Number),
        })
      );
      expect(mockDefineIPC.mock.calls[0]?.[0]).not.toHaveProperty('deduplicate', true);
    });
  });
});
