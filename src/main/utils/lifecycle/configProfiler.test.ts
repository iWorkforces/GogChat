/**
 * Tests for configProfiler utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import store from '../../config.js';
import {
  profileConfigStoreReads,
  profileSingleKeyRead,
  compareStorePerformance,
} from './configProfiler';

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config store
vi.mock('../../config.js', () => ({
  default: {
    get: vi.fn((key: string) => {
      if (key.includes('autoCheckForUpdates')) return true;
      if (key.includes('autoLaunchAtLogin')) return false;
      if (key.includes('startHidden')) return false;
      if (key.includes('hideMenuBar')) return true;
      if (key.includes('disableSpellChecker')) return false;
      if (key.includes('isMaximized')) return false;
      if (key.includes('bounds')) return { x: 0, y: 0, width: 800, height: 600 };
      return undefined;
    }),
  },
}));

describe('ConfigProfiler', () => {
  let nowMs = 1_000;

  beforeEach(() => {
    vi.clearAllMocks();
    nowMs = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      nowMs += 1;
      return nowMs;
    });
  });

  afterEach(() => {
    vi.mocked(performance.now).mockRestore();
  });

  describe('profileConfigStoreReads', () => {
    it('should profile multiple iterations of config reads', () => {
      const avgTime = profileConfigStoreReads(10);

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(typeof avgTime).toBe('number');
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should return reasonable average time', () => {
      const avgTime = profileConfigStoreReads(50);

      // Average time should be reasonable (less than 100ms per iteration)
      expect(avgTime).toBeLessThan(100);
    });

    it('should handle small iteration counts', () => {
      const avgTime = profileConfigStoreReads(1);

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should handle large iteration counts', () => {
      const avgTime = profileConfigStoreReads(200);

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should use default iterations when not specified', () => {
      const avgTime = profileConfigStoreReads();

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(avgTime)).toBe(true);
    });
  });

  describe('profileSingleKeyRead', () => {
    it('should profile single key reads', () => {
      const avgTime = profileSingleKeyRead('app.autoCheckForUpdates', 100);

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(typeof avgTime).toBe('number');
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should handle different keys', () => {
      const time1 = profileSingleKeyRead('app.autoCheckForUpdates', 50);
      const time2 = profileSingleKeyRead('window.bounds', 50);
      const time3 = profileSingleKeyRead('app.hideMenuBar', 50);

      expect(time1).toBeGreaterThanOrEqual(0);
      expect(time2).toBeGreaterThanOrEqual(0);
      expect(time3).toBeGreaterThanOrEqual(0);
    });

    it('should handle small iteration counts', () => {
      const avgTime = profileSingleKeyRead('app.autoCheckForUpdates', 1);

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should handle large iteration counts', () => {
      const avgTime = profileSingleKeyRead('app.autoCheckForUpdates', 2000);

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should use default iterations when not specified', () => {
      const avgTime = profileSingleKeyRead('app.autoCheckForUpdates');

      expect(avgTime).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should profile different key patterns', () => {
      // Test various key formats
      const keys = [
        'app.autoCheckForUpdates',
        'window.bounds',
        'app.startHidden',
        'app.hideMenuBar',
        'app.disableSpellChecker',
      ];

      for (const key of keys) {
        const avgTime = profileSingleKeyRead(key, 10);
        expect(avgTime).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(avgTime)).toBe(true);
      }
    });
  });

  describe('compareStorePerformance', () => {
    it('should return performance comparison results', () => {
      const result = compareStorePerformance();

      expect(result).toHaveProperty('noCacheTime');
      expect(result).toHaveProperty('potentialSavings');
      expect(result).toHaveProperty('recommendation');

      expect(typeof result.noCacheTime).toBe('number');
      expect(typeof result.potentialSavings).toBe('number');
      expect(typeof result.recommendation).toBe('string');
    });

    it('should have non-negative times', () => {
      const result = compareStorePerformance();

      expect(result.noCacheTime).toBeGreaterThanOrEqual(0);
      expect(result.potentialSavings).toBeGreaterThanOrEqual(0);
    });

    it('should calculate potential savings', () => {
      const result = compareStorePerformance();

      // Potential savings should be current time minus cache time (0.001ms)
      const expectedSavings = result.noCacheTime - 0.001;
      expect(result.potentialSavings).toBeCloseTo(expectedSavings, 3);
    });

    it('should provide recommendation', () => {
      const result = compareStorePerformance();

      expect(result.recommendation).toBeTruthy();
      expect(result.recommendation.length).toBeGreaterThan(0);

      // Should contain either RECOMMENDED or NOT RECOMMENDED
      expect(
        result.recommendation.includes('RECOMMENDED') ||
          result.recommendation.includes('NOT RECOMMENDED')
      ).toBe(true);
    });

    it('should recommend caching if time exceeds threshold', () => {
      const result = compareStorePerformance();

      if (result.noCacheTime > 0.1) {
        expect(result.recommendation).toContain('RECOMMENDED');
        expect(result.recommendation).not.toContain('NOT RECOMMENDED');
      }
    });

    it('should not recommend caching if time is below threshold', () => {
      const result = compareStorePerformance();

      if (result.noCacheTime <= 0.1) {
        expect(result.recommendation).toContain('NOT RECOMMENDED');
      }
    });

    it('should include timing information in recommendation', () => {
      const result = compareStorePerformance();

      // Recommendation should include the actual time
      expect(result.recommendation).toMatch(/\d+\.\d+ms/);
    });

    it('should include threshold in recommendation', () => {
      const result = compareStorePerformance();

      // Recommendation should mention the threshold
      expect(result.recommendation).toContain('0.1');
    });
  });

  describe('Performance characteristics', () => {
    it('should complete profiling in reasonable time', () => {
      const start = Date.now();
      profileConfigStoreReads(10);
      const elapsed = Date.now() - start;

      // Should complete in less than 5 seconds for 10 iterations
      expect(elapsed).toBeLessThan(5000);
    });

    it('should have consistent results across runs', () => {
      const time1 = profileSingleKeyRead('app.autoCheckForUpdates', 100);
      const time2 = profileSingleKeyRead('app.autoCheckForUpdates', 100);

      // Times should be relatively similar (within 50% variance)
      const variance = Math.abs(time1 - time2) / Math.max(time1, time2);
      expect(variance).toBeLessThan(0.5);
    });

    it('should handle concurrent profiling', () => {
      // Run multiple profiles at the same time
      const promises = [
        Promise.resolve(profileSingleKeyRead('app.autoCheckForUpdates', 10)),
        Promise.resolve(profileSingleKeyRead('window.bounds', 10)),
        Promise.resolve(profileSingleKeyRead('app.hideMenuBar', 10)),
      ];

      return Promise.all(promises).then((times) => {
        times.forEach((time) => {
          expect(time).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(time)).toBe(true);
        });
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle zero iterations gracefully', () => {
      const avgTime = profileConfigStoreReads(0);

      // With 0 iterations, division by zero gives Infinity or NaN
      expect(Number.isNaN(avgTime) || !Number.isFinite(avgTime) || avgTime === 0).toBe(true);
    });

    it('profiles 100000 iterations with exact call counts and mocked elapsed', () => {
      const iterations = 100_000;
      const keysPerIteration = 7;
      vi.mocked(store.get).mockClear();
      vi.mocked(performance.now).mockReset();
      vi.mocked(performance.now).mockReturnValueOnce(1_000).mockReturnValueOnce(3_000);

      const avgTime = profileConfigStoreReads(iterations);

      expect(vi.mocked(store.get)).toHaveBeenCalledTimes(iterations * keysPerIteration);
      expect(avgTime).toBe(0.02);
    });

    it('detects a negative or incorrect mocked elapsed sequence', () => {
      vi.mocked(performance.now).mockReset();
      vi.mocked(performance.now).mockReturnValueOnce(5_000).mockReturnValueOnce(1_000);

      const avgTime = profileConfigStoreReads(100_000);

      expect(avgTime).toBe(-0.04);
      expect(avgTime).not.toBe(0.02);
    });

    it('should handle empty string key', () => {
      const avgTime = profileSingleKeyRead('', 10);

      expect(Number.isFinite(avgTime)).toBe(true);
    });

    it('should handle invalid key', () => {
      const avgTime = profileSingleKeyRead('nonexistent.key.path', 10);

      expect(Number.isFinite(avgTime)).toBe(true);
    });
  });
});
