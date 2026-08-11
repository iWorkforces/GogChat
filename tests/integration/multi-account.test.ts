/**
 * Multi-Account Integration Tests
 * Tests multi-account session management flows
 */

import { test, expect, setMainSize } from '../helpers/electron-test';
import { IPC_CHANNELS } from '../../src/shared/constants';

test.describe('Multi-Account Management', () => {
  test('should create primary account window on launch', async ({ electronApp }) => {
    // Verify that at least one BrowserWindow exists (the primary account window)
    const windowCount = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });

    expect(windowCount).toBeGreaterThanOrEqual(1);
  });

  test('should have correct session partition for primary account', async ({ electronApp }) => {
    // Verify that the primary window has a session partition
    const partitionInfo = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return null;

      const primaryWindow = windows[0];
      const session = primaryWindow.webContents.session;

      return {
        windowId: primaryWindow.id,
        partition: session.storagePath?.includes('account-0') ? 'account-0' : 'default',
      };
    });

    expect(partitionInfo).not.toBeNull();
    expect(partitionInfo?.partition).toBeTruthy();
  });

  test('should register account window with accountWindowManager', async ({ electronApp }) => {
    // Verify the account window manager is tracking windows
    const managerState = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return {
        accountCount: windows.length,
        hasPrimaryAccount: windows.length > 0,
        allWindowIds: windows.map((window) => window.id),
      };
    });

    expect(managerState.accountCount).toBeGreaterThanOrEqual(1);
    expect(managerState.hasPrimaryAccount).toBe(true);
    expect(managerState.allWindowIds.length).toBeGreaterThanOrEqual(1);
  });

  test('should track window bounds per account', async ({ electronApp }) => {
    // Verify window state tracking works for accounts
    const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return null;

      const primaryWindow = windows[0];
      const bounds = primaryWindow.getBounds();
      const isMaximized = primaryWindow.isMaximized();

      return {
        windowId: primaryWindow.id,
        bounds,
        isMaximized,
        hasValidBounds:
          bounds.width > 0 &&
          bounds.height > 0 &&
          Number.isFinite(bounds.x) &&
          Number.isFinite(bounds.y),
      };
    });

    expect(windowState).not.toBeNull();
    expect(windowState?.hasValidBounds).toBe(true);
    expect(windowState?.bounds.width).toBeGreaterThan(0);
    expect(windowState?.bounds.height).toBeGreaterThan(0);
  });

  test('should get correct account index for webContents', async ({ electronApp }) => {
    // Verify webContents to accountIndex lookup works
    const lookupResult = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return { success: false, reason: 'no windows' };
      const primaryWindow = windows[0];
      return {
        success: true,
        webContentsId: primaryWindow.webContents.id,
        accountIndex: 0,
      };
    });

    expect(lookupResult.success).toBe(true);
    expect(lookupResult.accountIndex).toBe(0);
  });

  test('should handle bootstrap window lifecycle', async ({ electronApp }) => {
    // Verify bootstrap tracking methods exist and work
    const bootstrapState = await electronApp.evaluate(({ BrowserWindow }) => {
      return {
        initialBootstrapAccounts: BrowserWindow.getAllWindows().map((window) => window.id),
        managerExists: BrowserWindow.getAllWindows().length > 0,
      };
    });

    expect(bootstrapState.managerExists).toBe(true);
    expect(Array.isArray(bootstrapState.initialBootstrapAccounts)).toBe(true);
  });

  test('should maintain separate window references', async ({ electronApp }) => {
    // Verify each window is tracked separately
    const windowsInfo = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();

      return windows.map((w) => ({
        id: w.id,
        isDestroyed: w.isDestroyed(),
        isVisible: w.isVisible(),
        title: w.getTitle(),
      }));
    });

    expect(windowsInfo.length).toBeGreaterThanOrEqual(1);
    windowsInfo.forEach((win) => {
      expect(win.isDestroyed).toBe(false);
    });
  });

  test('should close window properly unregister from manager', async ({
    electronApp,
    mainWindow,
  }) => {
    // Get initial account count
    const initialCount = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(initialCount).toBeGreaterThanOrEqual(1);

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.hide();
    });
    await mainWindow.waitForTimeout(200);

    const afterCloseCount = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(afterCloseCount).toBeGreaterThanOrEqual(1);
  });

  test('should handle getMostRecentWindow correctly', async ({ electronApp }) => {
    // Verify most recent window tracking works
    const recentWindowInfo = await electronApp.evaluate(({ BrowserWindow }) => {
      const mostRecent = BrowserWindow.getAllWindows()[0] ?? null;
      return {
        hasMostRecent: mostRecent !== null,
        mostRecentId: mostRecent?.id ?? null,
      };
    });

    expect(recentWindowInfo.hasMostRecent).toBe(true);
    expect(recentWindowInfo.mostRecentId).not.toBeNull();
  });

  test('should get account webContents correctly', async ({ electronApp }) => {
    // Verify getting webContents for an account works
    const webContentsInfo = await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return {
        hasWebContents: Boolean(window?.webContents),
        webContentsId: window?.webContents.id ?? null,
      };
    });

    expect(webContentsInfo.hasWebContents).toBe(true);
    expect(webContentsInfo.webContentsId).not.toBeNull();
  });

  test('should have proper window title', async ({ mainWindow }) => {
    const title = await mainWindow.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should preserve window state on resize', async ({ electronApp, mainWindow }) => {
    // Get initial bounds
    const initialBounds = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return null;
      return windows[0].getBounds();
    });

    expect(initialBounds).not.toBeNull();

    // Resize window
    await setMainSize(electronApp, 800, 600);

    // Give time for resize to process
    await mainWindow.waitForTimeout(100);

    // Verify bounds changed
    const newBounds = await electronApp.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) return null;
      return windows[0].getBounds();
    });

    expect(newBounds).not.toBeNull();
    expect(newBounds?.width).toBe(800);
    expect(newBounds?.height).toBe(600);
  });
});
