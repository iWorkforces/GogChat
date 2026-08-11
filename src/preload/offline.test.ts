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

import { handleOnlineStatus, handleCheckOnline, ONLINE_CHECK_FAILED_EVENT } from './offline.js';

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
});
