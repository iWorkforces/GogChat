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
  });

  it('does not reload on false online-status replies and signals the offline page', () => {
    handleOnlineStatus(false);
    handleOnlineStatus(false);
    handleOnlineStatus(false);

    expect(locationReload).not.toHaveBeenCalled();
    expect(locationReplace).not.toHaveBeenCalled();
    expect(failedEventCount).toBe(3);
  });

  it('replaces with app URL exactly once on the first true reply', () => {
    handleOnlineStatus(false);
    handleOnlineStatus(true);

    expect(locationReload).not.toHaveBeenCalled();
    expect(locationReplace).toHaveBeenCalledTimes(1);
    expect(locationReplace).toHaveBeenCalledWith(appUrl);
    expect(failedEventCount).toBe(1);
  });

  it('forwards checkIfOnline through the bridge', () => {
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
    handleCheckOnline();
    expect(checkIfOnline).toHaveBeenCalledTimes(1);
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
    vi.useRealTimers();
  });

  it('clears the deadline on a false response so timeout does not fire', () => {
    vi.useFakeTimers();
    handleCheckOnline();
    handleOnlineStatus(false);
    vi.advanceTimersByTime(ONLINE_CHECK_DEADLINE_MS);
    expect(failedEventCount).toBe(1);
    expect(locationReload).not.toHaveBeenCalled();
    vi.useRealTimers();
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

    const statusListener = vi.mocked(ipcRenderer.on).mock.calls.find(
      (call) => call[0] === IPC_CHANNELS.ONLINE_STATUS
    )?.[1] as ((event: unknown, online: boolean) => void) | undefined;
    expect(statusListener).toBeTypeOf('function');
    statusListener?.({}, false);
    expect(failedEventCount).toBe(1);

    window.dispatchEvent(new Event('app:checkIfOnline'));
    expect(ipcRenderer.send).toHaveBeenCalledWith(IPC_CHANNELS.CHECK_IF_ONLINE);

    window.dispatchEvent(new Event('beforeunload'));
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.ONLINE_STATUS,
      expect.any(Function)
    );
  });
});
