/**
 * Unit tests for badgeHelpers — extracted IPC logic for badgeIcon feature.
 *
 * Covers:
 *   • decideIcon()         — favicon URL → IconType resolution
 *   • updateBadgeIcon()    — macOS dock badge update
 *   • setupBadgeHandlers() — IPC handler registration via registerFastHandler
 *                             with rate limiting + validation.
 *   • Inline caching       — identical consecutive payloads short-circuit
 *                             via last-value comparison (replaces dedup map).
 *   • Burst regression     — rapid identical payloads collapse to one
 *                             downstream call via the inline cache.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSetBadgeCount = vi.fn();
const mockPlatformState = vi.hoisted(() => ({
  supportsDockBadge: true,
  useTemplateTrayIcon: true,
}));
vi.mock('electron', () => ({
  app: { setBadgeCount: mockSetBadgeCount },
  BrowserWindow: vi.fn(),
  Tray: vi.fn(),
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeListener: vi.fn(),
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

const mockGetIcon = vi.fn().mockReturnValue('/fake/icon.png');
vi.mock('./iconCache.js', () => ({
  getIconCache: () => ({ getIcon: mockGetIcon }),
}));

const mockSetTrayUnread = vi.fn();
vi.mock('./trayIconState.js', () => ({
  setTrayUnread: mockSetTrayUnread,
}));

vi.mock('./platformDetection.js', () => ({
  platform: {
    config: mockPlatformState,
  },
}));

vi.mock('../../../shared/dataValidators.js', () => ({
  validateFaviconURL: vi.fn((url: string) => url),
  validateUnreadCount: vi.fn((count: number) => count),
}));

const mockConfigGet = vi.fn().mockReturnValue(false);
vi.mock('../../config.js', () => ({
  configGet: (...args: unknown[]) => mockConfigGet(...args),
}));

const mockShowNativeNotification = vi.fn().mockReturnValue(true);
const mockWasBridgeRecently = vi.fn().mockReturnValue(false);
const mockEnsureNotificationPermission = vi.fn().mockReturnValue('already-requested');
const mockResolveFocusWindow = vi.fn((event: unknown, fallback: unknown) => fallback);
const mockResolveAccount = vi.fn().mockReturnValue(0);
const mockBuildPayload = vi.fn((opts: Record<string, unknown>) => ({
  title: opts['title'],
  body: opts['body'],
  tag: `a0:${opts['chatTag']}`,
  subtitle: 'Account 1',
  groupId: 'gogchat-account-0',
}));
vi.mock('./nativeNotification.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./nativeNotification.js')>();
  return {
    ...actual,
    showNativeNotification: (...args: unknown[]) => mockShowNativeNotification(...args),
    wasBridgeNotificationRecentlyShown: (...args: unknown[]) => mockWasBridgeRecently(...args),
    buildAccountAwareNotificationPayload: (...args: unknown[]) =>
      mockBuildPayload(...(args as [Record<string, unknown>])),
  };
});
vi.mock('./accountNotificationIdentity.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./accountNotificationIdentity.js')>();
  return {
    ...actual,
    resolveAccountIndexFromIpcEvent: (...args: unknown[]) => mockResolveAccount(...args),
  };
});
vi.mock('./notificationFocus.js', () => ({
  resolveNotificationFocusWindow: (...args: unknown[]) => mockResolveFocusWindow(...args),
  focusNotificationSource: vi.fn(),
}));
vi.mock('../security/notificationAccess.js', () => ({
  ensureNotificationPermission: (...args: unknown[]) => mockEnsureNotificationPermission(...args),
}));

function fakeWindow(overrides: { isFocused?: boolean } = {}) {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    isFocused: vi.fn().mockReturnValue(overrides.isFocused ?? false),
  } as unknown as Electron.BrowserWindow;
}
function fakeTray() {
  return { setImage: vi.fn() } as unknown as Electron.Tray;
}

// ─── Config-shape tests (mocked registerFastHandler) ─────────────────────────

describe('badgeHelpers (config wiring)', () => {
  const mockRegisterFastHandler = vi.fn().mockReturnValue(vi.fn());

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../ipc/ipcFastPath.js', () => ({
      registerFastHandler: (cfg: unknown) => mockRegisterFastHandler(cfg),
    }));
    mockRegisterFastHandler.mockClear();
    mockRegisterFastHandler.mockReturnValue(vi.fn());
    mockSetBadgeCount.mockClear();
    mockGetIcon.mockReturnValue('/fake/icon.png');
    mockSetTrayUnread.mockClear();
    mockShowNativeNotification.mockClear();
    mockWasBridgeRecently.mockClear();
    mockWasBridgeRecently.mockReturnValue(false);
    mockEnsureNotificationPermission.mockClear();
    mockResolveFocusWindow.mockImplementation((_e: unknown, fb: unknown) => fb);
    mockResolveAccount.mockReturnValue(0);
    mockBuildPayload.mockClear();
    mockConfigGet.mockReturnValue(false);
    mockPlatformState.supportsDockBadge = true;
    mockPlatformState.useTemplateTrayIcon = true;
  });

  afterEach(() => {
    vi.doUnmock('../ipc/ipcFastPath.js');
  });

  describe('decideIcon', () => {
    it('returns NORMAL or BADGE for matching favicons, OFFLINE otherwise', async () => {
      const { decideIcon } = await import('./badgeHelpers.js');
      const { ICON_TYPES } = await import('../../../shared/constants.js');
      expect(decideIcon('https://example.com/something-random.png')).toBe(ICON_TYPES.OFFLINE);
      expect(decideIcon('https://mail.google.com/favicon.ico')).toBeDefined();
    });
  });

  describe('updateBadgeIcon', () => {
    it('forwards the count to app.setBadgeCount on macOS', async () => {
      const { updateBadgeIcon } = await import('./badgeHelpers.js');
      updateBadgeIcon(fakeWindow(), 7);
      expect(mockSetBadgeCount).toHaveBeenCalledWith(7);
    });

    it('does not claim a Windows taskbar badge when platform support is disabled', async () => {
      mockPlatformState.supportsDockBadge = false;

      const { updateBadgeIcon } = await import('./badgeHelpers.js');
      updateBadgeIcon(fakeWindow(), 7);

      expect(mockSetBadgeCount).not.toHaveBeenCalled();
    });
  });

  describe('setupBadgeHandlers', () => {
    it('registers FAVICON_CHANGED handler with validator and rate limit', async () => {
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(mockRegisterFastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'faviconChanged',
          validator: expect.any(Function),
          handler: expect.any(Function),
          rateLimit: 5,
        })
      );
    });

    it('registers UNREAD_COUNT handler with validator and rate limit', async () => {
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(mockRegisterFastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'unreadCount',
          validator: expect.any(Function),
          handler: expect.any(Function),
          rateLimit: 5,
        })
      );
    });

    it('returns cleanup callbacks for both handlers', async () => {
      const faviconCleanupFn = vi.fn();
      const unreadCleanupFn = vi.fn();
      mockRegisterFastHandler
        .mockReturnValueOnce(faviconCleanupFn)
        .mockReturnValueOnce(unreadCleanupFn);

      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      const { faviconCleanup, unreadCleanup } = setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(faviconCleanup).toBe(faviconCleanupFn);
      expect(unreadCleanup).toBe(unreadCleanupFn);
    });

    it('short-circuits identical consecutive FAVICON_CHANGED payloads (inline cache)', async () => {
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const faviconCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'faviconChanged'
      )?.[0] as { handler: (v: string) => void };

      mockSetTrayUnread.mockClear();
      faviconCfg.handler('https://mail.google.com/favicon_chat_new_notif_r2.ico');
      faviconCfg.handler('https://mail.google.com/favicon_chat_new_notif_r2.ico');
      faviconCfg.handler('https://mail.google.com/favicon_chat_new_notif_r2.ico');

      // setTrayUnread runs inside the handler body — should be called once
      expect(mockSetTrayUnread).toHaveBeenCalledTimes(1);
    });

    it('short-circuits identical consecutive UNREAD_COUNT payloads (inline cache)', async () => {
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };

      unreadCfg.handler(7);
      unreadCfg.handler(7);
      unreadCfg.handler(7);

      expect(mockSetBadgeCount).toHaveBeenCalledTimes(1);
      expect(mockSetBadgeCount).toHaveBeenCalledWith(7);
    });

    it('handler updates dock badge and tray when invoked', async () => {
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(5);

      expect(mockSetBadgeCount).toHaveBeenCalledWith(5);
      expect(mockSetTrayUnread).toHaveBeenCalledWith(true);
    });

    it('handler clears tray unread when count is 0', async () => {
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(0);

      expect(mockSetTrayUnread).toHaveBeenCalledWith(false);
    });

    it('does not show unread-delta notification when flag is off', async () => {
      mockConfigGet.mockReturnValue(false);
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow({ isFocused: false }), fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number, e?: unknown) => void };
      const event = { sender: { id: 1 } };
      unreadCfg.handler(1, event);
      unreadCfg.handler(2, event);

      expect(mockShowNativeNotification).not.toHaveBeenCalled();
    });

    it('shows unread-delta notification on unfocused increase when enabled', async () => {
      mockConfigGet.mockImplementation((key: string) => key === 'app.unreadDeltaNotifications');
      const win = fakeWindow({ isFocused: false });
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(win, fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number, e?: unknown) => void };
      const event = { sender: { id: 9 } };
      unreadCfg.handler(1, event);
      expect(mockShowNativeNotification).not.toHaveBeenCalled(); // first observation

      unreadCfg.handler(3, event);
      expect(mockEnsureNotificationPermission).toHaveBeenCalled();
      expect(mockBuildPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'GogChat',
          body: 'You have 3 unread messages',
          chatTag: 'gogchat-unread-delta',
          accountIndex: 0,
        })
      );
      expect(mockShowNativeNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          subtitle: 'Account 1',
          tag: 'a0:gogchat-unread-delta',
        }),
        expect.objectContaining({
          focusWindow: win,
          ipcEvent: event,
          source: 'unread-delta',
          accountIndex: 0,
        })
      );
    });

    it('sums per-account unread for dock badge and caps display at 99', async () => {
      mockResolveAccount.mockReturnValueOnce(0).mockReturnValueOnce(1);
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number, e?: unknown) => void };

      unreadCfg.handler(40, { sender: { id: 1 } });
      unreadCfg.handler(70, { sender: { id: 2 } });

      // sum 110 → display 99
      expect(mockSetBadgeCount).toHaveBeenLastCalledWith(99);
    });

    it('skips unread-delta notification when window is focused', async () => {
      mockConfigGet.mockImplementation((key: string) => key === 'app.unreadDeltaNotifications');
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow({ isFocused: true }), fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number, e?: unknown) => void };
      unreadCfg.handler(1, {});
      unreadCfg.handler(2, {});

      expect(mockShowNativeNotification).not.toHaveBeenCalled();
    });

    it('skips unread-delta when bridge cooldown is active', async () => {
      mockConfigGet.mockImplementation((key: string) => key === 'app.unreadDeltaNotifications');
      mockWasBridgeRecently.mockReturnValue(true);
      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow({ isFocused: false }), fakeTray());

      const unreadCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number, e?: unknown) => void };
      unreadCfg.handler(1, {});
      unreadCfg.handler(2, {});

      expect(mockShowNativeNotification).not.toHaveBeenCalled();
    });

    it('uses the favicon icon variant on Windows-style tray icons without template unread toggles', async () => {
      mockPlatformState.useTemplateTrayIcon = false;
      const tray = fakeTray();

      const { setupBadgeHandlers } = await import('./badgeHelpers.js');
      setupBadgeHandlers(fakeWindow(), tray);

      const faviconCfg = mockRegisterFastHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'faviconChanged'
      )?.[0] as { handler: (v: string) => void };
      faviconCfg.handler('https://mail.google.com/favicon_chat_r2.ico');

      expect(mockSetTrayUnread).not.toHaveBeenCalled();
      expect(mockGetIcon).toHaveBeenCalledWith(expect.stringMatching(/^resources\/icons\//));
      expect(tray.setImage).toHaveBeenCalledWith('/fake/icon.png');
    });
  });
});

// ─── Burst regression test (real ipcFastPath + ipcMain.on) ───────────────────
// Asserts that two/many rapid identical payloads collapse to a single
// downstream handler invocation via the inline last-value cache.
describe('badgeHelpers (burst regression with real ipcFastPath)', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockSetBadgeCount.mockClear();
    mockSetTrayUnread.mockClear();
    mockShowNativeNotification.mockClear();
    mockConfigGet.mockReturnValue(false);
    mockPlatformState.supportsDockBadge = true;
    mockPlatformState.useTemplateTrayIcon = true;
    const { getRateLimiter } = await import('../ipc/rateLimiter.js');
    getRateLimiter().resetAll();
  });

  it('collapses 2 rapid identical UNREAD_COUNT payloads into 1 downstream call', async () => {
    const { ipcMain } = await import('electron');
    const { setupBadgeHandlers } = await import('./badgeHelpers.js');

    setupBadgeHandlers(fakeWindow(), fakeTray());

    // The most recently registered ipcMain.on call corresponds to UNREAD_COUNT
    // (FAVICON_CHANGED is registered first, UNREAD_COUNT second).
    const onMock = ipcMain.on as unknown as ReturnType<typeof vi.fn>;
    const unreadCall = onMock.mock.calls.find(([ch]) => ch === 'unreadCount');
    expect(unreadCall).toBeDefined();
    const unreadHandler = unreadCall![1] as (e: IpcMainEvent, d: unknown) => void;

    const event = {} as IpcMainEvent;
    unreadHandler(event, 3);
    unreadHandler(event, 3);
    await new Promise((r) => setImmediate(r));

    // Only ONE downstream invocation despite two events
    expect(mockSetBadgeCount).toHaveBeenCalledTimes(1);
    expect(mockSetBadgeCount).toHaveBeenCalledWith(3);
  });

  it('does NOT deduplicate UNREAD_COUNT payloads with different values', async () => {
    const { ipcMain } = await import('electron');
    const { setupBadgeHandlers } = await import('./badgeHelpers.js');

    setupBadgeHandlers(fakeWindow(), fakeTray());
    const onMock = ipcMain.on as unknown as ReturnType<typeof vi.fn>;
    const unreadCall = onMock.mock.calls.find(([ch]) => ch === 'unreadCount');
    const unreadHandler = unreadCall![1] as (e: IpcMainEvent, d: unknown) => void;

    const event = {} as IpcMainEvent;
    // Different payloads → different dedup keys → both should execute.
    unreadHandler(event, 1);
    unreadHandler(event, 2);
    await new Promise((r) => setImmediate(r));

    expect(mockSetBadgeCount).toHaveBeenCalledTimes(2);
    expect(mockSetBadgeCount).toHaveBeenNthCalledWith(1, 1);
    expect(mockSetBadgeCount).toHaveBeenNthCalledWith(2, 2);
  });

  it('collapses rapid identical FAVICON_CHANGED payloads into 1 downstream call', async () => {
    const { ipcMain } = await import('electron');
    const { setupBadgeHandlers } = await import('./badgeHelpers.js');

    const { getRateLimiter } = await import('../ipc/rateLimiter.js');
    getRateLimiter().resetAll();
    setupBadgeHandlers(fakeWindow(), fakeTray());

    const onMock = ipcMain.on as unknown as ReturnType<typeof vi.fn>;
    const faviconCall = onMock.mock.calls.find(([ch]) => ch === 'faviconChanged');
    expect(faviconCall).toBeDefined();
    const faviconHandler = faviconCall![1] as (e: IpcMainEvent, d: unknown) => void;

    const event = {} as IpcMainEvent;
    faviconHandler(event, 'https://example.com/x.ico');
    faviconHandler(event, 'https://example.com/x.ico');
    await new Promise((r) => setImmediate(r));

    // setTrayUnread runs inside the handler body — should be called once
    expect(mockSetTrayUnread).toHaveBeenCalledTimes(1);
  });
});
