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
 *
 * Unread counts are tracked per account (from IPC sender). Dock badge is the
 * sum across accounts, capped at BADGE.DISPLAY_MAX (99).
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
import type { AccountIndex } from '../../../shared/types/branded.js';
import { registerFastHandler } from '../ipc/ipcFastPath.js';

import { validateFaviconURL } from '../../../shared/urlValidators.js';
import { validateUnreadCount } from '../../../shared/dataValidators.js';
import { configGet } from '../../config.js';
import { getIconCache } from './iconCache.js';
import { platform } from './platformDetection.js';
import { setTrayUnread } from './trayIconState.js';
import { assertNever } from '../../../shared/typeUtils.js';
import {
  UNREAD_DELTA_TAG_BASE,
  resolveAccountIndexFromIpcEvent,
} from './accountNotificationIdentity.js';
import {
  buildAccountAwareNotificationPayload,
  buildUnreadDeltaNotificationBody,
  clampBadgeDisplayCount,
  shouldShowUnreadDeltaNotification,
  showNativeNotification,
  wasBridgeNotificationRecentlyShown,
} from './nativeNotification.js';
import { resolveNotificationFocusWindow } from './notificationFocus.js';
import { getAccountWindowManager } from '../account/accountWindowManager.js';
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
 * Sum of per-account unread counts for dock badge display (capped at 99).
 */
export function sumAccountUnreadCounts(counts: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const n of counts.values()) {
    total += n;
  }
  return clampBadgeDisplayCount(total);
}

/**
 * Update badge icon for platforms with a supported app badge surface.
 * Count is clamped to BADGE.DISPLAY_MAX (99).
 */
export const updateBadgeIcon = (_window: BrowserWindow, count: number): void => {
  if (!platform.config.supportsDockBadge) return;

  const display = clampBadgeDisplayCount(count);
  app.setBadgeCount(display);
  log.debug(`[BadgeIcon] App badge updated: ${display} (raw=${count})`);
};

export interface BadgeHandlerCleanups {
  faviconCleanup: () => void;
  unreadCleanup: () => void;
}

function accountUnreadKey(accountIndex: AccountIndex | null): string {
  return accountIndex === null ? 'unknown' : String(accountIndex);
}

/**
 * Register the FAVICON_CHANGED + UNREAD_COUNT IPC handlers.
 * Returns cleanup callbacks for each.
 */
export function setupBadgeHandlers(window: BrowserWindow, trayIcon: Tray): BadgeHandlerCleanups {
  // Track current tray icon type to avoid redundant updates
  let currentTrayIconType: IconType = ICON_TYPES.OFFLINE;

  // ⚡ FAST PATH: sync ipcMain.on handler (no Promise allocation per call).
  let lastFaviconHref: string | undefined;
  const faviconCleanup = registerFastHandler<string>({
    channel: IPC_CHANNELS.FAVICON_CHANGED,
    rateLimit: RATE_LIMITS.IPC_FAVICON,
    validator: validateFaviconURL,
    handler: (validatedHref, _event) => {
      if (validatedHref === lastFaviconHref) return;
      lastFaviconHref = validatedHref;

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

  // Per-account last unread counts (key = account index string or "unknown")
  const lastUnreadByAccount = new Map<string, number>();

  const unreadCleanup = registerFastHandler<number>({
    channel: IPC_CHANNELS.UNREAD_COUNT,
    rateLimit: RATE_LIMITS.IPC_UNREAD_COUNT,
    validator: validateUnreadCount,
    handler: (validatedCount, event) => {
      const accountIndex = resolveAccountIndexFromIpcEvent(event);
      const key = accountUnreadKey(accountIndex);
      const previousCount = lastUnreadByAccount.get(key);

      if (previousCount === validatedCount) {
        return;
      }
      lastUnreadByAccount.set(key, validatedCount);

      const totalRaw = [...lastUnreadByAccount.values()].reduce((a, b) => a + b, 0);
      const totalDisplay = clampBadgeDisplayCount(totalRaw);

      updateBadgeIcon(window, totalRaw);
      setTrayUnread(totalRaw > 0);

      log.debug(
        `[BadgeIcon] Unread account=${key} count=${validatedCount} total=${totalRaw} display=${totalDisplay}`
      );

      try {
        const focusWindow = resolveNotificationFocusWindow(event, window);
        // Suppress unread-delta only when *this account* is the focused UI:
        // host/window focused AND isAccountVisible (WCV hidden-live may still
        // have a focused host while another account is frontmost).
        let accountUiFocused = false;
        try {
          if (accountIndex !== null) {
            const manager = getAccountWindowManager();
            accountUiFocused =
              !focusWindow.isDestroyed() &&
              focusWindow.isFocused() === true &&
              manager.isAccountVisible(accountIndex) === true;
          } else {
            accountUiFocused = !focusWindow.isDestroyed() && focusWindow.isFocused() === true;
          }
        } catch {
          accountUiFocused = !focusWindow.isDestroyed() && focusWindow.isFocused() === true;
        }
        if (
          shouldShowUnreadDeltaNotification({
            enabled: configGet('app.unreadDeltaNotifications') === true,
            previousCount,
            nextCount: validatedCount,
            isWindowFocused: accountUiFocused,
            bridgeCooldownActive: wasBridgeNotificationRecentlyShown(accountIndex),
          })
        ) {
          ensureNotificationPermission();
          const payload = buildAccountAwareNotificationPayload({
            title: 'GogChat',
            body: buildUnreadDeltaNotificationBody(validatedCount),
            chatTag: UNREAD_DELTA_TAG_BASE,
            accountIndex,
          });
          showNativeNotification(payload, {
            focusWindow,
            ipcEvent: event,
            source: 'unread-delta',
            accountIndex,
          });
        }
      } catch (error: unknown) {
        log.error('[BadgeIcon] Unread-delta notification failed:', error);
      }
    },
  });

  return { faviconCleanup, unreadCleanup };
}
