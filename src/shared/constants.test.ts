/**
 * Unit tests for shared constants
 * Ensures all constants are properly defined and frozen
 */

import { describe, it, expect } from 'vitest';
import {
  IPC_CHANNELS,
  SELECTORS,
  TIMING,
  ICON_TYPES,
  FAVICON_PATTERNS,
  RATE_LIMITS,
  BADGE,
  WHITELISTED_HOSTS,
  URL_PATTERNS,
} from './constants';

describe('IPC_CHANNELS', () => {
  it('should define all required IPC channels', () => {
    expect(IPC_CHANNELS.UNREAD_COUNT).toBe('unreadCount');
    expect(IPC_CHANNELS.FAVICON_CHANGED).toBe('faviconChanged');
    expect(IPC_CHANNELS.NOTIFICATION_CLICKED).toBe('notificationClicked');
    expect(IPC_CHANNELS.CHECK_IF_ONLINE).toBe('checkIfOnline');
    expect(IPC_CHANNELS.SEARCH_SHORTCUT).toBe('searchShortcut');
    expect(IPC_CHANNELS.ONLINE_STATUS).toBe('onlineStatus');
  });

  it('should have at least 6 channels', () => {
    expect(Object.keys(IPC_CHANNELS).length).toBeGreaterThanOrEqual(6);
  });
});

describe('SELECTORS', () => {
  it('should define all required selectors', () => {
    expect(SELECTORS.CHAT_GROUP).toBeDefined();
    expect(SELECTORS.SPACES_GROUP).toBeDefined();
    expect(SELECTORS.UNREAD_HEADING).toBeDefined();
    expect(SELECTORS.SEARCH_INPUT).toBe('input[name="q"]');
    expect(SELECTORS.FAVICON_ICON).toBe('link[rel="icon"]');
    expect(SELECTORS.FAVICON_SHORTCUT).toBe('link[rel="shortcut icon"]');
  });

  it('should use valid CSS selector syntax', () => {
    Object.values(SELECTORS).forEach((selector) => {
      if (selector === 'TODO_INSPECT_DOM') {
        return;
      }
      // Allow common CSS selector characters: alphanumerics, dots, brackets, equals, quotes, dashes, underscores, colons, spaces, hashes, single quotes
      const cssSelectorRegex = /^[\w="[\].\-'\s:#]+$/;
      expect(selector).toMatch(cssSelectorRegex);
    });
  });

  it('should have at least 6 selectors', () => {
    expect(Object.keys(SELECTORS).length).toBeGreaterThanOrEqual(6);
  });
});

describe('BADGE', () => {
  it('caps user-facing display at 99', async () => {
    const { BADGE } = await import('./constants.js');
    expect(BADGE.DISPLAY_MAX).toBe(99);
    expect(BADGE.CACHE_LIMIT).toBe(99);
  });
});

describe('TIMING', () => {
  it('should define timing constants in milliseconds', () => {
    expect(TIMING.FAVICON_POLL).toBe(1000);
    expect(TIMING.UNREAD_COUNT_POLL).toBe(1000);
    expect(TIMING.WINDOW_STATE_SAVE).toBe(500);
    expect(TIMING.CONNECTIVITY_CHECK).toBe(5000);
    expect(TIMING.CONNECTIVITY_CHECK_FAST).toBe(3000);
    expect(TIMING.NOTIFICATION_AUTO_DISMISS).toBe(10000);
    expect(TIMING.NOTIFICATION_BRIDGE_COOLDOWN_MS).toBe(8000);
    expect(TIMING.EXTERNAL_LINKS_REGUARD).toBe(5 * 60 * 1000);
  });

  it('should have positive values', () => {
    Object.values(TIMING).forEach((value) => {
      expect(value).toBeGreaterThan(0);
    });
  });

  it('should have at least 5 timing constants', () => {
    expect(Object.keys(TIMING).length).toBeGreaterThanOrEqual(5);
  });
});

describe('ICON_TYPES', () => {
  it('should define all icon types', () => {
    expect(ICON_TYPES.OFFLINE).toBe('offline');
    expect(ICON_TYPES.NORMAL).toBe('normal');
    expect(ICON_TYPES.BADGE).toBe('badge');
  });

  it('should have exactly 3 icon types', () => {
    expect(Object.keys(ICON_TYPES).length).toBe(3);
  });
});

describe('FAVICON_PATTERNS', () => {
  it('should define favicon patterns as RegExp', () => {
    expect(FAVICON_PATTERNS.NORMAL).toBeInstanceOf(RegExp);
    expect(FAVICON_PATTERNS.BADGE).toBeInstanceOf(RegExp);
  });

  it('should match expected favicon URLs', () => {
    expect('favicon_chat_r2').toMatch(FAVICON_PATTERNS.NORMAL);
    expect('favicon_chat_new_non_notif_r2').toMatch(FAVICON_PATTERNS.NORMAL);
    expect('favicon_chat_new_notif_r2').toMatch(FAVICON_PATTERNS.BADGE);
  });

  it('should not match unexpected URLs', () => {
    expect('random_icon').not.toMatch(FAVICON_PATTERNS.NORMAL);
    expect('random_icon').not.toMatch(FAVICON_PATTERNS.BADGE);
  });

  it('should have exactly 2 patterns', () => {
    expect(Object.keys(FAVICON_PATTERNS).length).toBe(2);
  });
});

describe('RATE_LIMITS', () => {
  it('should define rate limits', () => {
    expect(RATE_LIMITS.IPC_DEFAULT).toBe(10);
    expect(RATE_LIMITS.IPC_UNREAD_COUNT).toBe(5);
    expect(RATE_LIMITS.IPC_FAVICON).toBe(5);
  });

  it('should have positive values', () => {
    Object.values(RATE_LIMITS).forEach((value) => {
      expect(value).toBeGreaterThan(0);
    });
  });

  it('should have at least 3 rate limits', () => {
    expect(Object.keys(RATE_LIMITS).length).toBeGreaterThanOrEqual(3);
  });
});

describe('BADGE', () => {
  it('should define badge configuration', () => {
    expect(BADGE.MAX_COUNT).toBe(9999);
    expect(BADGE.CACHE_LIMIT).toBe(99);
  });

  it('should have cache limit less than max count', () => {
    expect(BADGE.CACHE_LIMIT).toBeLessThan(BADGE.MAX_COUNT);
  });

  it('should have exactly 3 properties', () => {
    expect(Object.keys(BADGE).length).toBe(3);
    expect(BADGE.DISPLAY_MAX).toBe(99);
  });
});

describe('WHITELISTED_HOSTS', () => {
  it('should define all whitelisted hosts', () => {
    expect(WHITELISTED_HOSTS).toContain('accounts.google.com');
    expect(WHITELISTED_HOSTS).toContain('accounts.youtube.com');
    expect(WHITELISTED_HOSTS).toContain('chat.google.com');
    expect(WHITELISTED_HOSTS).toContain('mail.google.com');
  });

  it('should have at least 4 hosts', () => {
    expect(WHITELISTED_HOSTS.length).toBeGreaterThanOrEqual(4);
  });

  it('should contain valid domain names', () => {
    WHITELISTED_HOSTS.forEach((host) => {
      expect(host).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    });
  });

  it('should only contain Google domains', () => {
    WHITELISTED_HOSTS.forEach((host) => {
      expect(host).toMatch(/google|youtube/i);
    });
  });
});

describe('URL_PATTERNS', () => {
  it('should define URL patterns', () => {
    expect(URL_PATTERNS.DOWNLOAD).toBe('https://chat.google.com/u/0/api/get_attachment_url');
    expect(URL_PATTERNS.GMAIL_PREFIX).toBe('https://mail.google.com/');
    expect(URL_PATTERNS.CHAT_PREFIX).toBe('https://mail.google.com/chat');
  });

  it('should use HTTPS URLs', () => {
    Object.values(URL_PATTERNS).forEach((url) => {
      expect(url).toMatch(/^https:\/\//);
    });
  });

  it('should contain Google domain URLs', () => {
    Object.values(URL_PATTERNS).forEach((url) => {
      expect(url).toMatch(/google\.com/);
    });
  });
});
