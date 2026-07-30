/**
 * Unit tests for macOS notification permission utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

const mockPlatformState = vi.hoisted(() => ({ isMac: true }));

vi.mock('electron', () => ({
  Notification: Object.assign(
    vi.fn(function MockNotification(this: {
      on: ReturnType<typeof vi.fn>;
      show: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }) {
      this.on = vi.fn();
      this.show = vi.fn();
      this.close = vi.fn();
    }),
    { isSupported: vi.fn().mockReturnValue(true) }
  ),
  dialog: {
    showMessageBox: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(''),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../config.js', () => ({
  configGet: vi.fn(),
  configSet: vi.fn(),
}));

vi.mock('../platform/platformDetection.js', () => ({
  platform: mockPlatformState,
}));

vi.mock('../../../shared/urlValidators.js', () => ({
  validateAppleSystemPreferencesURL: vi.fn((url: string) => url),
}));

vi.mock('./shellWrapper.js', () => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
}));

import type { BrowserWindow } from 'electron';
import { Notification, dialog, shell } from 'electron';
import log from 'electron-log';
import { configGet, configSet } from '../../config.js';
import { validateAppleSystemPreferencesURL } from '../../../shared/urlValidators.js';
import { openExternal } from './shellWrapper.js';
import {
  ensureNotificationPermission,
  openNotificationSystemSettings,
  showNotificationSettingsDialog,
  resetNotificationPermissionSchedulingForTests,
  NOTIFICATION_SETTINGS_URL,
  NOTIFICATION_SETTINGS_URL_LEGACY,
} from './notificationAccess.js';

const mockConfigGet = configGet as Mock;
const mockConfigSet = configSet as Mock;
const mockShowMessageBox = dialog.showMessageBox as Mock;
const mockOpenExternal = openExternal as Mock;
const mockOpenPath = shell.openPath as Mock;
const mockValidateURL = validateAppleSystemPreferencesURL as Mock;
const mockLogDebug = log.debug as Mock;
const mockLogInfo = log.info as Mock;
const NotificationCtor = Notification as unknown as ReturnType<typeof vi.fn> & {
  isSupported: ReturnType<typeof vi.fn>;
};

function parentWindow(destroyed = false): BrowserWindow {
  return {
    isDestroyed: vi.fn().mockReturnValue(destroyed),
  } as unknown as BrowserWindow;
}

async function flushImmediates(): Promise<void> {
  // Drain setImmediate + dialog promise microtasks from the async first-run path
  for (let i = 0; i < 6; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('notificationAccess', () => {
  const originalCI = process.env.CI;

  beforeEach(() => {
    vi.resetAllMocks();
    resetNotificationPermissionSchedulingForTests();
    mockPlatformState.isMac = true;
    NotificationCtor.isSupported.mockReturnValue(true);
    mockConfigGet.mockReturnValue(false);
    mockValidateURL.mockImplementation((url: string) => url);
    mockOpenExternal.mockResolvedValue(undefined);
    mockOpenPath.mockResolvedValue('');
    mockShowMessageBox.mockResolvedValue({ response: 0 });
    delete process.env.CI;
  });

  afterEach(() => {
    if (originalCI !== undefined) process.env.CI = originalCI;
    else delete process.env.CI;
    resetNotificationPermissionSchedulingForTests();
  });

  describe('ensureNotificationPermission', () => {
    it('returns unsupported on non-mac and logs', () => {
      mockPlatformState.isMac = false;
      expect(ensureNotificationPermission()).toBe('unsupported');
      expect(NotificationCtor).not.toHaveBeenCalled();
      expect(mockLogDebug).toHaveBeenCalledWith(
        expect.stringContaining('ensure → unsupported')
      );
    });

    it('returns unsupported when Notification.isSupported is false', () => {
      NotificationCtor.isSupported.mockReturnValue(false);
      expect(ensureNotificationPermission()).toBe('unsupported');
      expect(NotificationCtor).not.toHaveBeenCalled();
    });

    it('returns skipped-ci in CI environment', () => {
      process.env.CI = 'true';
      expect(ensureNotificationPermission()).toBe('skipped-ci');
      expect(NotificationCtor).not.toHaveBeenCalled();
      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('ensure → skipped-ci'));
    });

    it('returns already-requested when config flag is true and logs', () => {
      mockConfigGet.mockReturnValue(true);
      expect(ensureNotificationPermission()).toBe('already-requested');
      expect(NotificationCtor).not.toHaveBeenCalled();
      expect(mockLogDebug).toHaveBeenCalledWith(
        expect.stringContaining('ensure → already-requested')
      );
    });

    it('schedules at most one probe for same-process multi-calls (no parent)', async () => {
      expect(ensureNotificationPermission()).toBe('scheduled');
      expect(ensureNotificationPermission()).toBe('already-requested');

      await flushImmediates();

      expect(NotificationCtor).toHaveBeenCalledTimes(1);
      expect(NotificationCtor).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'GogChat',
          body: 'Notifications enabled',
          silent: true,
        })
      );
      expect(mockShowMessageBox).not.toHaveBeenCalled();
    });

    it('shows first-run dialog then probes when parentWindow is provided', async () => {
      const window = parentWindow();
      mockShowMessageBox.mockResolvedValue({ response: 0 });

      expect(ensureNotificationPermission({ parentWindow: window })).toBe('scheduled');
      await flushImmediates();

      expect(mockShowMessageBox).toHaveBeenCalledWith(
        window,
        expect.objectContaining({
          title: 'Enable Notifications',
          message: 'Get notified about new Chat messages',
          buttons: ['Enable', 'System Settings', 'Not Now'],
        })
      );
      expect(NotificationCtor).toHaveBeenCalledTimes(1);
    });

    it('opens System Settings and probes when user chooses Open System Settings', async () => {
      const window = parentWindow();
      mockShowMessageBox.mockResolvedValue({ response: 1 });

      ensureNotificationPermission({ parentWindow: window });
      await flushImmediates();

      expect(mockOpenExternal).toHaveBeenCalled();
      expect(NotificationCtor).toHaveBeenCalledTimes(1);
    });

    it('does not probe when user chooses Not Now; later calls return prompt-declined', async () => {
      const window = parentWindow();
      mockShowMessageBox.mockResolvedValue({ response: 2 });

      expect(ensureNotificationPermission({ parentWindow: window })).toBe('scheduled');
      await flushImmediates();

      expect(NotificationCtor).not.toHaveBeenCalled();
      expect(mockConfigSet).not.toHaveBeenCalledWith(
        'app.notificationPermissionRequested',
        true
      );

      expect(ensureNotificationPermission({ parentWindow: window })).toBe('prompt-declined');
      expect(mockShowMessageBox).toHaveBeenCalledTimes(1);
    });

    it('probes without dialog when parent window is already destroyed', async () => {
      const window = parentWindow(true);
      expect(ensureNotificationPermission({ parentWindow: window })).toBe('scheduled');
      await flushImmediates();

      expect(mockShowMessageBox).not.toHaveBeenCalled();
      expect(NotificationCtor).toHaveBeenCalledTimes(1);
    });

    it('releases guard when probe constructor throws inside setImmediate', async () => {
      NotificationCtor.mockImplementationOnce(function fail() {
        throw new Error('ctor failed');
      });
      expect(ensureNotificationPermission()).toBe('scheduled');
      await flushImmediates();
      // Guard released so a later call can schedule again
      NotificationCtor.mockImplementation(function MockNotification(this: {
        on: ReturnType<typeof vi.fn>;
        show: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
      }) {
        this.on = vi.fn();
        this.show = vi.fn();
        this.close = vi.fn();
      });
      expect(ensureNotificationPermission()).toBe('scheduled');
    });

    it('persists config flag only after probe show', async () => {
      ensureNotificationPermission();
      await flushImmediates();

      const instance = NotificationCtor.mock.instances[0] as {
        on: ReturnType<typeof vi.fn>;
        show: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
      };
      expect(instance.show).toHaveBeenCalled();
      expect(mockConfigSet).not.toHaveBeenCalled();

      const showHandler = instance.on.mock.calls.find((call) => call[0] === 'show')?.[1] as
        | (() => void)
        | undefined;
      expect(showHandler).toBeDefined();
      showHandler?.();

      expect(mockConfigSet).toHaveBeenCalledWith('app.notificationPermissionRequested', true);
      expect(instance.close).toHaveBeenCalled();
    });

    it('does not persist config flag when probe fails', async () => {
      ensureNotificationPermission();
      await flushImmediates();

      const instance = NotificationCtor.mock.instances[0] as {
        on: ReturnType<typeof vi.fn>;
      };
      const failedHandler = instance.on.mock.calls.find((call) => call[0] === 'failed')?.[1] as
        | (() => void)
        | undefined;
      failedHandler?.();

      expect(mockConfigSet).not.toHaveBeenCalledWith('app.notificationPermissionRequested', true);

      // After failure, a later ensure can schedule again
      expect(ensureNotificationPermission()).toBe('scheduled');
    });
  });

  describe('openNotificationSystemSettings', () => {
    it('opens the preferred Notifications settings URL', async () => {
      await openNotificationSystemSettings();

      expect(mockValidateURL).toHaveBeenCalledWith(NOTIFICATION_SETTINGS_URL);
      expect(mockOpenExternal).toHaveBeenCalledWith(NOTIFICATION_SETTINGS_URL);
      expect(mockOpenPath).not.toHaveBeenCalled();
    });

    it('falls back to legacy URL then System Settings app', async () => {
      mockOpenExternal
        .mockRejectedValueOnce(new Error('primary failed'))
        .mockRejectedValueOnce(new Error('legacy failed'));

      await openNotificationSystemSettings();

      expect(mockValidateURL).toHaveBeenCalledWith(NOTIFICATION_SETTINGS_URL);
      expect(mockValidateURL).toHaveBeenCalledWith(NOTIFICATION_SETTINGS_URL_LEGACY);
      expect(mockOpenPath).toHaveBeenCalledWith('/System/Applications/System Settings.app');
    });

    it('logs when System Settings app fallback also fails', async () => {
      mockOpenExternal
        .mockRejectedValueOnce(new Error('primary failed'))
        .mockRejectedValueOnce(new Error('legacy failed'));
      mockOpenPath.mockRejectedValueOnce(new Error('no settings app'));

      await openNotificationSystemSettings();
      expect(mockOpenPath).toHaveBeenCalled();
    });
  });

  describe('showNotificationSettingsDialog', () => {
    it('opens settings when user chooses Open System Settings', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const window = {} as BrowserWindow;

      await showNotificationSettingsDialog(window);

      expect(mockShowMessageBox).toHaveBeenCalledWith(
        window,
        expect.objectContaining({
          title: 'Notification Settings',
          buttons: ['Open System Settings', 'Cancel'],
        })
      );
      expect(mockOpenExternal).toHaveBeenCalled();
    });

    it('does not open settings when user cancels', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 });
      const window = {} as BrowserWindow;

      await showNotificationSettingsDialog(window);

      expect(mockOpenExternal).not.toHaveBeenCalled();
      expect(mockOpenPath).not.toHaveBeenCalled();
    });
  });
});
