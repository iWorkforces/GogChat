import type { BrowserWindow } from 'electron';
import { Notification, app } from 'electron';
import fs from 'fs';
import path from 'path';
import log from 'electron-log';
import { IPC_CHANNELS, TIMING } from '../../shared/constants.js';
import { defineIPC } from '../utils/ipc/defineIPC.js';
import { getIconCache } from '../utils/platform/iconCache.js';

let checkIfOnlineCleanup: (() => void) | null = null;

/**
 * Check internet connectivity using native fetch
 * Uses Google's generate_204 endpoint which is designed for connectivity checks
 */
const checkIfOnline = async (
  timeout: number = TIMING.CONNECTIVITY_CHECK_FAST
): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-cache',
    });
    return response.ok;
  } catch (error: unknown) {
    log.debug(
      '[Connectivity] Offline or fetch failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Show offline notification to user
 */
const showOfflineNotification = (window: BrowserWindow) => {
  const notification = new Notification({
    title: 'GogChat',
    body: `You are offline.\nCheck your internet connection.`,
    silent: true,
    timeoutType: 'default',
    icon: getIconCache().getIcon('resources/icons/normal/256.png'),
  });

  notification.on('click', () => {
    window.show();
    notification.close();
  });

  notification.show();
};

/**
 * Check for internet connectivity and load offline page if disconnected
 */
const checkForInternet = async (window: BrowserWindow) => {
  try {
    const canChat = await checkIfOnline();

    if (!canChat) {
      log.debug('[Connectivity] Initial connectivity probe failed; confirming offline state...');

      const confirmedOffline = !(await checkIfOnline(TIMING.CONNECTIVITY_CHECK));
      if (!confirmedOffline) {
        log.info(
          '[Connectivity] Connectivity restored on confirmation probe; staying on current page'
        );
        return;
      }

      const offlinePagePath = path.join(app.getAppPath(), 'lib/offline/index.html');
      if (!fs.existsSync(offlinePagePath)) {
        log.error(
          `[Connectivity] Offline page missing at ${offlinePagePath} - staying on current page`
        );
        showOfflineNotification(window);
        return;
      }

      await window.loadURL(`file://${offlinePagePath}`);
      showOfflineNotification(window);
      log.warn('[Connectivity] Loaded offline page - no internet connection');
    }
  } catch (error: unknown) {
    log.error('[Connectivity] Failed to check internet:', error);
  }
};

/**
 * Setup IPC handlers for connectivity checks
 */
export default (_window: BrowserWindow) => {
  // Add rate limiting to prevent connectivity check spam
  checkIfOnlineCleanup = defineIPC({
    kind: 'on',
    channel: IPC_CHANNELS.CHECK_IF_ONLINE,
    validator: () => undefined,
    rateLimit: 1,
    description: 'Connectivity check',
    handler: (_data, event) => {
      if (!('reply' in event)) {
        return;
      }

      // Handle async operation without making handler async
      void (async () => {
        try {
          log.debug('[Connectivity] Checking online status...');
          const online = await checkIfOnline(TIMING.CONNECTIVITY_CHECK);

          // Reply with online status
          event.reply(IPC_CHANNELS.ONLINE_STATUS, online);

          log.debug(`[Connectivity] Online status: ${online}`);
        } catch (error: unknown) {
          log.error('[Connectivity] Failed to handle checkIfOnline:', error);
          // Reply with false on error
          event.reply(IPC_CHANNELS.ONLINE_STATUS, false);
        }
      })();
    },
  });
};

/**
 * Cleanup function for connectivity handler
 */
export function cleanupConnectivityHandler(): void {
  try {
    log.debug('[Connectivity] Cleaning up connectivity handler');
    if (checkIfOnlineCleanup) {
      checkIfOnlineCleanup();
      checkIfOnlineCleanup = null;
    }
    log.info('[Connectivity] Connectivity handler cleaned up');
  } catch (error: unknown) {
    log.error('[Connectivity] Failed to cleanup connectivity handler:', error);
  }
}

export { checkForInternet };
