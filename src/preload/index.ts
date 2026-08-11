/**
 * Preload script entry point
 * With contextIsolation enabled, this script creates a secure bridge between
 * main and renderer processes using Electron's contextBridge API
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants.js';
import { validateUnreadCount, validatePasskeyFailureData } from '../shared/dataValidators.js';
import { validateFaviconURL } from '../shared/urlValidators.js';
import type { GogChatBridgeAPI } from '../shared/types/bridge.js';
import { installDisableWebAuthn } from './disableWebAuthn.js';
import { installFaviconChanged } from './faviconChanged.js';
import { installOffline } from './offline.js';
import { installPasskeyMonitor } from './passkeyMonitor.js';
import { installSearchShortcut } from './searchShortcut.js';
import { installUnreadCount } from './unreadCount.js';
import { installNotificationBridge } from './notificationBridge.js';

/**
 * Expose secure API to renderer process via window.gogchat
 * This API is the ONLY way renderer can communicate with main process
 */
const api: GogChatBridgeAPI = {
  // Send messages to main process (with validation)
  sendUnreadCount: (count: number) => {
    try {
      const validated = validateUnreadCount(count);
      ipcRenderer.send(IPC_CHANNELS.UNREAD_COUNT, validated);
    } catch (error: unknown) {
      console.error('[GogChat API] Invalid unread count:', error);
    }
  },

  sendFaviconChanged: (href: string) => {
    try {
      const validated = validateFaviconURL(href);
      ipcRenderer.send(IPC_CHANNELS.FAVICON_CHANGED, validated);
    } catch (error: unknown) {
      console.error('[GogChat API] Invalid favicon URL:', error);
    }
  },

  sendNotificationClicked: () => {
    ipcRenderer.send(IPC_CHANNELS.NOTIFICATION_CLICKED);
  },

  checkIfOnline: () => {
    ipcRenderer.send(IPC_CHANNELS.CHECK_IF_ONLINE);
  },

  reportPasskeyFailure: (errorType: string) => {
    try {
      const validated = validatePasskeyFailureData(errorType);
      ipcRenderer.send(IPC_CHANNELS.PASSKEY_AUTH_FAILED, validated);
    } catch (error: unknown) {
      console.error('[GogChat API] Invalid passkey failure data:', error);
    }
  },

  // Receive messages from main process (returns unsubscribe function)
  onSearchShortcut: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.SEARCH_SHORTCUT, listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_SHORTCUT, listener);
    };
  },

  onOnlineStatus: (callback: (online: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, online: boolean) => callback(online);
    ipcRenderer.on(IPC_CHANNELS.ONLINE_STATUS, listener);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.ONLINE_STATUS, listener);
    };
  },
};

installDisableWebAuthn();
contextBridge.exposeInMainWorld('gogchat', api);
installFaviconChanged();
installOffline();
installPasskeyMonitor();
installSearchShortcut();
installUnreadCount();
installNotificationBridge();
