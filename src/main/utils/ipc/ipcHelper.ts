/** Secure IPC handler factories with validation and rate limiting */

import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { ipcMain, BrowserWindow } from 'electron';
import type { IPCResponse } from '../../../shared/types/ipc.js';
import type { IPCChannelName } from '../../../shared/constants.js';
import { getRateLimiter } from './rateLimiter.js';
import { getDeduplicator } from './ipcDeduplicator.js';
import { logger } from '../lifecycle/logger.js';
import { toError, toErrorMessage } from '../lifecycle/errorUtils.js';
import { asType } from '../../../shared/typeUtils.js';

/** Configuration for creating a secure IPC handler */
export interface IPCHandlerConfig<T> {
  channel: IPCChannelName;
  validator: (data: unknown) => T;
  handler: (data: NoInfer<T>, event: IpcMainEvent | IpcMainInvokeEvent) => void | Promise<void>;
  rateLimit?: number;
  onError?: (error: Error, event: IpcMainEvent | IpcMainInvokeEvent) => void;
  silent?: boolean;
  description?: string;
  /**
   * When true, the handler body is wrapped with the IPC deduplicator using the
   * channel name as the dedup key (default 100ms window). Defaults to false.
   *
   * Prefer `withDeduplication` for fine-grained, payload-aware key generation.
   */
  deduplicate?: boolean;
  /**
   * Fine-grained deduplication: provide a key function that receives the
   * validated payload and returns a string key, plus the dedup window in ms.
   * Wraps the handler body with the IPC deduplicator after rate-limit and
   * validation, so the rate-limit → validate → dedup → handle → catch chain
   * is preserved. Mutually exclusive with `deduplicate`; if both are set,
   * `withDeduplication` wins.
   */
  withDeduplication?: {
    keyFn: (channel: IPCChannelName, validated: NoInfer<T>) => string;
    windowMs: number;
  };
}

/** Configuration for creating a reply-based IPC handler */
export interface IPCReplyHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  handler: (data: NoInfer<T>, event: IpcMainEvent) => R | Promise<R>;
  replyChannel?: string;
}

/** Configuration for creating an invoke handler (request/response) */
export interface IPCInvokeHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  handler: (data: NoInfer<T>, event: IpcMainInvokeEvent) => R | Promise<R>;
}

/** Common config fields shared by all secure handler types */
type BaseSecureConfig<T> = Pick<
  IPCHandlerConfig<T>,
  | 'channel'
  | 'validator'
  | 'rateLimit'
  | 'onError'
  | 'silent'
  | 'description'
  | 'deduplicate'
  | 'withDeduplication'
>;

/** Internal base handler: rate-limit → validate → log → execute → catch */
async function executeSecureHandler<T, R>(
  config: BaseSecureConfig<T>,
  data: unknown,
  event: IpcMainEvent | IpcMainInvokeEvent,
  execute: (validated: T) => R | Promise<R>,
  options: {
    debugLabel: string;
    errorLabel: string;
    onRateLimited?: () => void;
    beforeOnError?: (err: Error) => void;
    afterOnError?: (err: Error) => void;
  }
): Promise<R | undefined> {
  const {
    channel,
    validator,
    rateLimit,
    onError,
    silent = false,
    description,
    deduplicate = false,
    withDeduplication,
  } = config;
  const rateLimiter = getRateLimiter();
  const log = logger.ipc;

  try {
    const senderId = event.sender?.id;
    if (rateLimit !== undefined && !rateLimiter.isAllowed(channel, rateLimit, senderId)) {
      if (!silent) {
        log.warn(`Rate limited: ${channel}`);
      }
      options.onRateLimited?.();
      return undefined;
    }

    const validated = validator(data);

    if (!silent) {
      log.debug(`${options.debugLabel}${channel}${description ? ` (${description})` : ''}`);
    }

    if (withDeduplication) {
      const key = withDeduplication.keyFn(channel, validated);
      return await getDeduplicator().deduplicate(
        key,
        () => Promise.resolve(execute(validated)),
        withDeduplication.windowMs
      );
    }
    if (deduplicate) {
      return await getDeduplicator().deduplicate(channel, () =>
        Promise.resolve(execute(validated))
      );
    }
    return await execute(validated);
  } catch (error: unknown) {
    const err = toError(error);

    if (!silent) {
      log.error(`${options.errorLabel}${channel}`, err.message);
    }

    options.beforeOnError?.(err);

    if (onError) {
      onError(err, event);
    }

    options.afterOnError?.(err);
    return undefined;
  }
}

/** One-way IPC handler (renderer → main)
 * @deprecated Prefer `defineIPC({ kind: 'on', ... })` from `./defineIPC.js`.
 * Retained for backward compatibility; will be removed in a future cleanup pass.
 */
export function createSecureIPCHandler<T>(config: IPCHandlerConfig<T>): () => void {
  const { handler } = config;

  const secureHandler = (event: IpcMainEvent, data: unknown) => {
    void executeSecureHandler<T, void>(
      config,
      data,
      event,
      (validated) => handler(validated, event),
      {
        debugLabel: 'Handling ',
        errorLabel: 'Handler failed: ',
      }
    );
  };

  ipcMain.on(config.channel, secureHandler);
  return () => {
    ipcMain.removeListener(config.channel, secureHandler);
  };
}

/** Reply-based IPC handler using event.reply()
 * @deprecated Prefer `defineIPC({ kind: 'reply', ... })` from `./defineIPC.js`.
 * Retained for backward compatibility; will be removed in a future cleanup pass.
 */
export function createSecureReplyHandler<T, R>(config: IPCReplyHandlerConfig<T, R>): () => void {
  const { handler, replyChannel } = config;
  const responseChannel = replyChannel || `${config.channel}-reply`;

  const secureHandler = (event: IpcMainEvent, data: unknown) => {
    void executeSecureHandler<T, void>(
      config,
      data,
      event,
      async (validated) => {
        const response = await handler(validated, event);
        event.reply(responseChannel, { success: true, data: response } satisfies IPCResponse<R>);
      },
      {
        debugLabel: 'Handling ',
        errorLabel: 'Reply handler failed: ',
        onRateLimited: () => {
          event.reply(responseChannel, {
            success: false,
            error: 'Rate limited',
          } satisfies IPCResponse<R>);
        },
        beforeOnError: (err) => {
          event.reply(responseChannel, {
            success: false,
            error: err.message,
          } satisfies IPCResponse<R>);
        },
      }
    );
  };

  ipcMain.on(config.channel, secureHandler);
  return () => {
    ipcMain.removeListener(config.channel, secureHandler);
  };
}

/** Invoke-based IPC handler for ipcRenderer.invoke()
 * @deprecated Prefer `defineIPC({ kind: 'invoke', ... })` from `./defineIPC.js`.
 * Retained for backward compatibility; will be removed in a future cleanup pass.
 */
export function createSecureInvokeHandler<T, R>(config: IPCInvokeHandlerConfig<T, R>): () => void {
  const { handler } = config;

  const secureHandler = async (event: IpcMainInvokeEvent, data: unknown): Promise<R> => {
    const result = await executeSecureHandler<T, R>(
      config,
      data,
      event,
      (validated) => handler(validated, event),
      {
        debugLabel: 'Handling invoke ',
        errorLabel: 'Invoke handler failed: ',
        onRateLimited: () => {
          throw new Error('Rate limited');
        },
        afterOnError: (err) => {
          throw err;
        },
      }
    );
    return asType<R>(result);
  };

  ipcMain.handle(config.channel, secureHandler);
  return () => {
    ipcMain.removeHandler(config.channel);
  };
}

/** Broadcasts to all windows */
export function createBroadcastHandler<T>(config: {
  channel: IPCChannelName;
  validator: (data: unknown) => T;
  filter?: (window: BrowserWindow, data: T) => boolean;
}): (data: unknown) => void {
  return (data: unknown) => {
    try {
      const validated = config.validator(data);
      const windows = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());

      windows.forEach((window) => {
        if (!config.filter || config.filter(window, validated)) {
          window.webContents.send(config.channel, validated);
        }
      });
    } catch (error: unknown) {
      logger.ipc.error(`Broadcast failed: ${config.channel}`, toErrorMessage(error));
    }
  };
}

/** Sends to a specific window */
export function sendToWindow<T>(
  window: BrowserWindow | null,
  channel: IPCChannelName,
  data: T,
  validator?: (data: T) => T
): boolean {
  try {
    if (!window || window.isDestroyed()) {
      logger.ipc.warn(`Window not available for channel: ${channel}`);
      return false;
    }

    const validated = validator ? validator(data) : data;
    window.webContents.send(channel, validated);
    return true;
  } catch (error: unknown) {
    logger.ipc.error(`Failed to send to window: ${channel}`, toErrorMessage(error));
    return false;
  }
}

/** Batch register/cleanup multiple handlers */
export class IPCHandlerManager {
  private cleanupFunctions: Array<() => void> = [];

  register<T>(config: IPCHandlerConfig<T>): void {
    const cleanup = createSecureIPCHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  registerReply<T, R>(config: IPCReplyHandlerConfig<T, R>): void {
    const cleanup = createSecureReplyHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  registerInvoke<T, R>(config: IPCInvokeHandlerConfig<T, R>): void {
    const cleanup = createSecureInvokeHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  cleanup(): void {
    this.cleanupFunctions.forEach((fn) => fn());
    this.cleanupFunctions = [];
  }
}

let globalManager: IPCHandlerManager | null = null;

export function getIPCManager(): IPCHandlerManager {
  if (!globalManager) {
    globalManager = new IPCHandlerManager();
  }
  return globalManager;
}

export function cleanupGlobalHandlers(): void {
  if (globalManager) {
    globalManager.cleanup();
    globalManager = null;
  }
}

/**
 * Destroy the IPC manager singleton (alias for {@link cleanupGlobalHandlers}).
 * Runs all registered handler cleanup callbacks and nulls the singleton.
 * Provided to satisfy the `getXxx`/`destroyXxx` singleton-compliance contract.
 */
export function destroyIPCManager(): void {
  cleanupGlobalHandlers();
}
