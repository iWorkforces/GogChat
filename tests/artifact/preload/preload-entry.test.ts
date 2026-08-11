/**
 * Built-CJS preload entry fixture.
 * Loads the actual lib/preload/index.js — not TypeScript sources.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');
const PRELOAD_PATH = path.join(PROJECT_ROOT, 'lib/preload/index.js');

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="https://www.google.com/favicon.ico" />
    <script>
      window.__credentialsAtParse = navigator.credentials;
    </script>
  </head>
  <body>
    <input name="q" id="search" />
    <div class="RuSDjb">
      <span class="OK1FOb" aria-label="3 unread messages">3</span>
    </div>
    <script>
      window.__offlineFailed = 0;
      window.addEventListener('app:onlineCheckFailed', () => {
        window.__offlineFailed += 1;
      });
    </script>
  </body>
</html>
`;

const FIXTURE_MAIN = `const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const preload = process.env.GOGCHAT_PRELOAD_PATH;
const page = process.env.GOGCHAT_FIXTURE_HTML;
const userData = process.env.GOGCHAT_USER_DATA;

if (!preload || !page || !userData) {
  throw new Error('missing fixture env');
}

app.setPath('userData', userData);
app.__gogchatIpc = [];

for (const channel of [
  'faviconChanged',
  'unreadCount',
  'checkIfOnline',
  'notificationShow',
  'passkeyAuthFailed',
]) {
  ipcMain.on(channel, (_event, data) => {
    app.__gogchatIpc.push({ channel, data });
  });
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.loadFile(page);
});
`;

async function recordedIpc(
  app: Awaited<ReturnType<typeof electron.launch>>
): Promise<Array<{ channel: string; data: unknown }>> {
  return app.evaluate(({ app: electronApp }) => {
    return (
      (electronApp as { __gogchatIpc?: Array<{ channel: string; data: unknown }> }).__gogchatIpc ??
      []
    );
  });
}

test.describe('built CJS preload entry', () => {
  test('installs production preload behaviors from lib/preload/index.js', async () => {
    const userData = await mkdtemp(path.join(tmpdir(), 'gogchat-preload-'));
    const htmlPath = path.join(userData, 'index.html');
    const mainPath = path.join(userData, 'main.cjs');
    await writeFile(htmlPath, FIXTURE_HTML);
    await writeFile(mainPath, FIXTURE_MAIN);

    let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
    try {
      app = await electron.launch({
        args: [mainPath],
        env: {
          ...process.env,
          GOGCHAT_PRELOAD_PATH: PRELOAD_PATH,
          GOGCHAT_FIXTURE_HTML: htmlPath,
          GOGCHAT_USER_DATA: userData,
        },
      });

      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');

      await page.waitForFunction(() => navigator.credentials === undefined);

      const bridge = await page.evaluate(() => {
        const api = window.gogchat;
        return {
          exists: Boolean(api),
          methods: api ? Object.keys(api).sort() : [],
        };
      });
      expect(bridge.exists).toBe(true);
      expect(bridge.methods).toEqual([
        'checkIfOnline',
        'onOnlineStatus',
        'onSearchShortcut',
        'reportPasskeyFailure',
        'sendFaviconChanged',
        'sendNotificationClicked',
        'sendUnreadCount',
      ]);

      await page.waitForTimeout(250);
      const afterLoad = await recordedIpc(app);
      expect(afterLoad.some((item) => item.channel === 'unreadCount' && item.data === 3)).toBe(
        true
      );

      await page.evaluate(() => {
        const icon = document.querySelector('link[rel="icon"]');
        if (icon)
          icon.setAttribute(
            'href',
            'https://www.gstatic.com/images/branding/product/1x/googleg_32dp.png'
          );
      });
      await page.waitForTimeout(150);
      const afterFavicon = await recordedIpc(app);
      expect(afterFavicon.some((item) => item.channel === 'faviconChanged')).toBe(true);

      await page.evaluate(() => {
        window.gogchat.reportPasskeyFailure('NotAllowedError');
        window.dispatchEvent(
          new CustomEvent('__gogchatNotificationShow', {
            detail: { title: 'hello', body: 'world', tag: 't1' },
          })
        );
      });
      await page.waitForTimeout(50);
      const afterBridge = await recordedIpc(app);
      expect(afterBridge.some((item) => item.channel === 'passkeyAuthFailed')).toBe(true);
      expect(afterBridge.some((item) => item.channel === 'notificationShow')).toBe(true);

      await app.evaluate(({ BrowserWindow }, channel) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send(channel);
      }, 'searchShortcut');
      await page.waitForTimeout(50);
      const activeId = await page.evaluate(() => document.activeElement?.id);
      expect(activeId).toBe('search');

      await page.evaluate(() => {
        window.dispatchEvent(new Event('app:checkIfOnline'));
      });
      await page.waitForTimeout(50);
      const afterOnlineCheck = await recordedIpc(app);
      expect(afterOnlineCheck.some((item) => item.channel === 'checkIfOnline')).toBe(true);

      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send('onlineStatus', false);
      });
      await page.waitForTimeout(50);
      const failedCount = await page.evaluate(() => {
        return (window as unknown as { __offlineFailed: number }).__offlineFailed;
      });
      expect(failedCount).toBe(1);
      expect(page.url().startsWith('file://')).toBe(true);

      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        win?.webContents.send('onlineStatus', true);
      });
      await page.waitForURL(
        (url) => {
          const href = url.toString();
          return href.includes('chat.google.com') || href.includes('workspace.google.com');
        },
        {
          timeout: 8_000,
          waitUntil: 'commit',
        }
      );
    } finally {
      if (app) {
        await app.close();
      }
      await rm(userData, { recursive: true, force: true });
    }
  });
});
