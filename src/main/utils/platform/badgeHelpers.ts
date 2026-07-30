/**
 * Badge handler helpers — extracted from features/badgeIcon.ts and the former
 * features/badgeHandlers.ts so that badgeIcon does not take a feature→feature
 * import on the trayIcon feature.
 *
 * Owns:
 *   • decideIcon()         — pure favicon URL → IconType resolution
 *   • updateBadgeIcon()    — platform-specific dock badge update (macOS)
 *   • setupBadgeHandlers() — registers the two secure IPC handlers
 *                            (FAVICON_CHANGED + UNREAD_COUNT) with
 *                            rate limiting, deduplication, validation,
 *                            and error handling. Returns cleanup callbacks.
 */

import { app } from 'electron';
import type { BrowserWindow, Tray } from 'electron';
import log from 'electron-log';
import {
  FAVICON_PATTERNS,
  ICON_TYPES,
  IPC_CHANNELS,
  RATE_LIMITS,
} from '../../../shared/constants.js';
import type { IconType } from '../../../shared/types/domain.js';
import { registerFastHandler } from '../ipc/ipcFastPath.js';

import { validateFaviconURL } from '../../../shared/urlValidators.js';
import { validateUnreadCount } from '../../../shared/dataValidators.js';
import { configGet } from '../../config.js';
import { getIconCache } from './iconCache.js';
import { platform } from './platformDetection.js';
import { setTrayUnread } from './trayIconState.js';
import { assertNever } from '../../../shared/typeUtils.js';
import {
  UNREAD_DELTA_NOTIFICATION_TAG,
  buildUnreadDeltaNotificationBody,
  shouldShowUnreadDeltaNotification,
  showNativeNotification,
  wasBridgeNotificationRecentlyShown,
} from './nativeNotification.js';
import { resolveNotificationFocusWindow } from './notificationFocus.js';
import { ensureNotificationPermission } from '../security/notificationAccess.js';

/**
 * Decide app icon based on favicon URL.
 */
export const decideIcon = (href: string): IconType => {
  let type: IconType;

  if (FAVICON_PATTERNS.NORMAL.test(href)) {
    type = ICON_TYPES.NORMAL;
  } else if (FAVICON_PATTERNS.BADGE.test(href)) {
    type = ICON_TYPES.BADGE;
  } else {
    type = ICON_TYPES.OFFLINE;
  }

  switch (type) {
    case ICON_TYPES.OFFLINE:
    case ICON_TYPES.NORMAL:
    case ICON_TYPES.BADGE:
      return type;
    default:
      return assertNever(type);
  }
};

/**
 * Update badge icon for platforms with a supported app badge surface.
 */
export const updateBadgeIcon = (_window: BrowserWindow, count: number): void => {
  if (!platform.config.supportsDockBadge) return;

  app.setBadgeCount(count);
  log.debug(`[BadgeIcon] App badge updated: ${count}`);
};

export interface BadgeHandlerCleanups {
  faviconCleanup: () => void;
  unreadCleanup: () => void;
}

/**
 * Register the FAVICON_CHANGED + UNREAD_COUNT IPC handlers.
 * Returns cleanup callbacks for each.
 */
export function setupBadgeHandlers(window: BrowserWindow, trayIcon: Tray): BadgeHandlerCleanups {
  // Track current tray icon type to avoid redundant updates
  let currentTrayIconType: IconType = ICON_TYPES.OFFLINE;

  // ⚡ FAST PATH: sync ipcMain.on handler (no Promise allocation per call).
  // Inline last-value short-circuit replaces payload-aware dedup since rapid
  // identical favicon URLs (e.g., during page load) should collapse to one update.
  let lastFaviconHref: string | undefined;
  const faviconCleanup = registerFastHandler<string>({
    channel: IPC_CHANNELS.FAVICON_CHANGED,
    rateLimit: RATE_LIMITS.IPC_FAVICON,
    validator: validateFaviconURL,
    handler: (validatedHref, _event) => {
      if (validatedHref === lastFaviconHref) return;
      lastFaviconHref = validatedHref;

      // Determine icon type
      const type = decideIcon(validatedHref);

      if (platform.config.useTemplateTrayIcon) {
        setTrayUnread(type === ICON_TYPES.BADGE);
      } else {
        if (type !== currentTrayIconType) {
          currentTrayIconType = type;
          const icon = getIconCache().getIcon(`resources/icons/${type}/16.png`);
          trayIcon.setImage(icon);
          log.debug(`[BadgeIcon] Tray icon updated to type: ${type}`);
        } else {
          log.debug(`[BadgeIcon] Tray icon type unchanged (${type}), skipping update`);
        }
      }
    },
  });

  // ⚡ FAST PATH: sync ipcMain.on handler (no Promise allocation per call).
  // Inline last-value short-circuit replaces payload-aware dedup since rapid
  // identical unread-count updates (e.g., burst of incoming messages) collapse to one.
  let lastUnreadCount: number | undefined;
  const unreadCleanup = registerFastHandler<number>({
    channel: IPC_CHANNELS.UNREAD_COUNT,
    rateLimit: RATE_LIMITS.IPC_UNREAD_COUNT,
    validator: validateUnreadCount,
    handler: (validatedCount, event) => {
      if (validatedCount === lastUnreadCount) return;

      const previousCount = lastUnreadCount;
      lastUnreadCount = validatedCount;

      // Update badge icon (platform-specific)
      updateBadgeIcon(window, validatedCount);

      // Update tray icon to reflect unread state
      setTrayUnread(validatedCount > 0);

      log.debug(`[BadgeIcon] Unread count updated: ${validatedCount}`);

      // Optional Phase 2 fallback: generic OS banner when unread increases while unfocused.
      // Default off via app.unreadDeltaNotifications. Shared tag replaces rapid stacks.
      // Suppressed shortly after a Chat bridge notification to avoid double banners.
      try {
        const focusWindow = resolveNotificationFocusWindow(event, window);
        const focused =
          !focusWindow.isDestroyed() && focusWindow.isFocused() === true;
        if (
          shouldShowUnreadDeltaNotification({
            enabled: configGet('app.unreadDeltaNotifications') === true,
            previousCount,
            nextCount: validatedCount,
            isWindowFocused: focused,
            bridgeCooldownActive: wasBridgeNotificationRecentlyShown(),
          })
        ) {
          ensureNotificationPermission();
          showNativeNotification(
            {
              title: 'GogChat',
              body: buildUnreadDeltaNotificationBody(validatedCount),
              tag: UNREAD_DELTA_NOTIFICATION_TAG,
            },
            {
              focusWindow,
              ipcEvent: event,
              source: 'unread-delta',
            }
          );
        }
      } catch (error: unknown) {
        log.error('[BadgeIcon] Unread-delta notification failed:', error);
      }
    },
  });

  return { faviconCleanup, unreadCleanup };
}
