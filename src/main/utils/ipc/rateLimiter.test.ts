/**
 * Unit tests for IPC rate limiter
 * Tests rate limiting, cleanup, and security features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IPCRateLimiter, getRateLimiter, destroyRateLimiter } from './rateLimiter';
import { IPC_CHANNELS } from '../../../shared/constants';

describe('IPCRateLimiter', () => {
  let limiter: IPCRateLimiter;

  beforeEach(() => {
    limiter = new IPCRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic rate limiting', () => {
    it('should allow requests within rate limit', () => {
      const channel = 'test-channel';

      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }
    });

    it('should block requests exceeding default rate limit', () => {
      const channel = 'test-channel';

      // Exhaust the limit (default 10/sec)
      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }

      // Next request should be blocked
      expect(limiter.isAllowed(channel)).toBe(false);
    });

    it('should reset rate limit after 1 second', () => {
      const channel = 'test-channel';

      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed(channel);
      }

      // Should be blocked
      expect(limiter.isAllowed(channel)).toBe(false);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Should be allowed again
      expect(limiter.isAllowed(channel)).toBe(true);
    });

    it('should handle custom rate limits', () => {
      const channel = 'custom-channel';
      const customLimit = 5;

      // Make exactly 5 requests (custom limit)
      for (let i = 0; i < customLimit; i++) {
        expect(limiter.isAllowed(channel, customLimit)).toBe(true);
      }

      // Next should be blocked
      expect(limiter.isAllowed(channel, customLimit)).toBe(false);
    });
  });

  describe('Per-channel rate limits', () => {
    it('should use default channel-specific limits', () => {
      // unreadCount has limit of 5
      const unreadChannel = IPC_CHANNELS.UNREAD_COUNT;

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(unreadChannel)).toBe(true);
      }

      expect(limiter.isAllowed(unreadChannel)).toBe(false);
    });

    it('isolates the same channel across sender ids', () => {
      const channel = 'checkIfOnline';
      expect(limiter.isAllowed(channel, 1, 10)).toBe(true);
      expect(limiter.isAllowed(channel, 1, 10)).toBe(false);
      expect(limiter.isAllowed(channel, 1, 11)).toBe(true);
      expect(limiter.isAllowed(channel, 1, 11)).toBe(false);
    });

    it('should isolate rate limits between channels', () => {
      const channel1 = 'channel-1';
      const channel2 = 'channel-2';

      // Exhaust channel 1
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed(channel1);
      }

      expect(limiter.isAllowed(channel1)).toBe(false);

      // Channel 2 should still work
      expect(limiter.isAllowed(channel2)).toBe(true);
    });

    it('should apply stricter limits to sensitive channels', () => {
      // These channels have 5 msg/sec limit instead of 10
      expect(limiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)).toBe(true);
      expect(limiter.isAllowed(IPC_CHANNELS.FAVICON_CHANGED)).toBe(true);
    });
  });

  describe('Window counter management', () => {
    it('should reset counter when window expires', () => {
      const channel = 'test-channel';

      // Make 5 requests at t=0
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed(channel);
      }

      // Advance time by 500ms (still in same window)
      vi.advanceTimersByTime(500);

      // Make 5 more requests at t=500ms (same window, total 10)
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed(channel);
      }

      // Should be at limit (10 requests in current window)
      expect(limiter.isAllowed(channel)).toBe(false);

      // Advance past the window boundary (total >1000ms from window start)
      vi.advanceTimersByTime(600);

      // Window expired — counter resets, should allow new requests
      expect(limiter.isAllowed(channel)).toBe(true);
    });

    it('should track blocked attempts', () => {
      const channel = 'test-channel';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed(channel);
      }

      // Try to send more
      limiter.isAllowed(channel);
      limiter.isAllowed(channel);

      const stats = limiter.getStats(channel);
      expect(stats?.totalBlocked).toBe(2);
    });
  });

  describe('Statistics', () => {
    it('should return stats for existing channel', () => {
      const channel = 'test-channel';

      limiter.isAllowed(channel);
      limiter.isAllowed(channel);

      const stats = limiter.getStats(channel);

      expect(stats).toBeDefined();
      expect(stats?.messagesLastSecond).toBe(2);
      expect(stats?.totalBlocked).toBe(0);
    });

    it('should return undefined for non-existent channel', () => {
      expect(limiter.getStats('nonexistent')).toBeUndefined();
    });

    it('should track blocked attempts correctly', () => {
      const channel = 'test-channel';

      // Exhaust limit
      for (let i = 0; i < 15; i++) {
        limiter.isAllowed(channel);
      }

      const stats = limiter.getStats(channel);
      expect(stats?.totalBlocked).toBe(5); // 15 attempts - 10 allowed = 5 blocked
    });
  });

  describe('Cleanup', () => {
    it('should cleanup periodically every minute', () => {
      const channel = 'test-channel';

      limiter.isAllowed(channel);

      // Wait for cleanup interval
      vi.advanceTimersByTime(60000);

      // Channel should still exist (only 1 minute old)
      expect(limiter.getStats(channel)).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid successive requests', () => {
      const channel = 'rapid-channel';

      for (let i = 0; i < 100; i++) {
        limiter.isAllowed(channel);
      }

      const stats = limiter.getStats(channel);
      expect(stats?.totalBlocked).toBeGreaterThan(80);
    });

    it('should handle zero or negative custom limits gracefully', () => {
      const channel = 'test-channel';

      expect(limiter.isAllowed(channel, 0)).toBe(false);
      expect(limiter.isAllowed(channel, -1)).toBe(false);
    });

    it('should handle very large custom limits', () => {
      const channel = 'test-channel';
      const largeLimit = 10000;

      for (let i = 0; i < 100; i++) {
        expect(limiter.isAllowed(channel, largeLimit)).toBe(true);
      }
    });

    it('should handle empty channel names', () => {
      const emptyChannel = '';

      expect(limiter.isAllowed(emptyChannel)).toBe(true);
      expect(limiter.getStats(emptyChannel)).toBeDefined();
    });
  });

  describe('Security scenarios', () => {
    it('should prevent IPC flooding DoS attack', () => {
      const channel = 'attack-channel';
      let blockedCount = 0;

      // Simulate flooding attack (1000 requests)
      for (let i = 0; i < 1000; i++) {
        if (!limiter.isAllowed(channel)) {
          blockedCount++;
        }
      }

      // Should block most requests
      expect(blockedCount).toBeGreaterThan(900);
    });

    it('should prevent channel exhaustion attack', () => {
      // Try to create many channels to exhaust memory
      for (let i = 0; i < 200; i++) {
        limiter.isAllowed(`attack-${i}`);
      }

      // Advance time to trigger cleanup
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Make one more request to trigger cleanup
      limiter.isAllowed('trigger-cleanup');

      // Limiter should still function correctly
      expect(limiter.isAllowed('normal-channel')).toBe(true);
    });

    it('should enforce stricter limits on sensitive channels', () => {
      // Sensitive channels have stricter limits
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)).toBe(true);
      }
      expect(limiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)).toBe(false);

      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(IPC_CHANNELS.FAVICON_CHANGED)).toBe(true);
      }
      expect(limiter.isAllowed(IPC_CHANNELS.FAVICON_CHANGED)).toBe(false);
    });
  });

  describe('Time window behavior', () => {
    it('should use fixed-window counter for rate limiting', () => {
      const channel = 'test-channel';

      // Make 5 requests at t=0
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }

      // Advance 500ms (still in same window)
      vi.advanceTimersByTime(500);

      // Make 5 more requests at t=500ms (same window, total 10)
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }

      // Should be at limit now (10 requests in current window)
      expect(limiter.isAllowed(channel)).toBe(false);

      // Advance past window expiry (total >1000ms from window start)
      vi.advanceTimersByTime(600);

      // Window expired — counter resets, should allow new requests
      expect(limiter.isAllowed(channel)).toBe(true);
    });
  });
});

describe('Singleton functions', () => {
  afterEach(() => {
    destroyRateLimiter();
  });

  it('should create singleton instance with getRateLimiter', () => {
    const instance1 = getRateLimiter();
    const instance2 = getRateLimiter();

    expect(instance1).toBeDefined();
    expect(instance1).toBe(instance2);
  });

  it('should allow using singleton rate limiter', () => {
    const limiter = getRateLimiter();

    expect(limiter.isAllowed('test-channel')).toBe(true);
  });

  it('should destroy singleton with destroyRateLimiter', () => {
    const instance1 = getRateLimiter();
    instance1.isAllowed('test-channel');

    destroyRateLimiter();

    const instance2 = getRateLimiter();
    expect(instance2).not.toBe(instance1);
  });

  it('should handle destroying non-existent singleton', () => {
    expect(() => destroyRateLimiter()).not.toThrow();
  });

  it('should clear state when singleton is destroyed', () => {
    const limiter = getRateLimiter();

    for (let i = 0; i < 10; i++) {
      limiter.isAllowed('test-channel');
    }

    expect(limiter.isAllowed('test-channel')).toBe(false);

    destroyRateLimiter();
    const newLimiter = getRateLimiter();

    expect(newLimiter.isAllowed('test-channel')).toBe(true);
  });
});

describe('Additional methods coverage', () => {
  let limiter: IPCRateLimiter;

  beforeEach(() => {
    limiter = new IPCRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
  });

  it('should reset all channels with resetAll', () => {
    limiter.isAllowed('channel-1');
    limiter.isAllowed('channel-2');
    limiter.isAllowed('channel-3');

    limiter.resetAll();

    expect(limiter.getStats('channel-1')).toBeUndefined();
    expect(limiter.getStats('channel-2')).toBeUndefined();
    expect(limiter.getStats('channel-3')).toBeUndefined();
  });

  it('should get all channel stats with getAllStats', () => {
    limiter.isAllowed('channel-1');
    limiter.isAllowed('channel-2');
    limiter.isAllowed('channel-3');

    const allStats = limiter.getAllStats();

    expect(allStats.size).toBe(3);
    expect(allStats.has('channel-1')).toBe(true);
    expect(allStats.has('channel-2')).toBe(true);
    expect(allStats.has('channel-3')).toBe(true);
  });

  it('should include message counts in getAllStats', () => {
    for (let i = 0; i < 5; i++) {
      limiter.isAllowed('fast-channel');
    }

    for (let i = 0; i < 3; i++) {
      limiter.isAllowed('slow-channel');
    }

    const allStats = limiter.getAllStats();

    const fastStats = allStats.get('fast-channel');
    const slowStats = allStats.get('slow-channel');

    expect(fastStats?.messagesLastSecond).toBe(5);
    expect(slowStats?.messagesLastSecond).toBe(3);
  });

  it('should include blocked counts in getAllStats', () => {
    const channel = 'test-channel';

    for (let i = 0; i < 15; i++) {
      limiter.isAllowed(channel);
    }

    const allStats = limiter.getAllStats();
    const stats = allStats.get(channel);

    expect(stats?.totalBlocked).toBe(5);
  });

  it('should return empty map when no channels active', () => {
    const allStats = limiter.getAllStats();

    expect(allStats.size).toBe(0);
  });

  it('should reset individual channel', () => {
    limiter.isAllowed('test-channel');
    expect(limiter.getStats('test-channel')).toBeDefined();

    limiter.reset('test-channel');
    expect(limiter.getStats('test-channel')).toBeUndefined();
  });
});

describe('Cleanup method coverage', () => {
  let limiter: IPCRateLimiter;

  beforeEach(() => {
    // IMPORTANT: Install fake timers BEFORE creating the limiter
    // so that createTrackedInterval's setInterval is controlled by fake timers
    vi.useFakeTimers();
    limiter = new IPCRateLimiter();
  });

  afterEach(() => {
    limiter.destroy();
    vi.useRealTimers();
  });

  it('should remove entries older than 5 minutes via cleanup interval', () => {
    const channel = 'old-channel';

    limiter.isAllowed(channel);
    expect(limiter.getStats(channel)).toBeDefined();

    // Advance past 5 minutes so entries become stale
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);

    // Trigger cleanup interval (fires every 60s)
    vi.advanceTimersByTime(60000);

    // Entry should be removed since its windowStart is >5 minutes old
    expect(limiter.getStats(channel)).toBeUndefined();
  });

  it('should not remove entries less than 5 minutes old', () => {
    const channel = 'recent-channel';

    limiter.isAllowed(channel);
    expect(limiter.getStats(channel)).toBeDefined();

    // Advance to just under 5 minutes
    vi.advanceTimersByTime(4 * 60 * 1000);

    // Trigger cleanup interval
    vi.advanceTimersByTime(60000);

    // Entry should still exist
    expect(limiter.getStats(channel)).toBeDefined();
  });

  it('should log debug when removing blocked entries during cleanup', () => {
    const channel = 'blocked-channel';

    // Exhaust the limit to create blocked entries
    for (let i = 0; i < 15; i++) {
      limiter.isAllowed(channel);
    }

    const stats = limiter.getStats(channel);
    expect(stats?.totalBlocked).toBeGreaterThan(0);

    // Advance past 5 minutes + trigger cleanup
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    vi.advanceTimersByTime(60000);

    // Entry should be removed
    expect(limiter.getStats(channel)).toBeUndefined();
  });
});
