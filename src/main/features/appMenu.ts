import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { Menu, app, clipboard } from 'electron';
import store, { configGet } from '../config.js';
import environment from '../../environment.js';
import { IPC_CHANNELS } from '../../shared/constants.js';
import { asAccountIndex } from '../../shared/types/branded.js';
import { getMenuAction } from './menuActionRegistry.js';
import { buildHelpSubMenu, relaunchApp } from '../utils/platform/helpMenuBuilder.js';
import { supports } from '../utils/platform/platformDetection.js';
import { showNotificationSettingsDialog } from '../utils/security/notificationAccess.js';
import { promptAccountLabel } from '../utils/platform/accountLabelDialog.js';
import {
  clearStoredAccountLabels,
  getAllStoredAccountLabels,
  getStoredAccountLabel,
  setStoredAccountLabel,
} from '../utils/platform/accountLabelStore.js';
import { getAccountWindowManager } from '../utils/account/accountWindowManager.js';
import { formatAccountNotificationLabel } from '../utils/platform/accountNotificationIdentity.js';

function buildAccountLabelsSubmenu(parentWindow: BrowserWindow): MenuItemConstructorOptions {
  let accountCount = 0;
  try {
    accountCount = getAccountWindowManager().getAccountCount();
  } catch {
    // Manager may be unavailable during early menu build in tests.
  }
  const stored = getAllStoredAccountLabels();
  const maxFromLabels = Object.keys(stored)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .reduce((max, n) => Math.max(max, n), -1);
  const slotCount = Math.max(accountCount, maxFromLabels + 1, 0);

  const items: MenuItemConstructorOptions[] = [];
  if (slotCount === 0) {
    items.push({
      label: 'No accounts yet',
      enabled: false,
    });
  } else {
    for (let i = 0; i < slotCount; i++) {
      const index = asAccountIndex(i);
      const display = formatAccountNotificationLabel(index);
      const isCustom = getStoredAccountLabel(index) !== undefined;
      items.push({
        label: isCustom ? `Account ${i + 1}: ${display}…` : `Account ${i + 1}…`,
        click: () => {
          void (async () => {
            const current = getStoredAccountLabel(index) ?? '';
            const result = await promptAccountLabel(parentWindow, i, current);
            if (result === null) {
              return;
            }
            setStoredAccountLabel(index, result);
            // Rebuild menu so labels refresh
            const rebuild = (await import('./appMenu.js')).default;
            rebuild(parentWindow);
          })();
        },
      });
    }
  }

  items.push({ type: 'separator' });
  items.push({
    label: 'Clear All Labels',
    enabled: Object.keys(stored).length > 0,
    click: () => {
      clearStoredAccountLabels();
      void import('./appMenu.js').then((mod) => {
        mod.default(parentWindow);
      });
    },
  });

  return {
    label: 'Account Labels',
    submenu: items,
  };
}

export default (window: BrowserWindow) => {
  const autoLaunchSupported = supports.autoLaunch();
  const menuItems = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Close To Tray',
          accelerator: 'CommandOrControl+W',
          click: () => {
            window.hide();
          },
        },
        {
          label: 'Relaunch',
          click: relaunchApp,
        },
        {
          role: 'minimize',
        },
        {
          label: 'Sign Out',
          click: () => {
            void window.loadURL(environment.logoutUrl);
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Quit',
          accelerator: 'CommandOrControl+Q',
          click: () => {
            app.exit();
          },
        },
      ],
    },
    {
      role: 'editMenu',
    },
    {
      label: 'View',
      submenu: [
        {
          role: 'reload',
        },
        {
          role: 'forceReload',
        },
        {
          label: 'Search',
          accelerator: 'CommandOrControl+F',
          click: () => {
            window.webContents.send(IPC_CHANNELS.SEARCH_SHORTCUT);
          },
        },
        {
          label: 'Copy Current URL',
          click: () => {
            clipboard.writeText(window.webContents.getURL());
          },
        },
        {
          role: 'toggleDevTools',
          visible: environment.isDev,
        },
        {
          type: 'separator',
        },
        {
          role: 'togglefullscreen',
        },
        {
          role: 'resetZoom',
        },
        {
          role: 'zoomIn',
        },
        {
          role: 'zoomOut',
        },
      ],
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => {
            window.webContents.goBack();
          },
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            window.webContents.goForward();
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Navigate to Home',
          accelerator: 'Alt+Home',
          click: () => {
            void window.loadURL(environment.appUrl);
          },
        },
      ],
    },
    {
      label: 'Preferences',
      submenu: [
        {
          label: 'Auto check for Updates',
          type: 'checkbox',
          enabled: true,
          checked: configGet('app.autoCheckForUpdates') ?? false,
          click: (menuItem: Electron.MenuItem) => {
            store.set('app.autoCheckForUpdates', menuItem.checked);
          },
        },
        {
          label: 'Auto Launch at Login',
          type: 'checkbox',
          enabled: autoLaunchSupported,
          checked: autoLaunchSupported && (configGet('app.autoLaunchAtLogin') ?? false),
          click: (menuItem: Electron.MenuItem) => {
            void (async () => {
              if (!autoLaunchSupported) return;
              const autoLaunchAction = getMenuAction('autoLaunch');
              if (!autoLaunchAction) return;
              const instance = autoLaunchAction.handler();
              if (menuItem.checked) {
                await instance.enable();
              } else {
                await instance.disable();
              }

              store.set('app.autoLaunchAtLogin', menuItem.checked);
            })();
          },
        },
        {
          label: 'Start Hidden',
          type: 'checkbox',
          checked: configGet('app.startHidden') ?? false,
          click: (menuItem: Electron.MenuItem) => {
            store.set('app.startHidden', menuItem.checked);
          },
        },
        {
          label: 'Hide Menu Bar',
          type: 'checkbox',
          enabled: process.platform !== 'darwin',
          checked: configGet('app.hideMenuBar') ?? false,
          click: (menuItem: Electron.MenuItem) => {
            window.setMenuBarVisibility(!menuItem.checked);
            window.setAutoHideMenuBar(menuItem.checked);
            store.set('app.hideMenuBar', menuItem.checked);
          },
        },
        {
          label: 'Disable Spell Checker',
          type: 'checkbox',
          checked: configGet('app.disableSpellChecker') ?? false,
          click: (menuItem: Electron.MenuItem) => {
            window.webContents.session.setSpellCheckerEnabled(!menuItem.checked);
            store.set('app.disableSpellChecker', menuItem.checked);
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Notify on Unread Badge Increase',
          type: 'checkbox',
          checked: configGet('app.unreadDeltaNotifications') ?? false,
          click: (menuItem: Electron.MenuItem) => {
            store.set('app.unreadDeltaNotifications', menuItem.checked);
          },
        },
        buildAccountLabelsSubmenu(window),
        {
          label: 'Notification Settings…',
          click: () => {
            void showNotificationSettingsDialog(window);
          },
        },
      ],
    },
    buildHelpSubMenu(window),
  ]);

  Menu.setApplicationMenu(menuItems);
};
