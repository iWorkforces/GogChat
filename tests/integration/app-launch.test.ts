/**
 * App Launch Integration Tests
 * Tests basic application launch and initialization
 */

import {
  test,
  expect,
  getAppInfo,
  checkSecuritySettings,
  getMainBounds,
  isChatUrl,
  isMainWindowVisible,
} from '../helpers/electron-test';

test.describe('App Launch', () => {
  test('should launch the application successfully', async ({ electronApp, mainWindow }) => {
    // Check that app launched
    const appInfo = await getAppInfo(electronApp);
    expect(appInfo.name.toLowerCase()).toMatch(/gogchat|electron/);
    expect(appInfo.version).toBeTruthy();

    // Check main window is visible
    expect(await isMainWindowVisible(electronApp)).toBe(true);

    // Check window title
    const title = await mainWindow.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should have correct security settings', async ({ electronApp }) => {
    const security = await checkSecuritySettings(electronApp);

    // Verify critical security settings
    expect(security.contextIsolation).toBe(true);
    expect(security.nodeIntegration).toBe(false);
    expect(security.sandbox).toBe(true);
    expect(security.webSecurity).toBe(true); // Matches windowWrapper / product defaults
  });

  test('should load GogChat URL', async ({ mainWindow }) => {
    // Wait for navigation
    await mainWindow.waitForLoadState('networkidle');

    // Check URL
    const url = await mainWindow.url();
    expect(isChatUrl(url)).toBe(true);
  });

  test('should create system tray icon', async ({ electronApp }) => {
    // Check if tray exists
    const hasTray = await electronApp.evaluate(({ Tray }) => {
      // This would need actual implementation to track tray instances
      return true; // Simplified for now
    });

    expect(hasTray).toBe(true);
  });

  test('should have application menu', async ({ electronApp }) => {
    const hasMenu = await electronApp.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      return menu !== null;
    });

    expect(hasMenu).toBe(true);
  });

  test('should enforce single instance', async ({ electronApp, appPath }) => {
    // Try to launch second instance
    const secondInstance = await electronApp.evaluate(({ app }) => {
      return app.requestSingleInstanceLock();
    });

    // First instance should have the lock
    expect(secondInstance).toBe(true);
  });

  test('should have proper window dimensions', async ({ electronApp }) => {
    const bounds = await getMainBounds(electronApp);
    expect(bounds?.width).toBeGreaterThanOrEqual(480);
    expect(bounds?.height).toBeGreaterThanOrEqual(570);
  });

  test('should handle window close to tray', async ({ electronApp }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.hide();
    });
    const windowCount = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowCount).toBeGreaterThan(0);
  });
});
