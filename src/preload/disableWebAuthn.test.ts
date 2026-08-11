/**
 * Tests for disableWebAuthn preload script
 * Verifies that navigator.credentials is disabled to prevent WebAuthn/U2F auth issues
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  webFrame: {
    executeJavaScript: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('disableWebAuthn', () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset navigator.credentials mock before each test
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  it('sets navigator.credentials to undefined', async () => {
    // Set up navigator with credentials
    Object.defineProperty(globalThis, 'navigator', {
      value: { credentials: { create: vi.fn(), get: vi.fn() } },
      writable: true,
      configurable: true,
    });

    // Import the module (triggers side effect)
    const { installDisableWebAuthn } = await import('./disableWebAuthn');
    installDisableWebAuthn();

    // navigator.credentials should be undefined
    expect((navigator as unknown as Record<string, unknown>).credentials).toBeUndefined();
  });

  it('does not throw when navigator is undefined', async () => {
    // Remove navigator entirely
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Should not throw
    const loaded = import('./disableWebAuthn');
    await expect(loaded).resolves.toBeDefined();
    (await loaded).installDisableWebAuthn();
  });

  it('logs success message after disabling', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    Object.defineProperty(globalThis, 'navigator', {
      value: { credentials: { create: vi.fn() } },
      writable: true,
      configurable: true,
    });

    const { installDisableWebAuthn } = await import('./disableWebAuthn');
    installDisableWebAuthn();

    expect(logSpy).toHaveBeenCalledWith('[Preload] WebAuthn/U2F disabled via property override');
    logSpy.mockRestore();
  });

  it('logs warning if disabling fails (credentials already non-configurable)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Make credentials non-configurable first
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'credentials', {
      value: { create: vi.fn() },
      writable: false,
      configurable: false,
    });

    const { installDisableWebAuthn } = await import('./disableWebAuthn');
    installDisableWebAuthn();

    // Should have warned about the failure
    expect(warnSpy).toHaveBeenCalledWith(
      '[Preload] Failed to disable WebAuthn/U2F:',
      expect.any(TypeError)
    );
    warnSpy.mockRestore();
  });
});
