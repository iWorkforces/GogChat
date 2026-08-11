// @vitest-environment jsdom

/**
 * Tests for passkeyMonitor preload script
 * Verifies navigator.credentials wrapping and failure reporting via IPC
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: { send: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));

// Capture DOMContentLoaded handler
type EventListenerEntry = { type: string; handler: EventListener };
let windowListeners: EventListenerEntry[] = [];

// Mock gogchat bridge API
const mockReportPasskeyFailure = vi.fn();

describe('passkeyMonitor', () => {
  beforeEach(() => {
    vi.resetModules();

    windowListeners = [];
    mockReportPasskeyFailure.mockClear();

    // Stub window.gogchat
    Object.defineProperty(window, 'gogchat', {
      value: { reportPasskeyFailure: mockReportPasskeyFailure },
      configurable: true,
      writable: true,
    });

    // Intercept addEventListener
    const originalAddEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (type: string, handler: EventListenerOrEventListenerObject) => {
        windowListeners.push({ type, handler: handler as EventListener });
        originalAddEventListener(type, handler);
      }
    );

    // Suppress console.debug
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Remove any event listeners we added
    for (const { type, handler } of windowListeners) {
      window.removeEventListener(type, handler);
    }
  });

  it('registers DOMContentLoaded listener', async () => {
    // Set up navigator.credentials
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: vi.fn().mockResolvedValue(null),
          get: vi.fn().mockResolvedValue(null),
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const types = windowListeners.map((l) => l.type);
    expect(types).toContain('DOMContentLoaded');
  });

  it('wraps navigator.credentials.create and get on DOMContentLoaded', async () => {
    const originalCreate = vi.fn().mockResolvedValue(null);
    const originalGet = vi.fn().mockResolvedValue(null);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: originalCreate,
          get: originalGet,
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    // Fire DOMContentLoaded
    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Methods should be wrapped (different from originals)
    expect(navigator.credentials.create).not.toBe(originalCreate);
    expect(navigator.credentials.get).not.toBe(originalGet);
  });

  it('passes through successful create() calls', async () => {
    const mockCredential = { type: 'public-key' };
    const originalCreate = vi.fn().mockResolvedValue(mockCredential);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: originalCreate,
          get: vi.fn().mockResolvedValue(null),
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    const result = await navigator.credentials.create();
    expect(result).toBe(mockCredential);
    expect(mockReportPasskeyFailure).not.toHaveBeenCalled();
  });

  it('passes through successful get() calls', async () => {
    const mockCredential = { type: 'public-key' };
    const originalGet = vi.fn().mockResolvedValue(mockCredential);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: vi.fn().mockResolvedValue(null),
          get: originalGet,
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    const result = await navigator.credentials.get();
    expect(result).toBe(mockCredential);
    expect(mockReportPasskeyFailure).not.toHaveBeenCalled();
  });

  it('reports NotAllowedError from create() and re-throws', async () => {
    const error = new DOMException('User denied', 'NotAllowedError');
    const originalCreate = vi.fn().mockRejectedValue(error);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: originalCreate,
          get: vi.fn().mockResolvedValue(null),
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    await expect(navigator.credentials.create()).rejects.toThrow();
    expect(mockReportPasskeyFailure).toHaveBeenCalledWith('NotAllowedError');
  });

  it('reports NotSupportedError from get() and re-throws', async () => {
    const error = new DOMException('Not supported', 'NotSupportedError');
    const originalGet = vi.fn().mockRejectedValue(error);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: vi.fn().mockResolvedValue(null),
          get: originalGet,
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    await expect(navigator.credentials.get()).rejects.toThrow();
    expect(mockReportPasskeyFailure).toHaveBeenCalledWith('NotSupportedError');
  });

  it('reports only once per session (deduplication)', async () => {
    const error = new DOMException('Denied', 'NotAllowedError');
    const originalCreate = vi.fn().mockRejectedValue(error);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: originalCreate,
          get: vi.fn().mockRejectedValue(error),
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // First failure → reported
    await expect(navigator.credentials.create()).rejects.toThrow();
    expect(mockReportPasskeyFailure).toHaveBeenCalledTimes(1);

    // Second failure → not reported (already reported this session)
    await expect(navigator.credentials.get()).rejects.toThrow();
    expect(mockReportPasskeyFailure).toHaveBeenCalledTimes(1);
  });

  it('does not report non-passkey errors', async () => {
    const error = new TypeError('Network error');
    const originalCreate = vi.fn().mockRejectedValue(error);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: originalCreate,
          get: vi.fn().mockResolvedValue(null),
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    await expect(navigator.credentials.create()).rejects.toThrow();
    expect(mockReportPasskeyFailure).not.toHaveBeenCalled();
  });

  it('handles all 5 passkey error types', async () => {
    const errorTypes = [
      'NotAllowedError',
      'NotSupportedError',
      'SecurityError',
      'AbortError',
      'InvalidStateError',
    ];

    for (const errorType of errorTypes) {
      vi.resetModules();
      mockReportPasskeyFailure.mockClear();
      windowListeners = [];

      // Re-mock addEventListener — just capture, don't forward (avoids jsdom this-check)
      vi.spyOn(window, 'addEventListener').mockImplementation(
        (type: string, h: EventListenerOrEventListenerObject) => {
          windowListeners.push({ type, handler: h as EventListener });
        }
      );

      const error = new DOMException('test', errorType);
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          credentials: {
            create: vi.fn().mockRejectedValue(error),
            get: vi.fn().mockResolvedValue(null),
          },
        },
        writable: true,
        configurable: true,
      });

      const { installPasskeyMonitor } = await import('./passkeyMonitor');
      installPasskeyMonitor();

      const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
      handler!.handler(new Event('DOMContentLoaded'));

      await expect(navigator.credentials.create()).rejects.toThrow();
      expect(mockReportPasskeyFailure).toHaveBeenCalledWith(errorType);
    }
  });

  it('skips monitoring when navigator.credentials is not available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    // Should log and return without error
    expect(console.debug).toHaveBeenCalledWith(
      '[Passkey Monitor] navigator.credentials not available'
    );
  });

  it('sends a validated object over IPC when the gogchat bridge is unavailable', async () => {
    Object.defineProperty(window, 'gogchat', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const error = new DOMException('Denied', 'NotAllowedError');
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        credentials: {
          create: vi.fn().mockRejectedValue(error),
          get: vi.fn().mockResolvedValue(null),
        },
      },
      writable: true,
      configurable: true,
    });

    const { installPasskeyMonitor } = await import('./passkeyMonitor');
    installPasskeyMonitor();

    const handler = windowListeners.find((l) => l.type === 'DOMContentLoaded');
    handler!.handler(new Event('DOMContentLoaded'));

    await expect(navigator.credentials.create()).rejects.toThrow();
    expect(mockReportPasskeyFailure).not.toHaveBeenCalled();
    const { ipcRenderer } = await import('electron');
    const { IPC_CHANNELS } = await import('../shared/constants.js');
    expect(ipcRenderer.send).toHaveBeenCalledWith(
      IPC_CHANNELS.PASSKEY_AUTH_FAILED,
      expect.objectContaining({ errorType: 'NotAllowedError', timestamp: expect.any(Number) })
    );
  });
});
