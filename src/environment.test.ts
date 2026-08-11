/**
 * Unit tests for environment configuration
 *
 * Tests both isPackaged=true (production) and isPackaged=false (development)
 * scenarios using vi.resetModules() + dynamic import for module re-evaluation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock urls (stable across all tests)
vi.mock('./urls', () => ({
  default: {
    appUrl: 'https://chat.google.com',
    logoutUrl: 'https://www.google.com/accounts/Logout?continue=https://chat.google.com',
  },
}));

// Mock electron with configurable isPackaged
let mockIsPackaged = false;

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged;
    },
  },
}));

describe('Environment', () => {
  beforeEach(() => {
    vi.resetModules();
    mockIsPackaged = false;
  });

  // ========================================================================
  // isDev when isPackaged=false (development)
  // ========================================================================

  it('isDev is true when app.isPackaged is false', async () => {
    mockIsPackaged = false;
    const environment = await import('./environment');

    expect(environment.default.isDev).toBe(true);
  });

  // ========================================================================
  // isDev when isPackaged=true (production)
  // ========================================================================

  it('isDev is false when app.isPackaged is true', async () => {
    mockIsPackaged = true;
    const environment = await import('./environment');

    expect(environment.default.isDev).toBe(false);
  });

  // ========================================================================
  // URL constants
  // ========================================================================

  it('includes appUrl from urls module', async () => {
    const environment = await import('./environment');

    expect(environment.default.appUrl).toBe('https://chat.google.com');
  });

  it('resolveAppUrl ignores GOGCHAT_TEST_APP_URL unless TESTING is true', async () => {
    const { resolveAppUrl } = await import('./environment');
    expect(
      resolveAppUrl(
        { GOGCHAT_TEST_APP_URL: 'file:///tmp/electron-harness.html' },
        'https://chat.google.com'
      )
    ).toBe('https://chat.google.com');
  });

  it('resolveAppUrl accepts file and loopback http only when TESTING is true', async () => {
    const { resolveAppUrl } = await import('./environment');
    expect(
      resolveAppUrl(
        { TESTING: 'true', GOGCHAT_TEST_APP_URL: 'file:///tmp/electron-harness.html' },
        'https://chat.google.com'
      )
    ).toBe('file:///tmp/electron-harness.html');
    expect(
      resolveAppUrl(
        { TESTING: 'true', GOGCHAT_TEST_APP_URL: 'http://127.0.0.1:9/harness' },
        'https://chat.google.com'
      )
    ).toBe('http://127.0.0.1:9/harness');
    expect(
      resolveAppUrl(
        { TESTING: 'true', GOGCHAT_TEST_APP_URL: 'https://evil.example/chat' },
        'https://chat.google.com'
      )
    ).toBe('https://chat.google.com');
  });

  it('includes logoutUrl from urls module', async () => {
    const environment = await import('./environment');

    expect(environment.default.logoutUrl).toBe(
      'https://www.google.com/accounts/Logout?continue=https://chat.google.com'
    );
  });

  // ========================================================================
  // Immutability
  // ========================================================================

  it('is frozen (Object.isFrozen)', async () => {
    const environment = await import('./environment');

    expect(Object.isFrozen(environment.default)).toBe(true);
  });

  it('does not allow adding new properties', async () => {
    const environment = await import('./environment');

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (environment.default as any).newProperty = 'value';
    }).toThrow();
  });

  it('does not allow modifying existing properties', async () => {
    const environment = await import('./environment');

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (environment.default as any).isDev = 'changed';
    }).toThrow();
  });

  // ========================================================================
  // All required properties
  // ========================================================================

  it('exports all required properties', async () => {
    const environment = await import('./environment');

    expect(environment.default).toHaveProperty('isDev');
    expect(environment.default).toHaveProperty('appUrl');
    expect(environment.default).toHaveProperty('logoutUrl');
  });

  it('has exactly the expected keys', async () => {
    const environment = await import('./environment');
    const keys = Object.keys(environment.default).sort();

    expect(keys).toEqual(['appUrl', 'isDev', 'logoutUrl']);
  });
});
