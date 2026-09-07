// @vitest-environment jsdom

/**
 * Offline preload recovery: false replies must not reload; true replaces once.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: { send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

const appUrl = 'https://mail.google.com/chat/u/0';

vi.mock('../urls.js', () => ({
  default: { appUrl: 'https://mail.google.com/chat/u/0' },
}));

import {
  handleOnlineStatus,
  handleCheckOnline,
  installOffline,
  clearOfflineCheck,
  ONLINE_CHECK_FAILED_EVENT,
  ONLINE_CHECK_DEADLINE_MS,
} from './offline.js';

describe('preload offline recovery', () => {
  let locationReplace: ReturnType<typeof vi.fn>;
  let locationReload: ReturnType<typeof vi.fn>;
  let failedEventCount: number;
  let onFailed: () => void;

  beforeEach(() => {
    locationReplace = vi.fn();
    locationReload = vi.fn();
    failedEventCount = 0;
    onFailed = () => {
      failedEventCount += 1;
    };

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        replace: locationReplace,
        reload: locationReload,
        href: 'file:///offline.html',
      },
    });

    window.addEventListener(ONLINE_CHECK_FAILED_EVENT, onFailed);
  });

  afterEach(() => {
    window.removeEventListener(ONLINE_CHECK_FAILED_EVENT, onFailed);
    clearOfflineCheck();
    vi.useRealTimers();
  });

  it('does not reload on false online-status replies and signals the offline page', () => {
    handleOnlineStatus({ attemptId: handleCheckOnline(), online: false });
    handleOnlineStatus({ attemptId: handleCheckOnline(), online: false });
    handleOnlineStatus({ attemptId: handleCheckOnline(), online: false });

    expect(locationReload).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
    expect(failedEventCount).toBe(3);
  });

  it('replaces with app URL exactly once on the current successful attempt', () => {
    handleOnlineStatus({ attemptId: handleCheckOnline(), online: false });
    handleOnlineStatus({ attemptId: handleCheckOnline(), online: true });

    expect(locationReload).not.toHaveBeenCalled();
    expect(locationReplace).toHaveBeenCalledTimes(1);
    expect(locationReplace).toHaveBeenCalledWith(appUrl);
    expect(failedEventCount).toBe(1);
  });

  it('ignores an older result after a newer retry begins', () => {
    const first = handleCheckOnline();
    const second = handleCheckOnline();
    handleOnlineStatus({ attemptId: first, online: true });
    expect(locationReplace).not.toHaveBeenCalled();
    expect(failedEventCount).toBe(0);

    handleOnlineStatus({ attemptId: second, online: false });
    expect(locationReplace).not.toHaveBeenCalled();
    expect(failedEventCount).toBe(1);
  });

  it('ignores an unknown attemptId so it cannot clear the deadline or navigate', () => {
    vi.useFakeTimers();
    handleCheckOnline();
    handleOnlineStatus({ attemptId: 'unknown', online: true });
    handleOnlineStatus({ attemptId: 'unknown', online: false });
    expect(locationReplace).not.toHaveBeenCalled();
    expect(failedEventCount).toBe(0);
    vi.advanceTimersByTime(ONLINE_CHECK_DEADLINE_MS);
    expect(failedEventCount).toBe(1);
    expect(locationReload).not.toHaveBeenCalled();
  });

  it('ignores a stale response after the 6s deadline', () => {
    vi.useFakeTimers();
    const attemptId = handleCheckOnline();
    vi.advanceTimersByTime(ONLINE_CHECK_DEADLINE_MS);
    expect(failedEventCount).toBe(1);
    handleOnlineStatus({ attemptId, online: true });
    handleOnlineStatus({ attemptId, online: false });
    expect(locationReplace).not.toHaveBeenCalled();
    expect(failedEventCount).toBe(1);
    expect(locationReload).not.toHaveBeenCalled();
  });

  it('forwards checkIfOnline through the bridge with the current attemptId', () => {
    const checkIfOnline = vi.fn();
    window.gogchat = {
      sendUnreadCount: vi.fn(),
      sendFaviconChanged: vi.fn(),
      sendNotificationClicked: vi.fn(),
      checkIfOnline,
      reportPasskeyFailure: vi.fn(),
      onSearchShortcut: vi.fn(() => () => {}),
      onOnlineStatus: vi.fn(() => () => {}),
    };
    const attemptId = handleCheckOnline();
    expect(checkIfOnline).toHaveBeenCalledTimes(1);
    expect(checkIfOnline).toHaveBeenCalledWith(attemptId);
  });

  it('dispatches one failure event when the 6s deadline elapses', () => {
    vi.useFakeTimers();
    handleCheckOnline();
    expect(failedEventCount).toBe(0);
    vi.advanceTimersByTime(ONLINE_CHECK_DEADLINE_MS);
    expect(failedEventCount).toBe(1);
    vi.advanceTimersByTime(ONLINE_CHECK_DEADLINE_MS);
    expect(failedEventCount).toBe(1);
    expect(locationReload).not.toHaveBeenCalled();
  });

  it('clears the deadline on a false response so timeout does not fire', () => {
    vi.useFakeTimers();
    const attemptId = handleCheckOnline();
    handleOnlineStatus({ attemptId, online: false });
    vi.advanceTimersByTime(ONLINE_CHECK_DEADLINE_MS);
    expect(failedEventCount).toBe(1);
    expect(locationReload).not.toHaveBeenCalled();
  });

  it('unload cancels the deadline and ignores a later status for that attempt', () => {
    vi.useFakeTimers();
    const checkIfOnline = vi.fn();
    const listeners: Array<(status: { attemptId: string; online: boolean }) => void> = [];
    window.gogchat = {
      sendUnreadCount: vi.fn(),
      sendFaviconChanged: vi.fn(),
      sendNotificationClicked: vi.fn(),
      checkIfOnline,
      reportPasskeyFailure: vi.fn(),
      onSearchShortcut: vi.fn(() => () => {}),
      onOnlineStatus: (callback) => {
        listeners.push(callback);
        return () => {
          const index = listeners.indexOf(callback);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        };
      },
    };

    installOffline();
    window.dispatchEvent(new Event('DOMContentLoaded'));
    window.dispatchEvent(new Event('app:checkIfOnline'));
    const attemptId = checkIfOnline.mock.calls[0]?.[0] as string;
    expect(attemptId).toEqual(expect.any(String));

    window.dispatchEvent(new Event('beforeunload'));
    listeners[0]?.({ attemptId, online: true });
    vi.advanceTimersByTime(ONLINE_CHECK_DEADLINE_MS);
    expect(locationReplace).not.toHaveBeenCalled();
    expect(failedEventCount).toBe(0);
    expect(locationReload).not.toHaveBeenCalled();
  });

  it('falls back to ipcRenderer when the gogchat bridge is absent', async () => {
    const { ipcRenderer } = await import('electron');
    const { IPC_CHANNELS } = await import('../shared/constants.js');
    delete (window as { gogchat?: unknown }).gogchat;
    vi.mocked(ipcRenderer.on).mockClear();
    vi.mocked(ipcRenderer.send).mockClear();
    vi.mocked(ipcRenderer.removeListener).mockClear();

    installOffline();
    window.dispatchEvent(new Event('DOMContentLoaded'));
    expect(ipcRenderer.on).toHaveBeenCalledWith(IPC_CHANNELS.ONLINE_STATUS, expect.any(Function));

    const statusListener = vi
      .mocked(ipcRenderer.on)
      .mock.calls.find((call) => call[0] === IPC_CHANNELS.ONLINE_STATUS)?.[1] as
      ((event: unknown, data: unknown) => void) | undefined;
    expect(statusListener).toBeTypeOf('function');

    window.dispatchEvent(new Event('app:checkIfOnline'));
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC_CHANNELS.CHECK_IF_ONLINE, {
      attemptId: expect.any(String),
    });
    const sent = vi
      .mocked(ipcRenderer.send)
      .mock.calls.find((call) => call[0] === IPC_CHANNELS.CHECK_IF_ONLINE);
    const attemptId = (sent?.[1] as { attemptId: string }).attemptId;

    statusListener?.({}, { attemptId: 'stale', online: false });
    expect(failedEventCount).toBe(0);
    statusListener?.({}, { attemptId, online: false });
    expect(failedEventCount).toBe(1);

    window.dispatchEvent(new Event('beforeunload'));
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.ONLINE_STATUS,
      expect.any(Function)
    );
  });
});
