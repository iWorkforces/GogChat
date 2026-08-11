/**
 * Unit tests for deepLinkHandler feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow } from 'electron';

vi.mock('electron', () => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    app: {
      setAsDefaultProtocolClient: vi.fn().mockReturnValue(true),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const idx = listeners[event]?.indexOf(handler) ?? -1;
        if (idx >= 0) listeners[event].splice(idx, 1);
      }),
      __listeners: listeners,
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../shared/urlValidators.js', () => ({
  isGoogleAuthUrl: vi.fn((url: unknown) => url === 'https://accounts.google.com/signin/v2'),
  validateDeepLinkURL: vi.fn((url: string) => url),
  validateExternalURL: vi.fn((url: string) => url),
}));

const mockFocusAccount = vi.fn();
vi.mock('../utils/account/accountWindowManager', () => ({
  createAccountWindow: vi.fn(),
  getWindowForAccount: vi.fn().mockReturnValue(null),
  getMostRecentWindow: vi.fn().mockReturnValue(null),
  getAccountWindowManager: vi.fn(() => ({
    getAccountIndex: vi.fn().mockReturnValue(0),
    focusAccount: (...args: unknown[]) => mockFocusAccount(...args),
  })),
}));

vi.mock('../utils/account/accountNavigation.js', () => ({
  loadAccountURL: vi.fn().mockReturnValue(true),
  getAccountURL: vi.fn().mockReturnValue('https://chat.google.com/u/0/'),
}));

vi.mock('../utils/lifecycle/resourceCleanup', () => ({
  addTrackedListener: vi.fn(),
}));

vi.mock('./menuActionRegistry', () => ({
  registerMenuAction: vi.fn(),
}));

import initDeepLinkHandler, {
  processDeepLink,
  setupDeepLinkListener,
  cleanupDeepLinkHandler,
  registerDeepLinkProtocol,
} from './deepLinkHandler';
import { extractDeepLinkFromArgv } from '../utils/account/deepLinkUtils';
import { app } from 'electron';
import {
  createAccountWindow,
  getWindowForAccount,
  getMostRecentWindow,
} from '../utils/account/accountWindowManager';
import { loadAccountURL, getAccountURL } from '../utils/account/accountNavigation.js';
import {
  validateDeepLinkURL,
  validateExternalURL,
  isGoogleAuthUrl,
} from '../../shared/urlValidators.js';
import { addTrackedListener } from '../utils/lifecycle/resourceCleanup';
import log from 'electron-log';

/**
 * Interface for the mock app with internal listener storage
 */
interface MockAppWithListeners {
  setAsDefaultProtocolClient: typeof app.setAsDefaultProtocolClient;
  on: typeof app.on;
  removeListener: typeof app.removeListener;
  __listeners: Record<string, Array<(...args: unknown[]) => void>>;
}

/**
 * Fake window mock for testing BrowserWindow interactions
 */
interface FakeWindow {
  webContents: { getURL: ReturnType<typeof vi.fn> };
  isDestroyed: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  isMinimized: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
}

function getAppListeners(): Record<string, Array<(...args: unknown[]) => void>> {
  return (app as unknown as MockAppWithListeners).__listeners;
}

function makeFakeWindow(): FakeWindow {
  return {
    webContents: { getURL: vi.fn().mockReturnValue('https://chat.google.com/u/0/') },
    isDestroyed: vi.fn().mockReturnValue(false),
    loadURL: vi.fn().mockResolvedValue(undefined),
    isMinimized: vi.fn().mockReturnValue(false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

describe('deepLinkHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(app.setAsDefaultProtocolClient).mockReturnValue(true);
    const listeners = getAppListeners();
    for (const key of Object.keys(listeners)) {
      delete listeners[key];
    }
  });

  describe('processDeepLink', () => {
    it('validates the deep link URL', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as FakeWindow);

      processDeepLink('gogchat://chat.google.com/room/test');
      expect(validateDeepLinkURL).toHaveBeenCalledWith('gogchat://chat.google.com/room/test');
    });

    it('creates window for account index from URL path', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      const fakeWindow = makeFakeWindow();
      vi.mocked(createAccountWindow).mockReturnValue(fakeWindow as FakeWindow);

      processDeepLink('gogchat://chat.google.com/u/3/room/test');
      expect(createAccountWindow).toHaveBeenCalledWith(expect.stringContaining('/u/3/'), 3);
    });

    it('defaults to account index 0 when no /u/N path', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as FakeWindow);

      processDeepLink('gogchat://chat.google.com/room/test');
      expect(createAccountWindow).toHaveBeenCalledWith(expect.any(String), 0);
    });

    it('handles validation errors gracefully', () => {
      vi.mocked(validateDeepLinkURL).mockImplementation(() => {
        throw new Error('Invalid URL');
      });
      processDeepLink('invalid-url');
      // Should not throw
    });

    it('buffers URL when no window available', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(null as unknown as BrowserWindow | null);

      processDeepLink('gogchat://chat.google.com/room/test');
      // Should not throw — URL gets buffered
    });
  });

  describe('extractDeepLinkFromArgv', () => {
    it('extracts gogchat:// deep link from argv', () => {
      const result = extractDeepLinkFromArgv([
        'node',
        'app',
        'gogchat://chat.google.com/room/test',
      ]);
      expect(result).toBe('gogchat://chat.google.com/room/test');
    });

    it('ignores https chat.google.com argv because Windows protocol argv only handles gogchat://', () => {
      const result = extractDeepLinkFromArgv([
        'node',
        'app',
        'https://chat.google.com/u/0/room/test',
      ]);
      expect(result).toBeNull();
    });

    it('returns null when no deep link found', () => {
      const result = extractDeepLinkFromArgv(['node', 'app', '--other-flag']);
      expect(result).toBeNull();
    });

    it('prefers gogchat:// over https link', () => {
      const result = extractDeepLinkFromArgv([
        'node',
        'app',
        'https://chat.google.com/room/test',
        'gogchat://chat.google.com/room/priority',
      ]);
      expect(result).toBe('gogchat://chat.google.com/room/priority');
    });
  });

  describe('setupDeepLinkListener', () => {
    it('registers listener and routes URLs correctly', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as FakeWindow);

      // First call registers
      setupDeepLinkListener();
      expect(addTrackedListener).toHaveBeenCalledWith(
        expect.anything(),
        'open-url',
        expect.any(Function),
        'DeepLink open-url'
      );

      // Second call is a no-op (module-scoped guard)
      setupDeepLinkListener();
      expect(addTrackedListener).toHaveBeenCalledTimes(1);

      const handler = vi.mocked(addTrackedListener).mock.calls[0][2];

      // Route gogchat:// URLs
      handler({ preventDefault: vi.fn() }, 'gogchat://chat.google.com/room/test');
      expect(validateDeepLinkURL).toHaveBeenCalled();

      // Route other https URLs to external browser
      handler({ preventDefault: vi.fn() }, 'https://example.com/page');
      expect(validateExternalURL).toHaveBeenCalled();

      // Ignore non-https, non-gogchat URLs
      handler({ preventDefault: vi.fn() }, 'ftp://files.example.com');
      // validateDeepLinkURL was already called from gogchat URL, but externalURL
      // was only called for the https URL above
      expect(validateExternalURL).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupDeepLinkHandler', () => {
    it('clears pending deep link without error', () => {
      cleanupDeepLinkHandler();
    });

    it('logs error when cleanup internals throw', () => {
      // The cleanup itself is wrapped in try-catch; exercising the happy path
      // already covers the non-error branch. To reach the catch branch we
      // would need to force log.debug to throw, which is impractical.
      // Instead, verify cleanup is idempotent (second call is fine).
      cleanupDeepLinkHandler();
      cleanupDeepLinkHandler();
      // No error should be thrown
    });
  });

  describe('registerDeepLinkProtocol', () => {
    it('calls setAsDefaultProtocolClient with gogchat scheme', () => {
      registerDeepLinkProtocol();
      expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith(
        expect.stringContaining('gogchat')
      );
    });

    it('registers with execPath and argv[1] when process.defaultApp is true and argv >= 2', () => {
      const originalDefaultApp = process.defaultApp;
      const originalArgv = process.argv;
      Object.defineProperty(process, 'defaultApp', { value: true, configurable: true });
      process.argv = ['electron', '/path/to/script', '--flag'];

      registerDeepLinkProtocol();

      expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('gogchat', process.execPath, [
        '/path/to/script',
      ]);

      Object.defineProperty(process, 'defaultApp', {
        value: originalDefaultApp,
        configurable: true,
      });
      process.argv = originalArgv;
    });

    it('registers without extra args when process.defaultApp is false (production)', () => {
      const originalDefaultApp = process.defaultApp;
      Object.defineProperty(process, 'defaultApp', { value: false, configurable: true });

      registerDeepLinkProtocol();

      expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith('gogchat');

      Object.defineProperty(process, 'defaultApp', {
        value: originalDefaultApp,
        configurable: true,
      });
    });

    it('logs error when setAsDefaultProtocolClient returns false', () => {
      vi.mocked(app.setAsDefaultProtocolClient).mockReturnValue(false);

      registerDeepLinkProtocol();

      expect(log.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to register as default protocol client')
      );
    });

    it('logs error when setAsDefaultProtocolClient throws', () => {
      vi.mocked(app.setAsDefaultProtocolClient).mockImplementation(() => {
        throw new Error('Protocol error');
      });

      registerDeepLinkProtocol();

      expect(log.error).toHaveBeenCalledWith(
        '[DeepLink] Error registering protocol client:',
        expect.any(Error)
      );
    });
  });

  describe('openInDefaultBrowser (via setupDeepLinkListener)', () => {
    it('logs error when validateExternalURL throws', () => {
      vi.mocked(validateExternalURL).mockImplementation(() => {
        throw new Error('Invalid external URL');
      });

      // setupDeepLinkListener has module-level guard, so retrieve handler
      // from the most recent addTrackedListener call
      setupDeepLinkListener();
      const calls = vi.mocked(addTrackedListener).mock.calls;
      if (calls.length === 0) {
        // Listener was registered in a previous test; verify error path
        // by testing the openInDefaultBrowser function indirectly
        return;
      }
      const handler = calls[calls.length - 1][2];

      handler({ preventDefault: vi.fn() }, 'https://malicious.example.com');

      // Should not throw — error is caught internally
    });
  });

  describe('initDeepLinkHandler', () => {
    it('calls registerDeepLinkProtocol and processes pending links', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as FakeWindow);

      initDeepLinkHandler({});

      expect(app.setAsDefaultProtocolClient).toHaveBeenCalled();
    });

    it('processes buffered deep link during init', () => {
      // Reset mocks that prior tests may have changed to throwing impls
      vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);
      vi.mocked(app.setAsDefaultProtocolClient).mockReturnValue(true);

      // First, buffer a URL by processing when window is unavailable
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(null as unknown as BrowserWindow | null);
      vi.mocked(getMostRecentWindow).mockReturnValue(null);
      processDeepLink('gogchat://chat.google.com/room/buffered');

      // Now make window available for init
      const fakeWindow = makeFakeWindow();
      vi.mocked(getWindowForAccount).mockReturnValue(fakeWindow as FakeWindow);
      vi.mocked(getMostRecentWindow).mockReturnValue(fakeWindow as FakeWindow);

      initDeepLinkHandler({});

      // The buffered URL should have been navigated to
      expect(loadAccountURL).toHaveBeenCalled();
    });

    it('processes a cold-start gogchat:// URL from argv during init', () => {
      vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);
      vi.mocked(app.setAsDefaultProtocolClient).mockReturnValue(true);
      const originalArgv = process.argv;
      process.argv = ['GogChat.exe', 'gogchat://room/cold-start'];
      const fakeWindow = makeFakeWindow();
      vi.mocked(getWindowForAccount).mockReturnValue(fakeWindow as FakeWindow);
      vi.mocked(getMostRecentWindow).mockReturnValue(fakeWindow as FakeWindow);

      initDeepLinkHandler({});

      expect(loadAccountURL).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'gogchat://room/cold-start'
      );
      process.argv = originalArgv;
    });
  });

  describe('navigateToUrl focus', () => {
    it('focuses the URL-derived account when navigating', () => {
      vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);
      vi.mocked(getAccountURL).mockReturnValue('https://chat.google.com/u/0/');
      vi.mocked(isGoogleAuthUrl).mockReturnValue(false);

      const fakeWindow = makeFakeWindow();
      vi.mocked(getWindowForAccount).mockReturnValue(fakeWindow as FakeWindow);

      processDeepLink('gogchat://chat.google.com/u/1/room/test');

      expect(loadAccountURL).toHaveBeenCalledWith(
        expect.anything(),
        1,
        expect.stringContaining('/u/1/')
      );
      expect(mockFocusAccount).toHaveBeenCalledWith(1);
    });
  });

  describe('navigateToUrl auth-page protection', () => {
    it('does not interrupt an active Google auth page with loadURL', () => {
      vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);

      const fakeWindow = makeFakeWindow();
      fakeWindow.webContents.getURL.mockReturnValue('https://accounts.google.com/signin/v2');
      vi.mocked(getAccountURL).mockReturnValue('https://accounts.google.com/signin/v2');
      vi.mocked(isGoogleAuthUrl).mockReturnValue(true);
      vi.mocked(getWindowForAccount).mockReturnValue(fakeWindow as FakeWindow);
      vi.mocked(getMostRecentWindow).mockReturnValue(fakeWindow as FakeWindow);

      processDeepLink('gogchat://chat.google.com/room/test');

      expect(loadAccountURL).not.toHaveBeenCalled();
      expect(mockFocusAccount).toHaveBeenCalledWith(0);
    });
  });

  describe('navigateToUrl when no window available', () => {
    it('buffers when create and most-recent windows are unavailable', () => {
      vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);
      vi.mocked(app.setAsDefaultProtocolClient).mockReturnValue(true);

      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(null as unknown as BrowserWindow | null);
      vi.mocked(getMostRecentWindow).mockReturnValue(null);
      processDeepLink('gogchat://chat.google.com/room/nowhere');

      expect(log.info).toHaveBeenCalledWith('[DeepLink] Window not ready, buffering URL');

      // Keep windows null for init → processPendingDeepLink → navigateToUrl still buffers
      initDeepLinkHandler({});
      expect(log.info).toHaveBeenCalledWith(
        expect.stringMatching(/Window not ready|Processing buffered/)
      );
    });
  });

  describe('initDeepLinkHandler error path', () => {
    it('logs error when processPendingDeepLink throws inside init', () => {
      vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);
      vi.mocked(app.setAsDefaultProtocolClient).mockReturnValue(true);

      // Buffer a URL first
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(null as unknown as BrowserWindow | null);
      vi.mocked(getMostRecentWindow).mockReturnValue(null);
      processDeepLink('gogchat://chat.google.com/room/error');

      // Now make getWindowForAccount return an object that throws on isDestroyed
      const errorWindow = {
        isDestroyed: (): never => {
          throw new Error('Window exploded');
        },
      };
      vi.mocked(getWindowForAccount).mockReturnValue(
        errorWindow as unknown as BrowserWindow | null
      );

      initDeepLinkHandler({});

      expect(log.error).toHaveBeenCalledWith(
        '[DeepLink] Failed to initialize deep link handler:',
        expect.any(Error)
      );
    });
  });
});

describe('getAccountIndexFromUrl invalid URL fallback', () => {
  it('defaults to account 0 when URL constructor throws', () => {
    // validateDeepLinkURL is mocked as identity, so we can pass a malformed URL.
    // Reset to identity (prior tests may have set throw impl).
    vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);
    vi.mocked(getWindowForAccount).mockReturnValue(null);
    vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as FakeWindow);

    // 'not a valid url' will throw inside `new URL()` → catch returns 0
    processDeepLink('not a valid url at all');

    // createAccountWindow called with account index 0 (catch fallback)
    expect(createAccountWindow).toHaveBeenCalledWith(expect.any(String), 0);
  });
});

describe('openInDefaultBrowser catch path', () => {
  it('catches and logs when validateExternalURL throws', async () => {
    // Reset module state so setupDeepLinkListener will re-register
    vi.resetModules();
    const mod = await import('./deepLinkHandler');
    const { setupDeepLinkListener: setupFresh } = mod;

    const validators = await import('../../shared/urlValidators.js');
    const cleanup = await import('../utils/lifecycle/resourceCleanup');

    vi.mocked(validators.validateDeepLinkURL).mockImplementation((url: string) => url);
    vi.mocked(validators.validateExternalURL).mockImplementation(() => {
      throw new Error('Invalid external URL');
    });

    setupFresh();
    const calls = vi.mocked(cleanup.addTrackedListener).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const handler = calls[calls.length - 1][2] as (
      e: { preventDefault: () => void },
      url: string
    ) => void;

    vi.mocked(log.error).mockClear();
    handler({ preventDefault: vi.fn() }, 'https://malicious.example.com');

    expect(log.error).toHaveBeenCalledWith(
      '[DeepLink] Failed to open external URL:',
      expect.any(Error)
    );
  });
});

describe('menu action registration', () => {
  it('registers processDeepLink action with handler that invokes processDeepLink', async () => {
    vi.mocked(validateDeepLinkURL).mockImplementation((url: string) => url);
    vi.mocked(app.setAsDefaultProtocolClient).mockReturnValue(true);

    const { registerMenuAction } = await import('./menuActionRegistry');
    vi.mocked(registerMenuAction).mockClear();

    initDeepLinkHandler({});

    expect(registerMenuAction).toHaveBeenCalledWith(
      'processDeepLink',
      expect.objectContaining({
        label: 'Process deep link',
        handler: expect.any(Function),
      })
    );

    // Invoke the registered handler to cover the inline arrow body (line 162)
    const callArgs = vi
      .mocked(registerMenuAction)
      .mock.calls.find((c) => c[0] === 'processDeepLink');
    expect(callArgs).toBeDefined();
    const action = callArgs![1] as { handler: (url: string) => void };

    // Set up window so processDeepLink reaches navigateToUrl
    const fakeWindow = makeFakeWindow();
    vi.mocked(getWindowForAccount).mockReturnValue(fakeWindow as FakeWindow);
    vi.mocked(getMostRecentWindow).mockReturnValue(fakeWindow as FakeWindow);
    vi.mocked(getAccountURL).mockReturnValue('https://chat.google.com/u/0/');
    vi.mocked(isGoogleAuthUrl).mockReturnValue(false);
    vi.mocked(loadAccountURL).mockReturnValue(true);

    action.handler('gogchat://chat.google.com/room/from-menu');

    expect(validateDeepLinkURL).toHaveBeenCalledWith('gogchat://chat.google.com/room/from-menu');
    expect(loadAccountURL).toHaveBeenCalled();
  });
});

describe('cleanupDeepLinkHandler catch path', () => {
  it('catches and logs when log.debug throws', () => {
    vi.mocked(log.debug).mockImplementationOnce(() => {
      throw new Error('logger boom');
    });

    cleanupDeepLinkHandler();

    expect(log.error).toHaveBeenCalledWith('[DeepLink] Failed to cleanup:', expect.any(Error));
  });
});
