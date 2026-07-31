/**
 * URL validation utilities for IPC messages and navigation
 * These validators prevent injection attacks and ensure URL safety
 */

import { WHITELISTED_HOSTS, DEEP_LINK } from './constants.js';
import { asType } from './typeUtils.js';
import type { ValidatedURL } from './types/branded.js';
import { asValidatedURL } from './types/branded.js';

/**
 * Safely parse a URL string into a URL object.
 * Returns null on invalid input instead of throwing.
 */
function tryParseURL(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

// Authenticated Chat path patterns. Hoisted to module scope so the regex
// literals are compiled once instead of on every navigation check.
const AUTH_PATH_RE = /^\/u\/\d+(\/|$)/;
const MAIL_CHAT_PATH_RE = /^\/chat\/u\/\d+(\/|$)/;

/**
 * Validates and sanitizes favicon URL
 * @param href - Favicon URL from renderer
 * @returns Sanitized URL string
 * @throws Error if URL is invalid
 */
export function validateFaviconURL(href: unknown): string {
  // Type check
  if (typeof href !== 'string') {
    throw new Error('Favicon URL must be a string');
  }

  // Length check (prevent DoS)
  if (href.length > 2048) {
    throw new Error('Favicon URL too long');
  }

  // Empty check
  if (href.trim().length === 0) {
    throw new Error('Favicon URL cannot be empty');
  }

  // Parse URL once
  let url: URL;
  try {
    url = new URL(href);
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw new Error('Invalid favicon URL format', { cause: error });
    }
    throw error;
  }

  // Protocol check
  if (!['http:', 'https:', 'data:'].includes(url.protocol)) {
    throw new Error('Favicon URL must use http, https, or data protocol');
  }

  return href;
}

const GOOGLE_STATIC_ICON_HOSTS = new Set([
  'www.gstatic.com',
  'ssl.gstatic.com',
  'fonts.gstatic.com',
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
]);

/**
 * Notification icons: only data:image/* or known Google static hosts (P19).
 * Falls back to rejecting arbitrary remote URLs used for tracking/CDN load.
 */
export function validateNotificationIconURL(href: unknown): string {
  const validated = validateFaviconURL(href);
  const url = new URL(validated);
  if (url.protocol === 'data:') {
    if (!url.pathname.startsWith('image/')) {
      throw new Error('Notification icon data URL must be image/*');
    }
    return validated;
  }
  if (url.protocol === 'https:' && GOOGLE_STATIC_ICON_HOSTS.has(url.hostname)) {
    return validated;
  }
  throw new Error('Notification icon must be data:image/* or a Google static HTTPS host');
}

/**
 * Validates and sanitizes external URLs before opening
 * @param url - URL to be opened externally
 * @returns Sanitized URL string
 * @throws Error if URL is unsafe
 */
export function validateExternalURL(url: unknown): ValidatedURL {
  // Type check
  if (typeof url !== 'string') {
    throw new Error('URL must be a string');
  }

  // Length check
  if (url.length > 2048) {
    throw new Error('URL too long');
  }

  // Parse URL once
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Protocol whitelist - only http/https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsafe protocol: ${parsed.protocol}`);
  }

  // Remove credentials to prevent leakage
  parsed.username = '';
  parsed.password = '';

  // Check for dangerous patterns
  const dangerous = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];

  const urlLower = url.toLowerCase();
  for (const pattern of dangerous) {
    if (urlLower.includes(pattern)) {
      throw new Error(`URL contains dangerous pattern: ${pattern}`);
    }
  }

  return asValidatedURL(parsed.toString());
}

export function validateAppleSystemPreferencesURL(url: unknown): ValidatedURL {
  if (typeof url !== 'string') {
    throw new Error('System Settings URL must be a string');
  }

  const allowed = new Set([
    'x-apple.systempreferences:com.apple.preference.security?Privacy',
    'x-apple.systempreferences:com.apple.preference.security',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    // Notifications pane (Ventura+ and legacy System Preferences)
    'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
    'x-apple.systempreferences:com.apple.preference.notifications',
  ]);

  if (!allowed.has(url)) {
    throw new Error('Unapproved System Settings URL');
  }

  return asValidatedURL(url);
}

/**
 * Internal: check if a parsed URL's hostname matches the current host or whitelist.
 */
function isWhitelistedHostInternal(parsed: URL, currentHost: string): boolean {
  const hostname = parsed.hostname;

  // Check if it's the same as current host
  if (hostname === currentHost) {
    return true;
  }

  // Check against whitelist
  return asType<readonly string[]>(WHITELISTED_HOSTS).includes(hostname);
}

/**
 * Validates if a URL belongs to a whitelisted host
 * @param url - URL to check
 * @param currentHost - Current window host for comparison
 * @returns true if URL is whitelisted
 */
export function isWhitelistedHost(url: string, currentHost: string): boolean {
  const parsed = tryParseURL(url);
  if (parsed === null) {
    return false;
  }
  return isWhitelistedHostInternal(parsed, currentHost);
}

/**
 * Validates and converts a deep link URL to a safe GogChat HTTPS URL.
 *
 * Accepts:
 * - gogchat://room/AAAA9BixgjY/EypiKwiqrS0?cls=10
 * - https://chat.google.com/room/AAAA9BixgjY/EypiKwiqrS0?cls=10
 *
 * @param url - Raw URL from protocol handler or command line
 * @returns Sanitized https://chat.google.com/... URL
 * @throws Error if URL is invalid, not a recognized scheme, or targets a non-allowed host
 */
export function validateDeepLinkURL(url: unknown): ValidatedURL {
  // Type check
  if (typeof url !== 'string') {
    throw new Error('Deep link URL must be a string');
  }

  // Length check
  if (url.length > DEEP_LINK.MAX_URL_LENGTH) {
    throw new Error('Deep link URL too long');
  }

  // Empty check
  if (url.trim().length === 0) {
    throw new Error('Deep link URL cannot be empty');
  }

  let httpsUrl: string;

  // Convert gogchat:// to https://chat.google.com/
  if (url.startsWith(DEEP_LINK.PREFIX)) {
    const pathAndQuery = url.slice(DEEP_LINK.PREFIX.length);
    httpsUrl = `${DEEP_LINK.TARGET_ORIGIN}/${pathAndQuery}`;
  } else if (url.startsWith('https://')) {
    httpsUrl = url;
  } else {
    throw new Error(`Unsupported deep link scheme: ${url.split(':')[0] ?? 'unknown'}`);
  }

  // Parse and validate once
  let parsed: URL;
  try {
    parsed = new URL(httpsUrl);
  } catch {
    throw new Error('Invalid deep link URL format');
  }

  // Protocol must be https
  if (parsed.protocol !== 'https:') {
    throw new Error(`Deep link must use HTTPS, got: ${parsed.protocol}`);
  }

  // Host must be chat.google.com
  if (parsed.hostname !== DEEP_LINK.TARGET_HOST) {
    throw new Error(`Deep link host must be ${DEEP_LINK.TARGET_HOST}, got: ${parsed.hostname}`);
  }

  // Strip credentials
  parsed.username = '';
  parsed.password = '';

  // Validate path has an allowed prefix (or is root)
  const pathLower = parsed.pathname.toLowerCase();
  const hasAllowedPath =
    pathLower === '/' ||
    DEEP_LINK.ALLOWED_PATH_PREFIXES.some((prefix) => pathLower.startsWith(prefix));

  if (!hasAllowedPath) {
    throw new Error(`Deep link path not allowed: ${parsed.pathname}`);
  }

  return asValidatedURL(parsed.toString());
}

/**
 * Internal: check if an already-parsed URL represents an authenticated Chat session.
 */
function isAuthenticatedChatUrlInternal(parsed: URL): boolean {
  // Must be HTTPS
  if (parsed.protocol !== 'https:') {
    return false;
  }

  const { hostname, pathname } = parsed;

  // Accepted host + path combinations:
  //   chat.google.com  — path starts with /u/<digits>
  //   mail.google.com  — path starts with /chat/u/<digits>
  if (hostname === 'chat.google.com') {
    return AUTH_PATH_RE.test(pathname);
  }

  if (hostname === 'mail.google.com') {
    return MAIL_CHAT_PATH_RE.test(pathname);
  }

  return false;
}

/**
 * Detects whether a URL represents an authenticated Google Chat session.
 *
 * Returns true only when the URL contains an account-index path segment (`/u/N`)
 * on either `chat.google.com` or `mail.google.com` (the latter hosting Chat at
 * `/chat`).  Bare landing pages, `accounts.google.com` login URLs, non-Chat paths,
 * and anything that cannot be parsed as a valid URL all return false.
 *
 * @param url - URL to inspect (string or unknown; non-strings return false)
 * @returns true if the URL looks like an authenticated Chat session
 *
 * @example
 * isAuthenticatedChatUrl('https://chat.google.com/u/0/')          // true
 * isAuthenticatedChatUrl('https://mail.google.com/chat/u/1/r/abc') // true
 * isAuthenticatedChatUrl('https://chat.google.com/')               // false (no /u/N)
 * isAuthenticatedChatUrl('https://accounts.google.com/signin')     // false (login page)
 */
export function isAuthenticatedChatUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false;
  }

  const parsed = tryParseURL(url);
  if (parsed === null) {
    return false;
  }

  return isAuthenticatedChatUrlInternal(parsed);
}

/**
 * Internal: check if an already-parsed URL is a Google Accounts auth page.
 */
function isGoogleAuthUrlInternal(parsed: URL): boolean {
  // Must be HTTPS
  if (parsed.protocol !== 'https:') {
    return false;
  }

  // Exact hostname — subdomains are not accepted
  return parsed.hostname === 'accounts.google.com';
}

/**
 * Detects whether a URL is a Google Accounts authentication page.
 *
 * Returns true only when the URL is HTTPS on `accounts.google.com` (exact
 * hostname — subdomains are rejected).  Any path is accepted, including
 * the bare origin.  Non-strings and unparseable values all return false.
 *
 * Use this to detect when a window is mid-auth-flow so navigation is not
 * interrupted.
 *
 * @param url - URL to inspect (string or unknown; non-strings return false)
 * @returns true if the URL is on accounts.google.com over HTTPS
 *
 * @example
 * isGoogleAuthUrl('https://accounts.google.com/signin/v2/identifier') // true
 * isGoogleAuthUrl('https://accounts.google.com/o/oauth2/auth')        // true
 * isGoogleAuthUrl('https://accounts.google.com/')                     // true
 * isGoogleAuthUrl('https://accounts.google.com')                      // true
 * isGoogleAuthUrl('http://accounts.google.com/signin')                // false (not HTTPS)
 * isGoogleAuthUrl('https://sub.accounts.google.com/signin')           // false (subdomain)
 * isGoogleAuthUrl('https://chat.google.com/u/0/')                     // false (wrong host)
 */
export function isGoogleAuthUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false;
  }

  const parsed = tryParseURL(url);
  if (parsed === null) {
    return false;
  }

  return isGoogleAuthUrlInternal(parsed);
}
