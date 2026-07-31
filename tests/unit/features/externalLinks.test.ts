/**
 * External Links Feature Unit Tests
 * Focused on routeAccountUrl bootstrap guard — prevents re-navigating a window
 * that is already mid-auth on accounts.google.com.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { electronMock, MockBrowserWindow } from '../../mocks/electron';

// ── Electron mock (MUST be first) ─────────────────────────────────────────────
vi.mock('electron', () => electronMock);

// ── electron-log stub ────────────────────────────────────────────────────────
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── shared/constants stub ────────────────────────────────────────────────────
vi.mock('../../../src/shared/constants', () => ({
  URL_PATTERNS: {
    DOWNLOAD: '/uc?export=download',
    CHAT_PREFIX: 'https://mail.google.com/chat',
  },
  TIMING: {
    EXTERNAL_LINKS_REGUARD: 300_000, // 5 min
  },
}));

// ── shared/validators stub ───────────────────────────────────────────────────
vi.mock('../../../src/shared/validators', () => ({
  validateExternalURL: (url: string) => url,
  isWhitelistedHost: () => true,
  isGoogleAuthUrl: (url: unknown) => {
    if (typeof url !== 'string') return false;
    try {
      const p = new URL(url);
      return p.protocol === 'https:' && p.hostname === 'accounts.google.com';
    } catch {
      return false;
    }
  },
}));

// ── resourceCleanup stub ─────────────────────────────────────────────────────
vi.mock('../../../src/main/utils/lifecycle/resourceCleanup', () => ({
  createTrackedInterval: (cb: () => void, ms: number) => setInterval(cb, ms),
}));

// ── accountWindowManager stub ─────────────────────────────────────────────────
// Controlled mocks — set per test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetAccountIndex = vi.fn();
const mockGetWindowForAccount = vi.fn();
const mockCreateAccountWindow = vi.fn();
const mockIsBootstrap = vi.fn();
const mockMarkAsBootstrap = vi.fn();
const mockWatchBootstrapAccount = vi.fn();

vi.mock('../../../src/main/utils/account/accountWindowManager', () => ({
  getAccountIndex: (...args: unknown[]) => mockGetAccountIndex(...args),
  getWindowForAccount: (...args: unknown[]) => mockGetWindowForAccount(...args),
  createAccountWindow: (...args: unknown[]) => mockCreateAccountWindow(...args),
  getAccountWindowManager: () => ({
    isBootstrap: (...args: unknown[]) => mockIsBootstrap(...args),
    markAsBootstrap: (...args: unknown[]) => mockMarkAsBootstrap(...args),
  }),
}));

vi.mock('../../../src/main/utils/account/bootstrapWatcher', () => ({
  watchBootstrapAccount: (...args: unknown[]) => mockWatchBootstrapAccount(...args),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeWindow(currentUrl = 'https://chat.google.com/u/0/'): MockBrowserWindow {
  const w = new MockBrowserWindow();
  const originalOn = w.webContents.on.bind(w.webContents);
  // Override stubs that aren't on MockBrowserWindow by default
  (w.webContents as unknown as Record<string, unknown>).getURL = vi.fn(() => currentUrl);
  (w.webContents as unknown as Record<string, unknown>).on = vi.fn(originalOn);
  (w as unknown as Record<string, unknown>).isDestroyed = vi.fn(() => false);
  (w as unknown as Record<string, unknown>).isMinimized = vi.fn(() => false);
  (w as unknown as Record<string, unknown>).show = vi.fn();
  (w as unknown as Record<string, unknown>).focus = vi.fn();
  (w as unknown as Record<string, unknown>).restore = vi.fn();
  (w as unknown as Record<string, unknown>).loadURL = vi.fn();
  return w;
}

// ── import the module under test (after all mocks) ─────────────────────────

// We test via the exported will-navigate binding. The default export wires
// will-navigate to routeAccountUrl, so we drive the test by invoking the
// listener directly (no real Electron events needed).
import type { BrowserWindow } from 'electron';

// We need to capture the will-navigate handler that the default export attaches.
// We do this by inspecting the calls to webContents.on after running the default
// export.
import { installExternalLinkGuards } from '../../../src/main/features/externalLinks';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('routeAccountUrl — bootstrap guard', () => {
  let sourceWindow: MockBrowserWindow;

  beforeEach(() => {
    electronMock.reset();
    vi.clearAllMocks();

    // Source window is account 0 (the main Chat window)
    sourceWindow = makeWindow('https://chat.google.com/u/0/');
    mockGetAccountIndex.mockReturnValue(0);
  });

  /**
   * Helper: install guards and invoke will-navigate with a synthetic URL.
   */
  function navigate(
    window: MockBrowserWindow,
    url: string
  ): { preventDefaultSpy: ReturnType<typeof vi.fn> } {
    const preventDefaultSpy = vi.fn();
    installExternalLinkGuards(
      window.webContents as unknown as Electron.WebContents,
      window as unknown as BrowserWindow
    );

    // Find the will-navigate listener registered on this window's webContents.on
    const onMock = window.webContents.on as ReturnType<typeof vi.fn>;
    const entry = (onMock.mock.calls as unknown[][]).find((c) => c[0] === 'will-navigate');
    if (!entry || typeof entry[1] !== 'function') {
      throw new Error('will-navigate handler not registered');
    }
    const handler = entry[1] as (ev: { preventDefault: () => void }, url: string) => void;
    handler({ preventDefault: preventDefaultSpy }, url);
    return { preventDefaultSpy };
  }

  it('shows/focuses existing bootstrap auth window and does NOT call loadURL', () => {
    const authWindow = makeWindow('https://accounts.google.com/signin/v2/identifier');
    mockGetWindowForAccount.mockReturnValue(authWindow);
    mockIsBootstrap.mockReturnValue(true);

    const { preventDefaultSpy } = navigate(sourceWindow, 'https://chat.google.com/u/1/some-room');

    expect(authWindow.show).toHaveBeenCalled();
    expect(authWindow.focus).toHaveBeenCalled();
    expect(
      (authWindow as unknown as Record<string, ReturnType<typeof vi.fn>>).loadURL
    ).not.toHaveBeenCalled();
    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(mockMarkAsBootstrap).not.toHaveBeenCalled();
  });

  it('calls loadURL for a bootstrap window that is NOT on a Google auth URL', () => {
    const nonAuthWindow = makeWindow('https://chat.google.com/u/1/');
    mockGetWindowForAccount.mockReturnValue(nonAuthWindow);
    mockIsBootstrap.mockReturnValue(true);

    navigate(sourceWindow, 'https://chat.google.com/u/1/some-room');

    // loadURL should be called because the current URL differs from the target
    expect(
      (nonAuthWindow as unknown as Record<string, ReturnType<typeof vi.fn>>).loadURL
    ).toHaveBeenCalled();
  });

  it('marks a newly created secondary window as bootstrap', () => {
    // No existing window for account 1 → createAccountWindow is called
    mockGetWindowForAccount.mockReturnValue(null);
    const newWindow = makeWindow('https://chat.google.com/u/1/');
    mockCreateAccountWindow.mockReturnValue(newWindow);

    navigate(sourceWindow, 'https://chat.google.com/u/1/some-room');

    expect(mockCreateAccountWindow).toHaveBeenCalledWith(
      'https://chat.google.com/u/1/some-room',
      1
    );
    expect(mockMarkAsBootstrap).toHaveBeenCalledWith(1);
  });

  it('does NOT mark an already-registered window as bootstrap on re-route', () => {
    const existingWindow = makeWindow('https://chat.google.com/u/1/');
    mockGetWindowForAccount.mockReturnValue(existingWindow);
    mockIsBootstrap.mockReturnValue(false);

    navigate(sourceWindow, 'https://chat.google.com/u/1/some-room');

    // Window already existed — must NOT call markAsBootstrap
    expect(mockMarkAsBootstrap).not.toHaveBeenCalled();
  });

  it('returns false (no redirect) when source and target are the same account', () => {
    // Target URL is also account 0
    const { preventDefaultSpy } = navigate(sourceWindow, 'https://chat.google.com/u/0/some-room');

    // routeAccountUrl returns false → event.preventDefault must NOT be called
    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it('restores a minimized bootstrap auth window before show/focus, and skips loadURL', () => {
    const authWindow = makeWindow('https://accounts.google.com/o/oauth2/auth');
    (authWindow as unknown as Record<string, unknown>).isMinimized = vi.fn(() => true);
    mockGetWindowForAccount.mockReturnValue(authWindow);
    mockIsBootstrap.mockReturnValue(true);

    navigate(sourceWindow, 'https://chat.google.com/u/1/some-room');

    expect(
      (authWindow as unknown as Record<string, ReturnType<typeof vi.fn>>).restore
    ).toHaveBeenCalled();
    expect(authWindow.show).toHaveBeenCalled();
    expect(
      (authWindow as unknown as Record<string, ReturnType<typeof vi.fn>>).loadURL
    ).not.toHaveBeenCalled();
  });

  it('does NOT re-show or re-focus the source window after routing to secondary account', () => {
    const targetWindow = makeWindow('https://chat.google.com/u/1/');
    mockGetWindowForAccount.mockReturnValue(targetWindow);
    mockIsBootstrap.mockReturnValue(false);

    navigate(sourceWindow, 'https://chat.google.com/u/1/some-room');

    // Source window should NOT be shown or focused — only the target window
    expect(sourceWindow.show).not.toHaveBeenCalled();
    expect(sourceWindow.focus).not.toHaveBeenCalled();
    // Target window SHOULD be shown and focused
    expect(targetWindow.show).toHaveBeenCalled();
    expect(targetWindow.focus).toHaveBeenCalled();
  });
});
