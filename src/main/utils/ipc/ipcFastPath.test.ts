/**
 * Coverage for ipcFastPath validation and error paths.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const onMock = vi.fn();
const removeListenerMock = vi.fn();
const isAllowedMock = vi.fn().mockReturnValue(true);

vi.mock('electron', () => ({
  ipcMain: {
    on: (...args: unknown[]) => onMock(...args),
    removeListener: (...args: unknown[]) => removeListenerMock(...args),
  },
}));

vi.mock('./rateLimiter.js', () => ({
  getRateLimiter: () => ({ isAllowed: isAllowedMock }),
}));

const warnMock = vi.fn();
const errorMock = vi.fn();
vi.mock('../lifecycle/logger.js', () => ({
  logger: {
    ipc: {
      warn: (...args: unknown[]) => warnMock(...args),
      error: (...args: unknown[]) => errorMock(...args),
    },
  },
}));

vi.mock('../lifecycle/errorUtils.js', () => ({
  toErrorMessage: (e: unknown) => String(e),
}));

describe('registerFastHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    onMock.mockClear();
    removeListenerMock.mockClear();
    isAllowedMock.mockReset().mockReturnValue(true);
    warnMock.mockClear();
    errorMock.mockClear();
  });

  it('registers and invokes handler with validated data and event', async () => {
    const { registerFastHandler } = await import('./ipcFastPath.js');
    const handler = vi.fn();
    const off = registerFastHandler({
      channel: 'unreadCount' as never,
      rateLimit: 5,
      validator: (d) => Number(d),
      handler,
    });

    expect(onMock).toHaveBeenCalled();
    const listener = onMock.mock.calls[0]?.[1] as (e: unknown, d: unknown) => void;
    const event = { sender: {} };
    listener(event, 3);
    expect(handler).toHaveBeenCalledWith(3, event);

    off();
    expect(removeListenerMock).toHaveBeenCalled();
  });

  it('skips when rate limited', async () => {
    isAllowedMock.mockReturnValue(false);
    const { registerFastHandler } = await import('./ipcFastPath.js');
    const handler = vi.fn();
    registerFastHandler({
      channel: 'unreadCount' as never,
      rateLimit: 5,
      validator: (d) => d,
      handler,
    });
    const listener = onMock.mock.calls[0]?.[1] as (e: unknown, d: unknown) => void;
    listener({}, 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('logs and skips when validation throws', async () => {
    const { registerFastHandler } = await import('./ipcFastPath.js');
    const handler = vi.fn();
    registerFastHandler({
      channel: 'unreadCount' as never,
      rateLimit: 5,
      validator: () => {
        throw new Error('bad');
      },
      handler,
    });
    const listener = onMock.mock.calls[0]?.[1] as (e: unknown, d: unknown) => void;
    listener({}, 1);
    expect(handler).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalled();
  });

  it('logs when handler throws', async () => {
    const { registerFastHandler } = await import('./ipcFastPath.js');
    registerFastHandler({
      channel: 'unreadCount' as never,
      rateLimit: 5,
      validator: (d) => d,
      handler: () => {
        throw new Error('handler boom');
      },
    });
    const listener = onMock.mock.calls[0]?.[1] as (e: unknown, d: unknown) => void;
    listener({}, 1);
    expect(errorMock).toHaveBeenCalled();
  });
});
