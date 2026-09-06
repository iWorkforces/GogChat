import { beforeEach, describe, expect, it, vi } from 'vitest';
import log from 'electron-log';

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./mediaAccess.js', () => ({
  checkAndRequestMediaAccess: vi.fn(),
  showDeniedPermissionDialog: vi.fn(),
}));

import { systemPreferences } from 'electron';
import { checkAndRequestMediaAccess, showDeniedPermissionDialog } from './mediaAccess.js';
import {
  installPermissionCheckHandler,
  installPermissionRequestHandler,
} from './permissionHandler.js';

type CapturedHandler = (...args: unknown[]) => unknown;

const mockCheckMedia = vi.mocked(checkAndRequestMediaAccess);
const mockShowDenied = vi.mocked(showDeniedPermissionDialog);
const mockGetMediaStatus = vi.mocked(systemPreferences.getMediaAccessStatus);
const mockLogWarn = vi.mocked(log.warn);
const RAW_LOG_MARKER = 'raw-native-permission-marker';
const SERIALIZED_RAW_DETAILS = JSON.stringify({
  requestingUrl: 'https://mail.google.com/chat/u/0/',
  mediaTypes: [RAW_LOG_MARKER, 1],
});
const revokedMediaTypes = Proxy.revocable([], {});
revokedMediaTypes.revoke();

function createMockWindow() {
  let requestHandler: CapturedHandler = () => {
    throw new Error('request handler was not installed');
  };
  let checkHandler: CapturedHandler = () => {
    throw new Error('check handler was not installed');
  };

  return {
    window: {
      webContents: {
        session: {
          setPermissionRequestHandler: vi.fn((handler: CapturedHandler) => {
            requestHandler = handler;
          }),
          setPermissionCheckHandler: vi.fn((handler: CapturedHandler) => {
            checkHandler = handler;
          }),
        },
      },
    } as never,
    getRequestHandler: (): CapturedHandler => requestHandler,
    getCheckHandler: (): CapturedHandler => checkHandler,
  };
}

function createRequestContext() {
  const { window, getRequestHandler } = createMockWindow();
  installPermissionRequestHandler(window);
  return { window, requestHandler: getRequestHandler(), callback: vi.fn() };
}

async function flushAsyncHandler(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function expectNoMediaSideEffects(): void {
  expect(mockCheckMedia).not.toHaveBeenCalled();
  expect(mockGetMediaStatus).not.toHaveBeenCalled();
  expect(mockShowDenied).not.toHaveBeenCalled();
}

describe('permissionHandler malformed native boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('request handler', () => {
    it.each([
      ['primitive string', 'video'],
      ['primitive number', 1],
      ['object', { 0: 'video', length: 1 }],
      ['mixed array', [RAW_LOG_MARKER, 1]],
      ['revoked proxy', revokedMediaTypes.proxy],
    ])('denies %s mediaTypes before downstream side effects', async (_label, mediaTypes) => {
      const { requestHandler, callback } = createRequestContext();
      const details = { requestingUrl: 'https://mail.google.com/chat/u/0/', mediaTypes };

      requestHandler(null, 'media', callback, details);
      await flushAsyncHandler();

      expect(callback).toHaveBeenCalledExactlyOnceWith(false);
      expectNoMediaSideEffects();
      const loggedArguments = mockLogWarn.mock.calls.flat();
      expect(loggedArguments).not.toContain(SERIALIZED_RAW_DETAILS);
      expect(JSON.stringify(loggedArguments)).not.toContain(RAW_LOG_MARKER);
    });

    it.each([
      ['origin', 'notifications', 'requestingUrl', {}],
      ['media', 'media', 'mediaTypes', { requestingUrl: 'https://mail.google.com/chat/u/0/' }],
    ])(
      'denies a throwing %s getter exactly once without side effects',
      async (_label, permission, property, detailBase) => {
        const { requestHandler, callback } = createRequestContext();
        const details = Object.defineProperty(detailBase, property, {
          get() {
            throw new Error('untrusted getter');
          },
        });

        requestHandler(null, permission, callback, details);
        await flushAsyncHandler();

        expect(callback).toHaveBeenCalledExactlyOnceWith(false);
        expectNoMediaSideEffects();
      }
    );

    it('preserves known media types when unknown string types are also present', async () => {
      mockCheckMedia.mockResolvedValue(true);
      const { requestHandler, callback } = createRequestContext();

      requestHandler(null, 'media', callback, {
        requestingUrl: 'https://mail.google.com/chat/u/0/',
        mediaTypes: ['screen', 'video'],
      });
      await flushAsyncHandler();

      expect(mockCheckMedia).toHaveBeenCalledExactlyOnceWith('camera');
      expect(callback).toHaveBeenCalledExactlyOnceWith(true);
    });

    it.each([
      ['non-string requestingUrl', { requestingUrl: 7, securityOrigin: 'https://chat.google.com' }],
      [
        'invalid requestingUrl',
        { requestingUrl: 'not a URL', securityOrigin: 'https://chat.google.com' },
      ],
      [
        'untrusted requestingUrl',
        { requestingUrl: 'https://evil.example', securityOrigin: 'https://chat.google.com' },
      ],
      ['non-string securityOrigin', { requestingUrl: '', securityOrigin: 7 }],
      ['invalid securityOrigin', { securityOrigin: 'not a URL' }],
      ['trusted embeddingOrigin only', { embeddingOrigin: 'https://mail.google.com' }],
    ])('denies %s', async (_label, details) => {
      const { requestHandler, callback } = createRequestContext();

      requestHandler(null, 'notifications', callback, details);
      await flushAsyncHandler();

      expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    });

    it.each([
      [{ requestingUrl: '', securityOrigin: 'https://chat.google.com' }],
      [{ securityOrigin: 'https://accounts.google.com' }],
    ])('falls through absent or blank origin fields', async (details) => {
      const { requestHandler, callback } = createRequestContext();

      requestHandler(null, 'notifications', callback, details);
      await flushAsyncHandler();

      expect(callback).toHaveBeenCalledExactlyOnceWith(true);
    });

    it('does not read a later origin after the first present candidate denies', async () => {
      const { requestHandler, callback } = createRequestContext();
      const securityOriginGetter = vi.fn(() => 'https://chat.google.com');
      const details = Object.defineProperty(
        { requestingUrl: 'https://evil.example' },
        'securityOrigin',
        { get: securityOriginGetter }
      );

      requestHandler(null, 'notifications', callback, details);
      await flushAsyncHandler();

      expect(callback).toHaveBeenCalledExactlyOnceWith(false);
      expect(securityOriginGetter).not.toHaveBeenCalled();
    });

    it('settles once when an asynchronous media check rejects', async () => {
      mockCheckMedia.mockRejectedValue(new Error('TCC failure'));
      const { requestHandler, callback } = createRequestContext();

      requestHandler(null, 'media', callback, {
        requestingUrl: 'https://mail.google.com/chat/u/0/',
        mediaTypes: ['video'],
      });
      await flushAsyncHandler();

      expect(callback).toHaveBeenCalledExactlyOnceWith(false);
      expect(mockGetMediaStatus).not.toHaveBeenCalled();
      expect(mockShowDenied).not.toHaveBeenCalled();
    });

    it('handles a rejected detached denial dialog without settling twice', async () => {
      mockCheckMedia.mockResolvedValue(false);
      mockGetMediaStatus.mockReturnValue('denied');
      mockShowDenied.mockRejectedValue(new Error('dialog failure'));
      const { window, requestHandler, callback } = createRequestContext();

      requestHandler(null, 'media', callback, {
        requestingUrl: 'https://mail.google.com/chat/u/0/',
        mediaTypes: ['video'],
      });
      await flushAsyncHandler();

      expect(mockShowDenied).toHaveBeenCalledExactlyOnceWith(window, 'camera');
      expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    });
  });

  describe('check handler', () => {
    it.each([
      ['non-string requestingOrigin', 9],
      ['invalid requestingOrigin', 'not a URL'],
      ['untrusted requestingOrigin', 'https://evil.example'],
    ])('denies %s without trusted detail rescue', (_label, requestingOrigin) => {
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      const result = getCheckHandler()(null, 'notifications', requestingOrigin, {
        requestingUrl: 'https://mail.google.com/chat/u/0/',
        securityOrigin: 'https://chat.google.com',
      });

      expect(result).toBe(false);
    });

    it.each([7, { type: 'video' }, ['video']])(
      'denies malformed mediaType %j before querying status',
      (mediaType) => {
        const { window, getCheckHandler } = createMockWindow();
        installPermissionCheckHandler(window);

        const result = getCheckHandler()(null, 'media', 'https://mail.google.com', {
          mediaType,
        });

        expect(result).toBe(false);
        expect(mockGetMediaStatus).not.toHaveBeenCalled();
      }
    );

    it.each([
      ['origin detail', 'notifications', '', 'requestingUrl'],
      ['media detail', 'media', 'https://mail.google.com', 'mediaType'],
    ])('returns false when %s access throws', (_label, permission, requestingOrigin, property) => {
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);
      const details = Object.defineProperty({}, property, {
        get() {
          throw new Error('untrusted getter');
        },
      });
      let result: unknown;

      expect(() => {
        result = getCheckHandler()(null, permission, requestingOrigin, details);
      }).not.toThrow();
      expect(result).toBe(false);
      expect(mockGetMediaStatus).not.toHaveBeenCalled();
    });

    it('returns false when the synchronous TCC status query throws', () => {
      mockGetMediaStatus.mockImplementation(() => {
        throw new Error('TCC status failure');
      });
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      const result = getCheckHandler()(null, 'media', 'https://mail.google.com', {
        mediaType: 'video',
      });

      expect(result).toBe(false);
      expect(mockGetMediaStatus).toHaveBeenCalledExactlyOnceWith('camera');
    });
  });
});
