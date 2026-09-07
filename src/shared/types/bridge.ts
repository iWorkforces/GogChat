/**
 * Preload contextBridge API surface exposed on window.gogchat.
 */

import type { OnlineStatusData } from './domain.js';

/**
 * Context Bridge API exposed to renderer
 */
export interface GogChatBridgeAPI {
  // Send messages to main process
  sendUnreadCount: (count: number) => void;
  sendFaviconChanged: (href: string) => void;
  sendNotificationClicked: () => void;
  checkIfOnline: (attemptId: string) => void;
  reportPasskeyFailure: (errorType: string) => void;

  // Receive messages from main process
  onSearchShortcut: (callback: () => void) => () => void;
  onOnlineStatus: (callback: (status: OnlineStatusData) => void) => () => void;
}

/**
 * Extended window interface with our custom API
 */
declare global {
  interface Window {
    gogchat: GogChatBridgeAPI;
  }
}
