/**
 * Electron Test Helper
 * Provides utilities for testing Electron applications with Playwright
 */

// Try to import Playwright, skip tests if not available
let base: any;
let expect: any;
let electron: any;
let ElectronApplication: any;
let Page: any;

try {
  // Dynamic import for ESM compatibility (Playwright test runner uses ESM)
  const playwright = await import('@playwright/test');
  base = playwright.test;
  expect = playwright.expect;
  electron = playwright._electron;
} catch (error) {
  // Playwright not installed, create dummy exports
  console.warn(
    '[Test Helper] @playwright/test not installed. Playwright-dependent tests will be skipped.'
  );
  base = {
    describe: () => ({ skip: () => {} }),
    skip: () => {},
    extend: () => base,
  };
  expect = () => ({ toBe: () => {}, toContain: () => {} });
  electron = { launch: async () => ({}) };
}

// ESM-compatible __dirname (Node 22+ provides import.meta.dirname)
const __dirname = import.meta.dirname;

import { join } from 'path';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * Test fixtures for Electron testing
 */
export interface ElectronTestFixtures {
  electronApp: ElectronApplication;
  mainWindow: Page;
  appPath: string;
  extraElectronEnv: Record<string, string | undefined>;
}

/**
 * Extended test function with Electron fixtures
 */
export const test = base.extend<ElectronTestFixtures>({
  appPath: async ({}, use) => {
    // Path to the compiled Electron app
    const appPath = join(__dirname, '../../lib/main/index.js');
    await use(appPath);
  },

  extraElectronEnv: [{}, { option: true }],

  electronApp: [
    async ({ appPath, extraElectronEnv }, use) => {
      if (!existsSync(appPath)) {
        throw new Error(
          `Electron fixture: missing built main entry at ${appPath}. Run \`bun scripts/build-rsbuild.js\` before Playwright.`
        );
      }
      const projectRoot = join(__dirname, '../..');
      const userDataDir = mkdtempSync(join(tmpdir(), 'gogchat-pw-'));
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'test',
        TESTING: 'true',
        ...extraElectronEnv,
      };
      // Hang injection is opt-in per fixture. Never leak a parent-process flag
      // into every Electron launch.
      if (!extraElectronEnv['GOGCHAT_TEST_HANG_SHUTDOWN']) {
        delete env['GOGCHAT_TEST_HANG_SHUTDOWN'];
      }
      let app;
      try {
        app = await electron.launch({
          cwd: projectRoot,
          args: [appPath, `--user-data-dir=${userDataDir}`],
          env,
          timeout: 45_000,
        });
      } catch (error: unknown) {
        throw new Error(
          `Electron fixture: electron.launch failed (${appPath}): ${formatUnknownError(error)}`
        );
      }

      try {
        await app.firstWindow({ timeout: 45_000 });
      } catch (error: unknown) {
        await app.close().catch(() => undefined);
        throw new Error(
          `Electron fixture: firstWindow timed out or failed — BrowserWindow never appeared: ${formatUnknownError(error)}`
        );
      }

      // Product windows start show:false and only show() on ready-to-show.
      // Unauthenticated Chat often never paints on macos-latest, so that
      // event never fires. Force-show is best-effort: Playwright Electron
      // evaluate can throw "Resulting promise was garbage collected" after
      // many sequential launches. Do not fail the fixture for that.
      wrapEvaluateWithGcRetry(app);
      await showMainWindowBestEffort(app);

      await use(app);
      await closeElectronApp(app);
    },
    { timeout: 120_000 },
  ],

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow({ timeout: 45_000 });
    // Chat can stall before DCL on unauthenticated CI. Tests that need a
    // loaded document wait themselves; do not fail every case here.
    await window.waitForLoadState('domcontentloaded', { timeout: 8_000 }).catch(() => undefined);
    await use(window);
  },
});

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isEvaluateGarbageCollectedError(error: unknown): boolean {
  return /resulting promise was garbage collected/i.test(formatUnknownError(error));
}

type ElectronChildProcess = {
  exitCode: number | null;
  killed: boolean;
  once: (event: 'exit', listener: () => void) => void;
};

/** Playwright's `app.process()` throws `_object` after the child already quit. */
export function peekElectronChildProcess(app: {
  process?: () => ElectronChildProcess;
}): ElectronChildProcess | undefined {
  try {
    if (typeof app.process !== 'function') {
      return undefined;
    }
    const child = app.process();
    if (!child) {
      return undefined;
    }
    void child.exitCode;
    void child.killed;
    return child;
  } catch {
    return undefined;
  }
}

export async function callEvaluateWithGcRetry<T>(
  evaluate: (...args: never[]) => Promise<T>,
  ...args: never[]
): Promise<T> {
  try {
    return await evaluate(...args);
  } catch (error) {
    if (!isEvaluateGarbageCollectedError(error)) {
      throw error;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    return evaluate(...args);
  }
}

export function wrapEvaluateWithGcRetry<
  T extends { evaluate: (...args: never[]) => Promise<unknown> },
>(app: T): T {
  const original = app.evaluate.bind(app);
  app.evaluate = ((...args: never[]) =>
    callEvaluateWithGcRetry(original, ...args)) as T['evaluate'];
  return app;
}

export async function closeElectronApp(app: {
  close: () => Promise<unknown>;
  process?: () => ElectronChildProcess;
}): Promise<void> {
  const child = peekElectronChildProcess(app);
  await app.close().catch(() => undefined);
  if (!child) {
    return;
  }
  let alreadyGone = false;
  try {
    alreadyGone = child.exitCode !== null || child.killed;
  } catch {
    alreadyGone = true;
  }
  if (alreadyGone) {
    return;
  }
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        child.once('exit', () => {
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      }),
    ]);
  } catch {
    // Bounded-shutdown already exited; the Playwright handle can die mid-wait.
  }
}

type ElectronEvaluateApi = {
  app: {
    getAppPath: () => string;
    getName: () => string;
    getVersion: () => string;
    isPackaged: boolean;
  };
  BrowserWindow: {
    getAllWindows: () => Array<{
      id: number;
      isVisible: () => boolean;
      isDestroyed: () => boolean;
      isMaximized: () => boolean;
      getBounds: () => { x: number; y: number; width: number; height: number };
      setSize: (width: number, height: number) => void;
      setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
      hide: () => void;
      show: () => void;
      webContents: {
        getWebPreferences: () => Record<string, unknown>;
        session: { storagePath?: string };
      };
    }>;
  };
};

/** Run work in the ESM main process with a CJS `require` bound to the repo root. */
export async function evaluateWithRequire<T>(
  electronApp: { evaluate: (fn: (...args: never[]) => unknown, arg?: unknown) => Promise<T> },
  work: (api: ElectronEvaluateApi & { require: NodeRequire }) => T | Promise<T>
): Promise<T> {
  // Electron 43 evaluate is ESM: `import()` and `require()` are rejected.
  // `process.getBuiltinModule` is the Node 22+ seam that still works.
  return electronApp.evaluate((electron: ElectronEvaluateApi, workSource: string) => {
    const nodeModule = process.getBuiltinModule('module') as typeof import('node:module');
    const nodePath = process.getBuiltinModule('path') as typeof import('node:path');
    const require = nodeModule.createRequire(nodePath.join(process.cwd(), 'package.json'));
    const fn = new Function('api', `return (${workSource})(api);`) as (
      api: ElectronEvaluateApi & { require: NodeRequire }
    ) => T | Promise<T>;
    return fn({ ...electron, require });
  }, work.toString());
}

export async function getMainBounds(
  electronApp: ElectronApplication
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return window ? window.getBounds() : null;
  });
}

export async function setMainSize(
  electronApp: ElectronApplication,
  width: number,
  height: number
): Promise<void> {
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) {
        throw new Error('No windows found');
      }
      window.setSize(size.width, size.height);
    },
    { width, height }
  );
}

export async function isMainWindowVisible(electronApp: {
  evaluate: (fn: (api: ElectronEvaluateApi) => boolean) => Promise<boolean>;
}): Promise<boolean> {
  try {
    return await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return Boolean(window && !window.isDestroyed() && window.isVisible());
    });
  } catch {
    return false;
  }
}

/** Force native show(). Returns false if evaluate dies or no window exists. */
export async function showMainWindowBestEffort(electronApp: {
  evaluate: (fn: (api: ElectronEvaluateApi) => boolean) => Promise<boolean>;
}): Promise<boolean> {
  try {
    return await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window || window.isDestroyed()) {
        return false;
      }
      if (!window.isVisible()) {
        window.show();
      }
      return window.isVisible();
    });
  } catch {
    return false;
  }
}

/** Poll until the native window is shown, or `timeoutMs` elapses. */
export async function waitForMainWindowVisible(
  electronApp: {
    evaluate: (fn: (api: ElectronEvaluateApi) => boolean) => Promise<boolean>;
  },
  timeoutMs = 1500
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isMainWindowVisible(electronApp)) {
      return true;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  return isMainWindowVisible(electronApp);
}

export function isChatUrl(url: string): boolean {
  return (
    url.includes('mail.google.com/chat') ||
    url.includes('chat.google.com') ||
    url.includes('workspace.google.com')
  );
}

/** Unauthenticated CI often lands on accounts.google.com instead of Chat. */
export function isGoogleSurfaceUrl(url: string): boolean {
  return isChatUrl(url) || url.includes('google.com');
}

/**
 * Bounded load-state wait. Google Chat keeps sockets open, so `networkidle`
 * can run to the project timeout on macos-latest.
 */
export async function waitForLoadStateBounded(
  page: {
    waitForLoadState: (
      state: 'load' | 'domcontentloaded' | 'networkidle',
      options?: { timeout?: number }
    ) => Promise<void>;
  },
  state: 'load' | 'domcontentloaded' | 'networkidle',
  timeoutMs = 8_000
): Promise<boolean> {
  try {
    await page.waitForLoadState(state, { timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-export expect for convenience
 */
export { expect };

/**
 * Helper to wait for IPC message
 */
export async function waitForIPC(
  app: ElectronApplication,
  channel: string,
  timeout = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for IPC message on channel: ${channel}`));
    }, timeout);

    app
      .evaluate(({ ipcMain }, channel) => {
        return new Promise((resolve) => {
          ipcMain.once(channel, (event, data) => {
            resolve(data);
          });
        });
      }, channel)
      .then((data) => {
        clearTimeout(timer);
        resolve(data);
      })
      .catch(reject);
  });
}

/**
 * Helper to send IPC message from main process
 */
export async function sendIPCFromMain(
  app: ElectronApplication,
  channel: string,
  data?: any
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { channel, data }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send(channel, data);
      }
    },
    { channel, data }
  );
}

/**
 * Helper to get app information
 */
export async function getAppInfo(app: ElectronApplication): Promise<{
  name: string;
  version: string;
  isPackaged: boolean;
}> {
  return app.evaluate(({ app }) => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
    };
  });
}

/**
 * Helper to get window state
 */
export async function getWindowState(page: Page): Promise<{
  isVisible: boolean;
  isMaximized: boolean;
  isMinimized: boolean;
  isFullScreen: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}> {
  return page.evaluate(() => {
    const win = (window as any).electronWindow;
    if (!win) {
      throw new Error('Window reference not available');
    }
    return {
      isVisible: win.isVisible(),
      isMaximized: win.isMaximized(),
      isMinimized: win.isMinimized(),
      isFullScreen: win.isFullScreen(),
      bounds: win.getBounds(),
    };
  });
}

/**
 * Helper to check if a feature is enabled
 */
export async function isFeatureEnabled(
  app: ElectronApplication,
  featureName: string
): Promise<boolean> {
  return app.evaluate(({ app }, featureName) => {
    try {
      // Check if feature exists in config
      const Store = require('electron-store');
      const store = new Store();
      return store.get(`features.${featureName}`, false) as boolean;
    } catch {
      return false;
    }
  }, featureName);
}

/**
 * Helper to mock network responses
 */
export async function mockNetworkResponse(
  page: Page,
  url: string | RegExp,
  response: {
    status?: number;
    headers?: Record<string, string>;
    body?: string | Buffer;
  }
): Promise<void> {
  await page.route(url, (route) => {
    route.fulfill({
      status: response.status || 200,
      headers: response.headers || {},
      body: response.body || '',
    });
  });
}

/**
 * Helper to wait for an element with specific text
 */
export async function waitForText(
  page: Page,
  text: string,
  options?: { timeout?: number; selector?: string }
): Promise<void> {
  const selector = options?.selector || 'body';
  const timeout = options?.timeout || 10000;

  await page.waitForFunction(
    ({ selector, text }) => {
      const element = document.querySelector(selector);
      return element?.textContent?.includes(text);
    },
    { selector, text },
    { timeout }
  );
}

/** Viewport screenshot deadline. Keep short so a hung page cannot stall the suite. */
export const E2E_SCREENSHOT_TIMEOUT_MS = 5_000;

/** CI must not capture Chat PNGs — full-page I/O can hang the Playwright worker. */
export function isCiScreenshotDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env['CI'] || env['GITHUB_ACTIONS']);
}

/**
 * Helper to take a screenshot with metadata
 */
export async function takeScreenshot(
  page: Page,
  name: string,
  metadata?: Record<string, any>
): Promise<Buffer> {
  const screenshotDir = join(__dirname, '../screenshots');
  mkdirSync(screenshotDir, { recursive: true });

  if (isCiScreenshotDisabled()) {
    if (metadata) {
      console.log(`Screenshot '${name}' metadata:`, JSON.stringify(metadata, null, 2));
    }
    return Buffer.alloc(0);
  }

  const screenshot = await page.screenshot({
    path: join(screenshotDir, `${name}.png`),
    fullPage: false,
    timeout: E2E_SCREENSHOT_TIMEOUT_MS,
  });

  // Log metadata if provided
  if (metadata) {
    console.log(`Screenshot '${name}' metadata:`, JSON.stringify(metadata, null, 2));
  }

  return screenshot;
}

/**
 * Helper to clean up test data
 */
export async function cleanupTestData(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ app }) => {
    const userDataPath = app.getPath('userData');
    const fs = require('fs').promises;
    const path = require('path');

    // Clean test-specific files
    const testFiles = ['test-config.json', 'test-messages.db', 'test-cache.json'];

    for (const file of testFiles) {
      try {
        await fs.unlink(path.join(userDataPath, file));
      } catch {
        // File doesn't exist, ignore
      }
    }
  });
}

/**
 * Helper to simulate offline mode
 */
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

/**
 * Helper to simulate online mode
 */
export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

/**
 * Helper to get logs from the main process
 */
export async function getMainProcessLogs(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => {
    const log = require('electron-log');
    // This is a simplified version - actual implementation would need
    // to read from the log file or implement a custom transport
    return [];
  });
}

/**
 * Helper to simulate keyboard shortcuts
 */
export async function pressShortcut(page: Page, shortcut: string): Promise<void> {
  // Convert shortcut format (e.g., 'Cmd+F' to 'Meta+F')
  const key = shortcut.replace('Cmd', 'Meta').replace('Ctrl', 'Control').replace('Option', 'Alt');

  await page.keyboard.press(key);
}

/**
 * Helper to check if the app has proper security settings
 */
export async function checkSecuritySettings(app: ElectronApplication): Promise<{
  contextIsolation: boolean;
  nodeIntegration: boolean;
  sandbox: boolean;
  webSecurity: boolean;
}> {
  return app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      throw new Error('No windows found');
    }

    const webContents = windows[0].webContents as {
      getWebPreferences?: () => {
        contextIsolation?: boolean;
        nodeIntegration?: boolean;
        sandbox?: boolean;
        webSecurity?: boolean;
      };
    };
    const webPreferences = webContents.getWebPreferences?.() ?? {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    };
    return {
      contextIsolation: webPreferences.contextIsolation || false,
      nodeIntegration: webPreferences.nodeIntegration || false,
      sandbox: webPreferences.sandbox !== false,
      webSecurity: webPreferences.webSecurity !== false,
    };
  });
}
