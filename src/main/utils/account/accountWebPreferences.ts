/**
 * Shared account WebContents webPreferences factory (KD12).
 *
 * Used by BrowserWindow (`windowWrapper`) and WebContentsView
 * (`accountViewManager`) so sandbox/isolation/preload/partition/throttle
 * rules cannot drift between backends.
 */

import path from 'path';
import { app } from 'electron';

/**
 * Parse account index from `persist:account-N`. Returns 0 when absent/invalid.
 */
export function parseAccountIndexFromPartition(partition: string | undefined): number {
  if (partition === undefined) {
    return 0;
  }
  const match = /^persist:account-(\d+)$/.exec(partition);
  if (match && match[1]) {
    const idx = parseInt(match[1], 10);
    if (!Number.isNaN(idx)) return idx;
  }
  return 0;
}

export interface CreateAccountWebPreferencesOptions {
  /**
   * Session partition (e.g. `persist:account-0`). When set, applied to
   * webPreferences.partition and used to derive backgroundThrottling.
   */
  partition?: string;
}

/**
 * Hardened webPreferences for a Google Chat account document.
 *
 * - account-0: backgroundThrottling false (badge/notification reliability)
 * - accounts 1+: backgroundThrottling true (blur/hide savings)
 */
export function createAccountWebPreferences(
  options: CreateAccountWebPreferencesOptions = {}
): Electron.WebPreferences {
  const { partition } = options;
  const accountIndex = parseAccountIndexFromPartition(partition);

  const webPreferences: Electron.WebPreferences = {
    autoplayPolicy: 'user-gesture-required',
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    disableBlinkFeatures: 'Auxclick',
    // account-0 keeps throttling disabled for badge/notification reliability.
    // Accounts 1+ enable Chromium background throttling by default.
    backgroundThrottling: accountIndex > 0,
    preload: path.join(app.getAppPath(), 'lib/preload/index.js'),
  };

  if (partition !== undefined) {
    webPreferences.partition = partition;
  }

  return webPreferences;
}
