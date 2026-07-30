/**
 * Unit tests for windowWrapper — BrowserWindow factory with CSP/Header handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture last window created by the BrowserWindow mock for test assertions
let lastCreatedWindow: ReturnType<typeof Object> | null = null;
const mockPlatformState = vi.hoisted(() => ({ isMac: true }));

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('/fake/app/path'),
    getPath: vi.fn().mockReturnValue('/fake/path'),
  },
  BrowserWindow: vi.fn().mockImplementation(function MockBrowserWindow(options?: unknown) {
    const win = {
      __options: options,
      webContents: {
        session: {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
          webRequest: { onHeadersReceived: vi.fn() },
          setSpellCheckerEnabled: vi.fn(),
        },
        on: vi.fn(),
        getURL: vi.fn().mockReturnValue('https://chat.google.com'),
        setBackgroundThrottling: vi.fn(),
      },
      on: vi.fn(),
      once: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      loadURL: vi.fn().mockResolvedValue(undefined),
      isDestroyed: vi.fn().mockReturnValue(false),
    };
    lastCreatedWindow = win;
    return win;
  }),
  Notification: Object.assign(
    vi.fn(function MockNotification(this: {
      on: ReturnType<typeof vi.fn>;
      show: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }) {
      this.on = vi.fn();
      this.show = vi.fn();
      this.close = vi.fn();
    }),
    { isSupported: vi.fn().mockReturnValue(false) }
  ),
  systemPreferences: {
    getMediaAccessStatus: vi.fn().mockReturnValue('granted'),
  },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./config', () => {
  const defaults: Record<string, unknown> = {
    'app.hideMenuBar': false,
    'app.startHidden': false,
    'app.disableSpellChecker': false,
    'app.notificationPermissionRequested': false,
  };
  return {
    default: {
      get: vi.fn((key: string) => defaults[key]),
    },
    configGet: vi.fn((key: string) => defaults[key]),
    configSet: vi.fn((key: string, value: unknown) => {
      defaults[key] = value;
    }),
  };
});

vi.mock('./utils/platform/iconCache', () => ({
  getIconCache: vi.fn().mockReturnValue({
    getIcon: vi.fn().mockReturnValue({ isEmpty: vi.fn().mockReturnValue(false) }),
  }),
}));

vi.mock('./utils/security/mediaAccess', () => ({
  checkAndRequestMediaAccess: vi.fn().mockResolvedValue(true),
  showDeniedPermissionDialog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./utils/security/notificationAccess', () => ({
  ensureNotificationPermission: vi.fn().mockReturnValue('scheduled'),
}));
vi.mock('./utils/platform/windowUtils', () => ({
  getWindowDefaults: vi.fn().mockReturnValue({
    hideMenuBar: false,
    startHidden: false,
    disableSpellChecker: false,
  }),
  attachEventLogging: vi.fn((win: { on: (...args: unknown[]) => void }) => {
    for (const event of ['show', 'hide', 'focus', 'blur', 'minimize', 'restore']) {
      win.on(event, () => {});
    }
  }),
  attachHealthMonitoring: vi.fn((win: { webContents: { on: (...args: unknown[]) => void } }) => {
    for (const event of [
      'console-message',
      'did-fail-load',
      'did-finish-load',
      'did-navigate',
      'render-process-gone',
      'unresponsive',
      'responsive',
    ]) {
      win.webContents.on(event, () => {});
    }
  }),
}));

vi.mock('./utils/platform/platformDetection', () => ({
  platform: mockPlatformState,
}));

import createWindow from './windowWrapper';

function wc() {
  return lastCreatedWindow!.webContents.session;
}

const TRUSTED_PERMISSION_DETAILS = {
  requestingUrl: 'https://mail.google.com/chat/u/0/',
} as const;
const TRUSTED_REQUESTING_ORIGIN = 'https://mail.google.com';

describe('windowWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastCreatedWindow = null;
    mockPlatformState.isMac = true;
    process.removeAllListeners('warning');
  });

  afterEach(() => {
    process.removeAllListeners('warning');
  });

  describe('createWindow factory', () => {
    it('creates BrowserWindow with correct security defaults', () => {
      createWindow('https://chat.google.com');
      const w = lastCreatedWindow!;
      expect(w).toBeDefined();
      expect(w.webContents).toBeDefined();
    });

    it('loads the specified URL', () => {
      createWindow('https://chat.google.com/u/0');
      expect(lastCreatedWindow!.loadURL).toHaveBeenCalledWith('https://chat.google.com/u/0');
    });

    it('installs CSP header stripping for Google domains', () => {
      createWindow('https://chat.google.com');
      expect(wc().webRequest.onHeadersReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          urls: expect.arrayContaining(['*://*.google.com/*', '*://*.gstatic.com/*']),
        }),
        expect.any(Function)
      );
    });

    it('strips COEP and COOP headers from responses', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      const details = {
        url: 'https://chat.google.com/',
        responseHeaders: {
          'cross-origin-embedder-policy': ['require-corp'],
          'cross-origin-opener-policy': ['same-origin'],
        },
      };

      cb(details, (response: { responseHeaders: Record<string, string[]> }) => {
        expect(response.responseHeaders['cross-origin-embedder-policy']).toBeUndefined();
        expect(response.responseHeaders['cross-origin-opener-policy']).toBeUndefined();
      });
    });

    it('strips frame-ancestors from CSP for benign hosts', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      const details = {
        url: 'https://accounts.google.com/auth',
        responseHeaders: {
          'content-security-policy': [
            "default-src 'self'; frame-ancestors https://studio.workspace.google.com",
          ],
          'x-frame-options': ['ALLOW-FROM https://studio.workspace.google.com'],
        },
      };

      cb(details, (response: { responseHeaders: Record<string, string[]> }) => {
        expect(response.responseHeaders['content-security-policy'][0]).not.toContain(
          'frame-ancestors'
        );
        expect(response.responseHeaders['x-frame-options']).toBeUndefined();
      });
    });

    it('preserves frame-ancestors for non-benign hosts', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      cb(
        {
          url: 'https://chat.google.com/embed',
          responseHeaders: {
            'content-security-policy': ['frame-ancestors https://trusted.example.com'],
          },
        },
        (response: { responseHeaders: Record<string, string[]> }) => {
          expect(response.responseHeaders['content-security-policy'][0]).toContain(
            'frame-ancestors'
          );
        }
      );
    });

    it('deletes CSP key when frame-ancestors removal leaves empty policy', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      cb(
        {
          url: 'https://accounts.google.com/auth',
          responseHeaders: { 'content-security-policy': ['frame-ancestors x;'] },
        },
        (response: { responseHeaders: Record<string, string[]> }) => {
          expect(response.responseHeaders['content-security-policy']).toBeUndefined();
        }
      );
    });

    it('grants allowed non-media permissions', () => {
      createWindow('https://chat.google.com');
      const handler = wc().setPermissionRequestHandler.mock.calls[0][0];
      const cb = vi.fn();

      handler({}, 'notifications', cb, TRUSTED_PERMISSION_DETAILS);
      expect(cb).toHaveBeenCalledWith(true);
      handler({}, 'mediaKeySystem', cb, TRUSTED_PERMISSION_DETAILS);
      expect(cb).toHaveBeenCalledWith(true);
      handler({}, 'geolocation', cb, TRUSTED_PERMISSION_DETAILS);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('denies non-allowed permissions', () => {
      createWindow('https://chat.google.com');
      const handler = wc().setPermissionRequestHandler.mock.calls[0][0];
      const cb = vi.fn();

      handler({}, 'fullscreen', cb, {});
      expect(cb).toHaveBeenCalledWith(false);
      handler({}, 'clipboard-read', cb, {});
      expect(cb).toHaveBeenCalledWith(false);
    });
    it('uses partition when provided', () => {
      createWindow('https://chat.google.com', 'persist:account-1');
      expect(lastCreatedWindow).toBeDefined();
    });

    it('does not set partition when not provided', () => {
      createWindow('https://chat.google.com');
      expect(lastCreatedWindow).toBeDefined();
    });

    it('registers window lifecycle event listeners', () => {
      createWindow('https://chat.google.com');

      const eventTypes = lastCreatedWindow!.on.mock.calls.map((c: [string]) => c[0]);
      ['show', 'hide', 'focus', 'blur', 'minimize', 'restore'].forEach((e) => {
        expect(eventTypes).toContain(e);
      });

      const onceTypes = lastCreatedWindow!.once.mock.calls.map((c: [string]) => c[0]);
      expect(onceTypes).toContain('ready-to-show');
    });

    it('registers webContents event listeners for console and navigation', () => {
      createWindow('https://chat.google.com');

      const wcEvents = lastCreatedWindow!.webContents.on.mock.calls.map((c: [string]) => c[0]);
      [
        'console-message',
        'did-fail-load',
        'did-finish-load',
        'did-navigate',
        'render-process-gone',
        'unresponsive',
        'responsive',
      ].forEach((e) => {
        expect(wcEvents).toContain(e);
      });
    });
  });

  describe('media permission handling', () => {
    it('grants media permission when camera and microphone are allowed', async () => {
      const { checkAndRequestMediaAccess } = await import('./utils/security/mediaAccess');
      vi.mocked(checkAndRequestMediaAccess).mockResolvedValue(true);

      createWindow('https://chat.google.com');
      const handler = wc().setPermissionRequestHandler.mock.calls[0][0];
      const cb = vi.fn();

      await handler({}, 'media', cb, {
        ...TRUSTED_PERMISSION_DETAILS,
        mediaTypes: ['video', 'audio'],
      });
      // Flush microtasks — installPermissionRequestHandler uses void async IIFE,
      // so callback fires asynchronously after the outer handler returns.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('denies media permission when camera access is denied', async () => {
      const { checkAndRequestMediaAccess } = await import('./utils/security/mediaAccess');
      vi.mocked(checkAndRequestMediaAccess).mockImplementation((type) =>
        Promise.resolve(type !== 'camera')
      );

      createWindow('https://chat.google.com');
      const handler = wc().setPermissionRequestHandler.mock.calls[0][0];
      const cb = vi.fn();

      await handler({}, 'media', cb, {
        ...TRUSTED_PERMISSION_DETAILS,
        mediaTypes: ['video', 'audio'],
      });
      expect(cb).toHaveBeenCalledWith(false);
    });

    it('shows denied dialog when camera access is denied', async () => {
      const { checkAndRequestMediaAccess, showDeniedPermissionDialog } =
        await import('./utils/security/mediaAccess');
      const { systemPreferences } = await import('electron');
      vi.mocked(checkAndRequestMediaAccess).mockImplementation((type) =>
        Promise.resolve(type !== 'camera')
      );
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied');

      createWindow('https://chat.google.com');
      const handler = wc().setPermissionRequestHandler.mock.calls[0][0];
      const cb = vi.fn();

      await handler({}, 'media', cb, {
        ...TRUSTED_PERMISSION_DETAILS,
        mediaTypes: ['video'],
      });
      expect(showDeniedPermissionDialog).toHaveBeenCalledWith(expect.anything(), 'camera');
    });
  });

  describe('permission check handler', () => {
    it('installs setPermissionCheckHandler', () => {
      createWindow('https://chat.google.com');
      expect(wc().setPermissionCheckHandler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('returns true for media video when TCC granted', async () => {
      const { systemPreferences } = await import('electron');
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted');

      createWindow('https://chat.google.com');
      const handler = wc().setPermissionCheckHandler.mock.calls[0][0];

      expect(handler({}, 'media', TRUSTED_REQUESTING_ORIGIN, { mediaType: 'video' })).toBe(true);
    });

    it('returns false for media video when TCC denied', async () => {
      const { systemPreferences } = await import('electron');
      vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied');

      createWindow('https://chat.google.com');
      const handler = wc().setPermissionCheckHandler.mock.calls[0][0];

      expect(handler({}, 'media', TRUSTED_REQUESTING_ORIGIN, { mediaType: 'video' })).toBe(false);
    });

    it('returns true for non-media allowed permissions', () => {
      createWindow('https://chat.google.com');
      const handler = wc().setPermissionCheckHandler.mock.calls[0][0];

      expect(handler({}, 'notifications', TRUSTED_REQUESTING_ORIGIN, {})).toBe(true);
      expect(handler({}, 'geolocation', TRUSTED_REQUESTING_ORIGIN, {})).toBe(true);
      expect(handler({}, 'mediaKeySystem', TRUSTED_REQUESTING_ORIGIN, {})).toBe(true);
    });

    it('returns false for non-allowed permissions', () => {
      createWindow('https://chat.google.com');
      const handler = wc().setPermissionCheckHandler.mock.calls[0][0];

      expect(handler({}, 'fullscreen', '', {})).toBe(false);
    });
  });

  describe('backgroundThrottling per partition', () => {
    function getPrefs(): Electron.WebPreferences {
      const opts = lastCreatedWindow!.__options as { webPreferences: Electron.WebPreferences };
      return opts.webPreferences;
    }

    it('disables backgroundThrottling when no partition is supplied (default account-0)', () => {
      createWindow('https://chat.google.com');
      expect(getPrefs().backgroundThrottling).toBe(false);
    });

    it('disables backgroundThrottling for persist:account-0', () => {
      createWindow('https://chat.google.com', 'persist:account-0');
      expect(getPrefs().backgroundThrottling).toBe(false);
    });

    it('enables backgroundThrottling for persist:account-1', () => {
      createWindow('https://chat.google.com', 'persist:account-1');
      expect(getPrefs().backgroundThrottling).toBe(true);
    });

    it('enables backgroundThrottling for persist:account-7 (higher indices)', () => {
      createWindow('https://chat.google.com', 'persist:account-7');
      expect(getPrefs().backgroundThrottling).toBe(true);
    });

    it('falls back to disabled when partition string is malformed', () => {
      createWindow('https://chat.google.com', 'persist:something-else');
      expect(getPrefs().backgroundThrottling).toBe(false);
    });
  });

  describe('notification permission gating', () => {
    it('calls ensureNotificationPermission on ready-to-show with parentWindow', async () => {
      const { ensureNotificationPermission } = await import('./utils/security/notificationAccess');
      vi.mocked(ensureNotificationPermission).mockClear();

      createWindow('https://chat.google.com', 'persist:account-0');
      const win0 = lastCreatedWindow as {
        once: ReturnType<typeof vi.fn>;
      };
      expect(ensureNotificationPermission).not.toHaveBeenCalled();

      const ready0 = win0.once.mock.calls.find((call) => call[0] === 'ready-to-show')?.[1] as
        | (() => void)
        | undefined;
      expect(ready0).toBeDefined();
      ready0?.();
      expect(ensureNotificationPermission).toHaveBeenCalledTimes(1);
      expect(ensureNotificationPermission).toHaveBeenCalledWith({ parentWindow: win0 });

      createWindow('https://chat.google.com', 'persist:account-1');
      const win1 = lastCreatedWindow as {
        once: ReturnType<typeof vi.fn>;
      };
      const ready1 = win1.once.mock.calls.find((call) => call[0] === 'ready-to-show')?.[1] as
        | (() => void)
        | undefined;
      ready1?.();
      expect(ensureNotificationPermission).toHaveBeenCalledTimes(2);
      expect(ensureNotificationPermission).toHaveBeenLastCalledWith({ parentWindow: win1 });
    });
  });
});
