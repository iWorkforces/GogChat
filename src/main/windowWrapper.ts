import { BrowserWindow } from 'electron';
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
import { createAccountWebPreferences } from './utils/account/accountWebPreferences.js';

installBenignWarningFilter();

export default (url: string, partition?: string): BrowserWindow => {
  const webPrefs = createAccountWebPreferences(
    partition !== undefined ? { partition } : {}
  );
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
