/**
 * Unit tests for notification focus routing (multi-account / WCV).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromWebContentsMock = vi.fn();
const focusAccountMock = vi.fn();
const getAccountForWebContentsMock = vi.fn();
const getAccountWindowMock = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(vi.fn(), {
    fromWebContents: (...args: unknown[]) => fromWebContentsMock(...args),
  }),
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../lifecycle/featureContextStore.js', () => ({
  getSharedFeatureContext: () => ({
    accountWindowManager: {
      getAccountForWebContents: getAccountForWebContentsMock,
      focusAccount: focusAccountMock,
      getAccountWindow: getAccountWindowMock,
    },
  }),
}));

vi.mock('../../../shared/types/branded.js', () => ({
  asWebContentsId: (id: number) => id,
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

describe('notificationFocus', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fromWebContentsMock.mockReturnValue(null);
    getAccountForWebContentsMock.mockReturnValue(null);
    getAccountWindowMock.mockReturnValue(null);
  });

  it('focusAccount via manager when sender maps to an account', async () => {
    getAccountForWebContentsMock.mockReturnValue(2);
    const { focusNotificationSource } = await import('./notificationFocus.js');
    const fallback = makeWindow();
    const event = { sender: { id: 99, isDestroyed: () => false } };

    focusNotificationSource(event as never, fallback as never);

    expect(getAccountForWebContentsMock).toHaveBeenCalledWith(99);
    expect(focusAccountMock).toHaveBeenCalledWith(2);
    expect(fallback.show).not.toHaveBeenCalled();
  });

  it('falls back to fromWebContents BrowserWindow', async () => {
    const senderWin = makeWindow();
    fromWebContentsMock.mockReturnValue(senderWin);
    const { focusNotificationSource } = await import('./notificationFocus.js');
    const fallback = makeWindow();
    const event = { sender: { id: 1, isDestroyed: () => false } };

    focusNotificationSource(event as never, fallback as never);

    expect(senderWin.show).toHaveBeenCalled();
    expect(senderWin.focus).toHaveBeenCalled();
  });

  it('falls back to fallback window when sender unknown', async () => {
    const { focusNotificationSource } = await import('./notificationFocus.js');
    const fallback = makeWindow();
    focusNotificationSource(undefined, fallback as never);
    expect(fallback.show).toHaveBeenCalled();
    expect(fallback.focus).toHaveBeenCalled();
  });

  it('resolveNotificationFocusWindow prefers account window from manager', async () => {
    const accountWin = makeWindow();
    getAccountForWebContentsMock.mockReturnValue(1);
    getAccountWindowMock.mockReturnValue(accountWin);
    const { resolveNotificationFocusWindow } = await import('./notificationFocus.js');
    const fallback = makeWindow();
    const event = { sender: { id: 5, isDestroyed: () => false } };

    const resolved = resolveNotificationFocusWindow(event as never, fallback as never);
    expect(resolved).toBe(accountWin);
  });
});
