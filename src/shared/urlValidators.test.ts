/**
 * Comprehensive tests for URL validation utilities (security-critical)
 * Tests all exported functions from urlValidators.ts
 */

import { describe, it, expect } from 'vitest';
import {
  validateFaviconURL,
  validateExternalURL,
  validateAppleSystemPreferencesURL,
  isWhitelistedHost,
  validateDeepLinkURL,
  isAuthenticatedChatUrl,
  isGoogleAuthUrl,
} from './urlValidators.js';

// ---------------------------------------------------------------------------
// validateFaviconURL
// ---------------------------------------------------------------------------
describe('validateFaviconURL', () => {
  describe('accepted protocols', () => {
    it('accepts http URLs', () => {
      expect(validateFaviconURL('http://example.com/favicon.ico')).toBe(
        'http://example.com/favicon.ico'
      );
    });

    it('accepts https URLs', () => {
      expect(validateFaviconURL('https://cdn.example.com/icon.png')).toBe(
        'https://cdn.example.com/icon.png'
      );
    });

    it('accepts data: URLs', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
      expect(validateFaviconURL(dataUrl)).toBe(dataUrl);
    });
  });

  describe('rejected protocols', () => {
    it('rejects javascript: URLs', () => {
      expect(() => validateFaviconURL('javascript:alert(1)')).toThrow(
        'Favicon URL must use http, https, or data protocol'
      );
    });

    it('rejects file: URLs', () => {
      expect(() => validateFaviconURL('file:///etc/passwd')).toThrow(
        'Favicon URL must use http, https, or data protocol'
      );
    });

    it('rejects ftp: URLs', () => {
      expect(() => validateFaviconURL('ftp://files.example.com/icon.ico')).toThrow(
        'Favicon URL must use http, https, or data protocol'
      );
    });
  });

  describe('input validation', () => {
    it('rejects non-string input', () => {
      expect(() => validateFaviconURL(null)).toThrow('Favicon URL must be a string');
      expect(() => validateFaviconURL(undefined)).toThrow('Favicon URL must be a string');
      expect(() => validateFaviconURL(42)).toThrow('Favicon URL must be a string');
      expect(() => validateFaviconURL({})).toThrow('Favicon URL must be a string');
    });

    it('rejects empty string', () => {
      expect(() => validateFaviconURL('')).toThrow('Favicon URL cannot be empty');
    });

    it('rejects whitespace-only string', () => {
      expect(() => validateFaviconURL('   ')).toThrow('Favicon URL cannot be empty');
      expect(() => validateFaviconURL('\t\n')).toThrow('Favicon URL cannot be empty');
    });

    it('rejects URLs exceeding 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2040);
      expect(() => validateFaviconURL(longUrl)).toThrow('Favicon URL too long');
    });

    it('rejects unparseable strings', () => {
      expect(() => validateFaviconURL('not a valid url')).toThrow('Invalid favicon URL format');
    });
  });

  describe('edge cases', () => {
    it('accepts URLs with query strings and fragments', () => {
      const url = 'https://example.com/icon.png?v=2#section';
      expect(validateFaviconURL(url)).toBe(url);
    });

    it('accepts URLs with ports', () => {
      const url = 'https://example.com:8080/favicon.ico';
      expect(validateFaviconURL(url)).toBe(url);
    });
  });
});

// ---------------------------------------------------------------------------
// validateExternalURL
// ---------------------------------------------------------------------------
describe('validateExternalURL', () => {
  describe('accepted URLs', () => {
    it('accepts http URLs', () => {
      expect(validateExternalURL('http://example.com')).toBe('http://example.com/');
    });

    it('accepts https URLs', () => {
      expect(validateExternalURL('https://example.com/path')).toBe('https://example.com/path');
    });

    it('preserves query strings and fragments', () => {
      expect(validateExternalURL('https://example.com/p?q=1&r=2#frag')).toBe(
        'https://example.com/p?q=1&r=2#frag'
      );
    });
  });

  describe('credential stripping', () => {
    it('removes username and password from URLs', () => {
      const result = validateExternalURL('https://user:pass@example.com/path');
      expect(result).toBe('https://example.com/path');
      expect(result).not.toContain('user');
      expect(result).not.toContain('pass');
    });

    it('removes username-only credentials', () => {
      const result = validateExternalURL('https://admin@example.com');
      expect(result).not.toContain('admin');
    });
  });

  describe('protocol whitelist', () => {
    it('rejects javascript: protocol', () => {
      expect(() => validateExternalURL('javascript:alert(1)')).toThrow('Unsafe protocol');
    });

    it('rejects data: protocol', () => {
      expect(() => validateExternalURL('data:text/html,<h1>hi</h1>')).toThrow('Unsafe protocol');
    });

    it('rejects file: protocol', () => {
      expect(() => validateExternalURL('file:///etc/passwd')).toThrow('Unsafe protocol');
    });

    it('rejects vbscript: protocol', () => {
      expect(() => validateExternalURL('vbscript:msgbox(1)')).toThrow('Unsafe protocol');
    });

    it('rejects ftp: protocol', () => {
      expect(() => validateExternalURL('ftp://files.example.com')).toThrow('Unsafe protocol');
    });
  });

  describe('dangerous pattern detection', () => {
    it('rejects javascript: in path', () => {
      expect(() => validateExternalURL('https://example.com/javascript:void(0)')).toThrow(
        'dangerous pattern'
      );
    });

    it('rejects data: in query string', () => {
      expect(() => validateExternalURL('https://example.com/?redirect=data:text')).toThrow(
        'dangerous pattern'
      );
    });

    it('rejects file: in path', () => {
      expect(() => validateExternalURL('https://example.com/file:///secret')).toThrow(
        'dangerous pattern'
      );
    });

    it('rejects about: in path', () => {
      expect(() => validateExternalURL('https://example.com/about:blank')).toThrow(
        'dangerous pattern'
      );
    });

    it('rejects vbscript: in path', () => {
      expect(() => validateExternalURL('https://example.com/vbscript:run')).toThrow(
        'dangerous pattern'
      );
    });
  });

  describe('input validation', () => {
    it('rejects non-string input', () => {
      expect(() => validateExternalURL(null)).toThrow('URL must be a string');
      expect(() => validateExternalURL(undefined)).toThrow('URL must be a string');
      expect(() => validateExternalURL(123)).toThrow('URL must be a string');
      expect(() => validateExternalURL({})).toThrow('URL must be a string');
    });

    it('rejects invalid URL format', () => {
      expect(() => validateExternalURL('not a url')).toThrow('Invalid URL format');
      expect(() => validateExternalURL('')).toThrow('Invalid URL format');
    });

    it('rejects URLs exceeding 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'x'.repeat(2040);
      expect(() => validateExternalURL(longUrl)).toThrow('URL too long');
    });
  });

  describe('edge cases', () => {
    it('handles URLs with unicode domains', () => {
      // URL constructor punycode-encodes international domains
      const result = validateExternalURL('https://münchen.de');
      expect(result).toContain('https://');
    });

    it('handles URLs with ports', () => {
      expect(validateExternalURL('https://localhost:3000/api')).toBe('https://localhost:3000/api');
    });

    it('handles URLs with IP addresses', () => {
      expect(validateExternalURL('https://192.168.1.1/admin')).toBe('https://192.168.1.1/admin');
    });

    it('handles URLs with IPv6 addresses', () => {
      const result = validateExternalURL('https://[::1]:8080/path');
      expect(result).toContain('https://');
    });
  });
});

// ---------------------------------------------------------------------------
// validateAppleSystemPreferencesURL
// ---------------------------------------------------------------------------
describe('validateAppleSystemPreferencesURL', () => {
  const approved = [
    'x-apple.systempreferences:com.apple.preference.security?Privacy',
    'x-apple.systempreferences:com.apple.preference.security',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
    'x-apple.systempreferences:com.apple.preference.notifications',
  ];

  it.each(approved)('accepts approved URL: %s', (url) => {
    expect(validateAppleSystemPreferencesURL(url)).toBe(url);
  });

  it('rejects unapproved system settings URLs', () => {
    expect(() =>
      validateAppleSystemPreferencesURL('x-apple.systempreferences:com.apple.preference.network')
    ).toThrow('Unapproved System Settings URL');
  });

  it('rejects arbitrary strings', () => {
    expect(() => validateAppleSystemPreferencesURL('https://evil.com')).toThrow(
      'Unapproved System Settings URL'
    );
  });

  it('rejects non-string input', () => {
    expect(() => validateAppleSystemPreferencesURL(null)).toThrow(
      'System Settings URL must be a string'
    );
    expect(() => validateAppleSystemPreferencesURL(undefined)).toThrow(
      'System Settings URL must be a string'
    );
    expect(() => validateAppleSystemPreferencesURL(42)).toThrow(
      'System Settings URL must be a string'
    );
  });

  it('rejects empty string', () => {
    expect(() => validateAppleSystemPreferencesURL('')).toThrow('Unapproved System Settings URL');
  });
});

// ---------------------------------------------------------------------------
// isWhitelistedHost
// ---------------------------------------------------------------------------
describe('isWhitelistedHost', () => {
  describe('current host matching', () => {
    it('returns true when hostname matches currentHost', () => {
      expect(isWhitelistedHost('https://my-intranet.corp.com/page', 'my-intranet.corp.com')).toBe(
        true
      );
    });

    it('returns true when currentHost matches even if not in whitelist', () => {
      expect(isWhitelistedHost('https://custom.example.com/', 'custom.example.com')).toBe(true);
    });
  });

  describe('whitelist entries', () => {
    const whitelistedHosts = [
      'accounts.google.com',
      'accounts.youtube.com',
      'chat.google.com',
      'mail.google.com',
    ];

    it.each(whitelistedHosts)('returns true for whitelisted host: %s', (host) => {
      expect(isWhitelistedHost(`https://${host}/path`, 'other.com')).toBe(true);
    });
  });

  describe('non-whitelisted hosts', () => {
    it('returns false for arbitrary domains', () => {
      expect(isWhitelistedHost('https://evil.com/phish', 'example.com')).toBe(false);
    });

    it('returns false for subdomains of whitelisted hosts', () => {
      expect(isWhitelistedHost('https://sub.chat.google.com', 'other.com')).toBe(false);
    });

    it('returns false for similar-looking domains', () => {
      expect(isWhitelistedHost('https://chat-google.com', 'other.com')).toBe(false);
      expect(isWhitelistedHost('https://google.com.evil.com', 'other.com')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('returns false for invalid URLs', () => {
      expect(isWhitelistedHost('not a url', 'example.com')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isWhitelistedHost('', 'example.com')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles URLs with ports', () => {
      // URL with port — hostname excludes port
      expect(isWhitelistedHost('https://chat.google.com:443/path', 'other.com')).toBe(true);
    });

    it('handles URLs with credentials', () => {
      expect(isWhitelistedHost('https://user:pass@chat.google.com/', 'other.com')).toBe(true);
    });

    it('handles URLs with query strings and fragments', () => {
      expect(
        isWhitelistedHost('https://accounts.google.com/o/oauth2?client_id=123#token', 'other.com')
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// validateDeepLinkURL
// ---------------------------------------------------------------------------
describe('validateDeepLinkURL', () => {
  describe('gogchat:// conversion', () => {
    it('converts gogchat:// to https://chat.google.com/', () => {
      expect(validateDeepLinkURL('gogchat://room/AAAA9BixgjY/EypiKwiqrS0?cls=10')).toBe(
        'https://chat.google.com/room/AAAA9BixgjY/EypiKwiqrS0?cls=10'
      );
    });

    it('converts gogchat://dm/ paths', () => {
      expect(validateDeepLinkURL('gogchat://dm/abc123')).toBe('https://chat.google.com/dm/abc123');
    });

    it('converts gogchat://space/ paths', () => {
      expect(validateDeepLinkURL('gogchat://space/xyz')).toBe('https://chat.google.com/space/xyz');
    });

    it('converts bare gogchat:// to root', () => {
      expect(validateDeepLinkURL('gogchat://')).toBe('https://chat.google.com/');
    });
  });

  describe('direct https URLs', () => {
    it('accepts https://chat.google.com with allowed paths', () => {
      expect(validateDeepLinkURL('https://chat.google.com/room/abc')).toBe(
        'https://chat.google.com/room/abc'
      );
    });

    it('accepts root path on chat.google.com', () => {
      expect(validateDeepLinkURL('https://chat.google.com/')).toBe('https://chat.google.com/');
    });
  });

  describe('credential stripping', () => {
    it('strips username and password', () => {
      const result = validateDeepLinkURL('https://user:pass@chat.google.com/room/abc');
      expect(result).toBe('https://chat.google.com/room/abc');
      expect(result).not.toContain('user');
      expect(result).not.toContain('pass');
    });
  });

  describe('input validation', () => {
    it('rejects non-string input', () => {
      expect(() => validateDeepLinkURL(null)).toThrow('Deep link URL must be a string');
      expect(() => validateDeepLinkURL(undefined)).toThrow('Deep link URL must be a string');
      expect(() => validateDeepLinkURL(123)).toThrow('Deep link URL must be a string');
    });

    it('rejects empty string', () => {
      expect(() => validateDeepLinkURL('')).toThrow('Deep link URL cannot be empty');
    });

    it('rejects whitespace-only string', () => {
      expect(() => validateDeepLinkURL('   ')).toThrow('Deep link URL cannot be empty');
    });

    it('rejects URLs exceeding max length', () => {
      const longUrl = 'gogchat://room/' + 'a'.repeat(2100);
      expect(() => validateDeepLinkURL(longUrl)).toThrow('Deep link URL too long');
    });
  });

  describe('scheme enforcement', () => {
    it('rejects http:// scheme', () => {
      expect(() => validateDeepLinkURL('http://chat.google.com/room/abc')).toThrow(
        'Unsupported deep link scheme'
      );
    });

    it('rejects ftp:// scheme', () => {
      expect(() => validateDeepLinkURL('ftp://chat.google.com/room/abc')).toThrow(
        'Unsupported deep link scheme'
      );
    });

    it('rejects javascript: scheme', () => {
      expect(() => validateDeepLinkURL('javascript:alert(1)')).toThrow(
        'Unsupported deep link scheme'
      );
    });
  });

  describe('host enforcement', () => {
    it('rejects non-chat.google.com hosts', () => {
      expect(() => validateDeepLinkURL('https://evil.com/room/abc')).toThrow(
        'host must be chat.google.com'
      );
    });

    it('rejects subdomains of chat.google.com', () => {
      expect(() => validateDeepLinkURL('https://sub.chat.google.com/room/abc')).toThrow(
        'host must be chat.google.com'
      );
    });
  });

  describe('path enforcement', () => {
    it('rejects disallowed path prefixes', () => {
      expect(() => validateDeepLinkURL('gogchat://admin/settings')).toThrow('path not allowed');
      expect(() => validateDeepLinkURL('gogchat://api/v1/data')).toThrow('path not allowed');
    });

    it('rejects paths that are similar but not exact matches', () => {
      expect(() => validateDeepLinkURL('gogchat://rooms/abc')).toThrow('path not allowed');
    });
  });
});

// ---------------------------------------------------------------------------
// isAuthenticatedChatUrl
// ---------------------------------------------------------------------------
describe('isAuthenticatedChatUrl', () => {
  describe('authenticated URLs — chat.google.com', () => {
    it('returns true for /u/0/', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/0/')).toBe(true);
    });

    it('returns true for /u/1 (no trailing slash)', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/1')).toBe(true);
    });

    it('returns true for /u/0 with deeper path', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/0/room/AAAA9BixgjY')).toBe(true);
    });

    it('returns true for multi-digit account index', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/12/')).toBe(true);
    });
  });

  describe('authenticated URLs — mail.google.com', () => {
    it('returns true for /chat/u/0/', () => {
      expect(isAuthenticatedChatUrl('https://mail.google.com/chat/u/0/')).toBe(true);
    });

    it('returns true for /chat/u/1/r/abc', () => {
      expect(isAuthenticatedChatUrl('https://mail.google.com/chat/u/1/r/abc')).toBe(true);
    });

    it('returns true for /chat/u/0 (no trailing slash)', () => {
      expect(isAuthenticatedChatUrl('https://mail.google.com/chat/u/0')).toBe(true);
    });
  });

  describe('unauthenticated / non-Chat URLs', () => {
    it('returns false for bare chat.google.com (no /u/N)', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/')).toBe(false);
      expect(isAuthenticatedChatUrl('https://chat.google.com')).toBe(false);
    });

    it('returns false for accounts.google.com', () => {
      expect(isAuthenticatedChatUrl('https://accounts.google.com/signin')).toBe(false);
    });

    it('returns false for mail.google.com non-chat path', () => {
      expect(isAuthenticatedChatUrl('https://mail.google.com/mail/u/0/')).toBe(false);
    });

    it('returns false for non-Google domains', () => {
      expect(isAuthenticatedChatUrl('https://evil.com/u/0/')).toBe(false);
    });

    it('returns false for http (non-https) URLs', () => {
      expect(isAuthenticatedChatUrl('http://chat.google.com/u/0/')).toBe(false);
    });
  });

  describe('input validation', () => {
    it('returns false for non-string input', () => {
      expect(isAuthenticatedChatUrl(null)).toBe(false);
      expect(isAuthenticatedChatUrl(undefined)).toBe(false);
      expect(isAuthenticatedChatUrl(42)).toBe(false);
      expect(isAuthenticatedChatUrl({})).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isAuthenticatedChatUrl('')).toBe(false);
    });

    it('returns false for unparseable strings', () => {
      expect(isAuthenticatedChatUrl('not a url')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for /u/ without a digit', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/')).toBe(false);
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/abc')).toBe(false);
    });

    it('handles URLs with query strings', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/0/?authuser=0')).toBe(true);
    });

    it('handles URLs with fragments', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/u/0/#section')).toBe(true);
    });

    it('returns false for chat.google.com with /u/N buried in query', () => {
      expect(isAuthenticatedChatUrl('https://chat.google.com/?redirect=/u/0')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// isGoogleAuthUrl
// ---------------------------------------------------------------------------
describe('isGoogleAuthUrl', () => {
  describe('positive cases', () => {
    it('returns true for signin URL', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com/signin/v2/identifier')).toBe(true);
    });

    it('returns true for OAuth URL', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com/o/oauth2/auth')).toBe(true);
    });

    it('returns true for consent screen', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com/o/oauth2/v2/auth?consent')).toBe(true);
    });

    it('returns true for SAML path', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com/saml/123/acs')).toBe(true);
    });

    it('returns true for bare origin with trailing slash', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com/')).toBe(true);
    });

    it('returns true for bare origin without trailing slash', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com')).toBe(true);
    });

    it('returns true for ServiceLogin path', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com/ServiceLogin')).toBe(true);
    });
  });

  describe('negative cases', () => {
    it('returns false for http (non-https)', () => {
      expect(isGoogleAuthUrl('http://accounts.google.com/signin')).toBe(false);
    });

    it('returns false for subdomain of accounts.google.com', () => {
      expect(isGoogleAuthUrl('https://sub.accounts.google.com/signin')).toBe(false);
    });

    it('returns false for chat.google.com', () => {
      expect(isGoogleAuthUrl('https://chat.google.com/u/0/')).toBe(false);
    });

    it('returns false for mail.google.com', () => {
      expect(isGoogleAuthUrl('https://mail.google.com/chat/u/0/')).toBe(false);
    });

    it('returns false for similar-looking domain', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com.evil.com/signin')).toBe(false);
    });

    it('returns false for accounts-google.com (hyphenated)', () => {
      expect(isGoogleAuthUrl('https://accounts-google.com/signin')).toBe(false);
    });
  });

  describe('input validation', () => {
    it('returns false for non-string input', () => {
      expect(isGoogleAuthUrl(null)).toBe(false);
      expect(isGoogleAuthUrl(undefined)).toBe(false);
      expect(isGoogleAuthUrl(42)).toBe(false);
      expect(isGoogleAuthUrl(true)).toBe(false);
      expect(isGoogleAuthUrl({})).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isGoogleAuthUrl('')).toBe(false);
    });

    it('returns false for unparseable string', () => {
      expect(isGoogleAuthUrl('not a url')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles URLs with query parameters', () => {
      expect(
        isGoogleAuthUrl('https://accounts.google.com/signin?continue=https://chat.google.com')
      ).toBe(true);
    });

    it('handles URLs with fragments', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com/signin#identifier')).toBe(true);
    });

    it('handles URLs with port', () => {
      expect(isGoogleAuthUrl('https://accounts.google.com:443/signin')).toBe(true);
    });
  });
});
