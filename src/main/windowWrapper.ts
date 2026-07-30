import path from 'path';
import { app, BrowserWindow } from 'electron';
import {
  getWindowDefaults,
  attachEventLogging,
  attachHealthMonitoring,
} from './utils/platform/windowUtils.js';
import { getIconCache } from './utils/platform/iconCache.js';
import { installPermissionHandlers } from './utils/security/permissionHandler.js';
import { installHeaderFix } from './utils/security/cspHeaderHandler.js';
import { installBenignWarningFilter } from './utils/ipc/benignLogFilter.js';
import { ensureNotificationPermission } from './utils/security/notificationAccess.js';

installBenignWarningFilter();

/**
 * Parse the account index from a session partition string of the form
 * `persist:account-N`. Returns 0 (default) when the partition is not present
 * or does not match the expected pattern.
 *
 * Used to gate per-window `backgroundThrottling`: account-0 keeps
 * throttling disabled for badge/notification reliability while accounts 1+
 * permit Chromium to throttle background timers.
 */
function parseAccountIndexFromPartition(partition: string): number {
  const match = /^persist:account-(\d+)$/.exec(partition);
  if (match && match[1]) {
    const idx = parseInt(match[1], 10);
    if (!Number.isNaN(idx)) return idx;
  }
  return 0;
}

export default (url: string, partition?: string): BrowserWindow => {
  const webPrefs: Electron.WebPreferences = {
    autoplayPolicy: 'user-gesture-required',
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    disableBlinkFeatures: 'Auxclick',
    // account-0 keeps throttling disabled to preserve badge and
    // notification updates when the window is hidden/blurred. Accounts 1+
    // opt into Chromium background throttling (5–15% renderer CPU savings)
    // and are toggled live via `setBackgroundThrottling` on focus/blur in
    // accountWindowManager.attachActivityListeners.
    backgroundThrottling: partition !== undefined && parseAccountIndexFromPartition(partition) > 0,
    preload: path.join(app.getAppPath(), 'lib/preload/index.js'),
  };
  if (partition !== undefined) {
    webPrefs.partition = partition;
  }
  const window = new BrowserWindow({
    webPreferences: webPrefs,
    icon: getIconCache().getIcon('resources/icons/normal/256.png'),
    show: false,
    paintWhenInitiallyHidden: false, // Defer painting until window.show() to save CPU/GPU
    minHeight: 570,
    minWidth: 480,
    center: true,
    title: 'GogChat',
    backgroundColor: '#E8EAED',
    autoHideMenuBar: getWindowDefaults().hideMenuBar,
  });

  // Chromium-level permission handlers (media TCC + non-media allowlist)
  installPermissionHandlers(window);

  window.once('ready-to-show', () => {
    const defaults = getWindowDefaults();
    if (!defaults.startHidden) {
      window.show();
    }
    window.webContents.session.setSpellCheckerEnabled(!defaults.disableSpellChecker);
    // After the window is ready (and preferably shown): first-run dialog + OS probe.
    // Parent window makes the in-app prompt visible; probe may surface the OS sheet.
    ensureNotificationPermission({ parentWindow: window });
  });

  attachEventLogging(window);
  attachHealthMonitoring(window);

  installHeaderFix(window);
  void window.loadURL(url);
  return window;
};
