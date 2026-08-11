import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>();
  return {
    listeners,
    ipcMain: {
      on: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
        const list = listeners.get(channel) ?? [];
        list.push(listener);
        listeners.set(channel, list);
      }),
      handle: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
        listeners.set(channel, [listener]);
      }),
      removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => unknown) => {
        const list = (listeners.get(channel) ?? []).filter((item) => item !== listener);
        listeners.set(channel, list);
      }),
      removeHandler: vi.fn((channel: string) => {
        listeners.delete(channel);
      }),
    },
    isAllowed: vi.fn(() => true),
  };
});

vi.mock('electron', () => ({
  ipcMain: hoisted.ipcMain,
}));

vi.mock('./rateLimiter.js', () => ({
  getRateLimiter: () => ({ isAllowed: hoisted.isAllowed }),
}));

vi.mock('./ipcDeduplicator.js', () => ({
  getDeduplicator: () => ({
    deduplicate: (_key: string, fn: () => Promise<unknown>) => fn(),
  }),
}));

vi.mock('../lifecycle/logger.js', () => ({
  logger: {
    ipc: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

import { defineIPC } from './defineIPC.js';
import { IPC_CHANNELS } from '../../../shared/constants.js';

function senderEvent(id: number) {
  return {
    sender: { id },
    reply: vi.fn(),
  };
}

describe('defineIPC', () => {
  beforeEach(() => {
    hoisted.listeners.clear();
    hoisted.isAllowed.mockReturnValue(true);
    vi.clearAllMocks();
  });

  afterEach(() => {
    hoisted.listeners.clear();
  });

  it('invokes an on handler and passes sender-scoped rate limits', async () => {
    const handler = vi.fn();
    const cleanup = defineIPC({
      kind: 'on',
      channel: IPC_CHANNELS.CHECK_IF_ONLINE,
      validator: () => undefined,
      rateLimit: 1,
      handler,
    });
    const event = senderEvent(7);
    const listener = hoisted.listeners.get(IPC_CHANNELS.CHECK_IF_ONLINE)?.[0];
    expect(listener).toBeTypeOf('function');
    await listener?.(event, undefined);
    expect(hoisted.isAllowed).toHaveBeenCalledWith(IPC_CHANNELS.CHECK_IF_ONLINE, 1, 7);
    expect(handler).toHaveBeenCalled();
    cleanup();
    expect(hoisted.ipcMain.removeListener).toHaveBeenCalled();
  });

  it('skips the handler when the sender is rate limited', async () => {
    hoisted.isAllowed.mockReturnValue(false);
    const handler = vi.fn();
    defineIPC({
      kind: 'on',
      channel: IPC_CHANNELS.CHECK_IF_ONLINE,
      validator: () => undefined,
      rateLimit: 1,
      handler,
    });
    await hoisted.listeners.get(IPC_CHANNELS.CHECK_IF_ONLINE)?.[0]?.(senderEvent(1), undefined);
    expect(handler).not.toHaveBeenCalled();
  });

  it('replies with success and rate-limit envelopes', async () => {
    const handler = vi.fn(() => 'ok');
    defineIPC({
      kind: 'reply',
      channel: IPC_CHANNELS.CHECK_IF_ONLINE,
      validator: () => undefined,
      rateLimit: 1,
      handler,
    });
    const event = senderEvent(3);
    await hoisted.listeners.get(IPC_CHANNELS.CHECK_IF_ONLINE)?.[0]?.(event, undefined);
    expect(event.reply).toHaveBeenCalledWith('checkIfOnline-reply', {
      success: true,
      data: 'ok',
    });

    hoisted.isAllowed.mockReturnValue(false);
    const limited = senderEvent(3);
    await hoisted.listeners.get(IPC_CHANNELS.CHECK_IF_ONLINE)?.[0]?.(limited, undefined);
    expect(limited.reply).toHaveBeenCalledWith('checkIfOnline-reply', {
      success: false,
      error: 'Rate limited',
    });
  });

  it('registers and removes an invoke handler', async () => {
    defineIPC({
      kind: 'invoke',
      channel: IPC_CHANNELS.CHECK_IF_ONLINE,
      validator: () => undefined,
      handler: () => 'invoked',
    });
    const result = await hoisted.listeners.get(IPC_CHANNELS.CHECK_IF_ONLINE)?.[0]?.(
      senderEvent(2),
      undefined
    );
    expect(result).toBe('invoked');
    hoisted.listeners.get(IPC_CHANNELS.CHECK_IF_ONLINE);
    const cleanup = defineIPC({
      kind: 'invoke',
      channel: IPC_CHANNELS.UNREAD_COUNT,
      validator: (data) => data,
      handler: () => 1,
    });
    cleanup();
    expect(hoisted.ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.UNREAD_COUNT);
  });
});
