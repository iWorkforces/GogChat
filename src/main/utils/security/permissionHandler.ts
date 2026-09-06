/**
 * Chromium-level permission request & check handlers for BrowserWindow sessions.
 * Handles media TCC integration (camera/microphone) on macOS and a trusted-origin
 * allowlist for non-media permissions (notifications, mediaKeySystem, geolocation).
 */

import { type BrowserWindow, systemPreferences } from 'electron';
import log from 'electron-log';
import { checkAndRequestMediaAccess, showDeniedPermissionDialog } from './mediaAccess.js';

const ALLOWED_PERMISSIONS = ['notifications', 'mediaKeySystem', 'geolocation'] as const;

const TRUSTED_PERMISSION_ORIGINS = new Set([
  'https://accounts.google.com',
  'https://chat.google.com',
  'https://mail.google.com',
]);

function readDetail(details: unknown, property: string): unknown {
  if (details === null || typeof details !== 'object') {
    return undefined;
  }

  return Reflect.get(details, property);
}

type OriginTrust = 'absent' | 'trusted' | 'denied';

function classifyOrigin(value: unknown): OriginTrust {
  if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
    return 'absent';
  }
  if (typeof value !== 'string') {
    return 'denied';
  }

  return TRUSTED_PERMISSION_ORIGINS.has(new URL(value).origin) ? 'trusted' : 'denied';
}

function readMediaTypes(details: unknown): readonly string[] | null {
  const value = readDetail(details, 'mediaTypes');
  if (!Array.isArray(value)) {
    return null;
  }

  const mediaTypes: string[] = [];
  for (const mediaType of value) {
    if (typeof mediaType !== 'string') {
      return null;
    }
    mediaTypes.push(mediaType);
  }
  return mediaTypes;
}

function createOneShotResponder(callback: (allowed: boolean) => void): (allowed: boolean) => void {
  let settled = false;

  return (allowed) => {
    if (settled) {
      return;
    }
    settled = true;

    try {
      callback(allowed);
    } catch {
      log.warn('[Security] Permission callback failed');
    }
  };
}

/**
 * Trust algorithm (request + check handlers must agree):
 * First present identity must be trusted (do not rescue an untrusted
 * requesting URL/origin via securityOrigin):
 *   1. requestingOriginArg (check-handler string; request-handler usually omits)
 *   2. details.requestingUrl → origin (when non-empty)
 *   3. details.securityOrigin → origin
 * NEVER use details.embeddingOrigin for allow decisions.
 */
function isTrustedPermissionOrigin(requestingOrigin: unknown, details: unknown): boolean {
  const requestingOriginTrust = classifyOrigin(requestingOrigin);
  if (requestingOriginTrust !== 'absent') {
    return requestingOriginTrust === 'trusted';
  }

  const requestingUrlTrust = classifyOrigin(readDetail(details, 'requestingUrl'));
  if (requestingUrlTrust !== 'absent') {
    return requestingUrlTrust === 'trusted';
  }

  return classifyOrigin(readDetail(details, 'securityOrigin')) === 'trusted';
}

/**
 * Install the asynchronous permission request handler on the window's session.
 * For 'media' permission: checks macOS TCC status before granting.
 * For non-media: uses a trusted-origin allowlist.
 */
export function installPermissionRequestHandler(window: BrowserWindow): void {
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const respond = createOneShotResponder(callback);

      void (async () => {
        if (typeof permission !== 'string') {
          log.warn('[Security] Permission denied: malformed permission');
          respond(false);
          return;
        }

        if (!isTrustedPermissionOrigin(undefined, details)) {
          log.warn('[Security] Permission denied for untrusted origin');
          respond(false);
          return;
        }

        if (permission === 'media') {
          const mediaTypes = readMediaTypes(details);

          if (mediaTypes === null || mediaTypes.length === 0) {
            log.warn('[Security] Media permission denied: malformed or empty mediaTypes');
            respond(false);
            return;
          }

          const hasVideo = mediaTypes.includes('video');
          const hasAudio = mediaTypes.includes('audio');
          if (!hasVideo && !hasAudio) {
            log.warn('[Security] Media permission denied: no video/audio media type');
            respond(false);
            return;
          }

          let granted = true;
          if (hasVideo) {
            granted &&= await checkAndRequestMediaAccess('camera');
          }
          if (hasAudio) {
            granted &&= await checkAndRequestMediaAccess('microphone');
          }

          if (!granted) {
            if (hasVideo && systemPreferences.getMediaAccessStatus('camera') === 'denied') {
              void Promise.resolve(showDeniedPermissionDialog(window, 'camera')).catch(() => {
                log.warn('[Security] Camera permission guidance dialog failed');
              });
            }
            if (hasAudio && systemPreferences.getMediaAccessStatus('microphone') === 'denied') {
              void Promise.resolve(showDeniedPermissionDialog(window, 'microphone')).catch(() => {
                log.warn('[Security] Microphone permission guidance dialog failed');
              });
            }
          }

          log.debug(`[Security] Media permission ${granted ? 'granted' : 'denied'}`);
          respond(granted);
          return;
        }

        if (ALLOWED_PERMISSIONS.some((allowedPermission) => allowedPermission === permission)) {
          log.debug('[Security] Permission granted');
          respond(true);
        } else {
          log.warn('[Security] Permission denied');
          respond(false);
        }
      })().catch(() => {
        log.warn('[Security] Permission request failed closed');
        respond(false);
      });
    }
  );
}

/**
 * Install the synchronous permission check handler on the window's session.
 * Returns cached TCC status for media; allowlist check for others.
 */
export function installPermissionCheckHandler(window: BrowserWindow): void {
  window.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      try {
        if (
          typeof permission !== 'string' ||
          !isTrustedPermissionOrigin(requestingOrigin, details)
        ) {
          return false;
        }

        if (permission === 'media') {
          const mediaType = readDetail(details, 'mediaType');
          if (mediaType === 'video') {
            return systemPreferences.getMediaAccessStatus('camera') === 'granted';
          }
          if (mediaType === 'audio') {
            return systemPreferences.getMediaAccessStatus('microphone') === 'granted';
          }
          return false;
        }

        return ALLOWED_PERMISSIONS.some((allowedPermission) => allowedPermission === permission);
      } catch {
        log.warn('[Security] Permission check failed closed');
        return false;
      }
    }
  );
}

/**
 * Install both permission handlers on a BrowserWindow's session.
 */
export function installPermissionHandlers(window: BrowserWindow): void {
  installPermissionRequestHandler(window);
  installPermissionCheckHandler(window);
}
