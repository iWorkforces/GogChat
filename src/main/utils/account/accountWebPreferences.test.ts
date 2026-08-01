/**
 * Invariant tests for shared account webPreferences factory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('/app/root'),
  },
}));

import {
  createAccountWebPreferences,
  parseAccountIndexFromPartition,
} from './accountWebPreferences.js';

describe('parseAccountIndexFromPartition', () => {
  it('parses persist:account-N', () => {
    expect(parseAccountIndexFromPartition('persist:account-0')).toBe(0);
    expect(parseAccountIndexFromPartition('persist:account-3')).toBe(3);
  });

  it('defaults to 0 for missing or invalid', () => {
    expect(parseAccountIndexFromPartition(undefined)).toBe(0);
    expect(parseAccountIndexFromPartition('persist:other')).toBe(0);
    expect(parseAccountIndexFromPartition('')).toBe(0);
  });
});

describe('createAccountWebPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets security baseline and preload path', () => {
    const prefs = createAccountWebPreferences({ partition: 'persist:account-0' });
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.sandbox).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.webSecurity).toBe(true);
    expect(prefs.allowRunningInsecureContent).toBe(false);
    expect(prefs.autoplayPolicy).toBe('user-gesture-required');
    expect(prefs.disableBlinkFeatures).toBe('Auxclick');
    expect(prefs.preload).toBe('/app/root/lib/preload/index.js');
    expect(prefs.partition).toBe('persist:account-0');
  });

  it('disables backgroundThrottling for account-0', () => {
    const prefs = createAccountWebPreferences({ partition: 'persist:account-0' });
    expect(prefs.backgroundThrottling).toBe(false);
  });

  it('enables backgroundThrottling for accounts 1+', () => {
    const prefs = createAccountWebPreferences({ partition: 'persist:account-2' });
    expect(prefs.backgroundThrottling).toBe(true);
  });

  it('omits partition when not provided and treats as account-0 throttle', () => {
    const prefs = createAccountWebPreferences();
    expect(prefs.partition).toBeUndefined();
    expect(prefs.backgroundThrottling).toBe(false);
  });
});
