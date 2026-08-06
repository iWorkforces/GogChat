/**
 * Unit tests for appUpdates feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-update-notifier', () => ({
  setUpdateNotification: vi.fn(),
  checkForUpdates: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn().mockReturnValue('3.0.0'),
    isPackaged: true,
  },
}));

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockCreateTrackedTimeout, mockCreateTrackedInterval } = vi.hoisted(() => ({
  mockCreateTrackedTimeout: vi.fn((fn: () => void) => {
    fn();
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }),
  mockCreateTrackedInterval: vi.fn((fn: () => void) => {
    fn();
    return 1 as unknown as ReturnType<typeof setInterval>;
  }),
}));

vi.mock('../utils/lifecycle/resourceCleanup.js', () => ({
  createTrackedTimeout: mockCreateTrackedTimeout,
  createTrackedInterval: mockCreateTrackedInterval,
}));

vi.mock('../config.js', () => ({
  configGet: vi.fn().mockReturnValue(true),
}));

vi.mock('../utils/platform/packageInfo.js', () => ({
  getPackageInfo: vi.fn().mockReturnValue({
    repository: 'https://github.com/iWorkforces/GogChat',
    productName: 'GogChat',
  }),
}));

vi.mock('../utils/platform/updateWindow.js', () => ({
  beginUpdateDialogSession: vi.fn(),
  isUpdateSessionDismissed: vi.fn().mockReturnValue(false),
  presentUpdateDialog: vi.fn().mockResolvedValue({ response: 1 }),
}));

vi.mock('../utils/security/shellWrapper.js', () => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../shared/urlValidators.js', () => ({
  validateExternalURL: vi.fn((url: string) => url),
}));

vi.mock('./menuActionRegistry.js', () => ({
  registerMenuAction: vi.fn(),
}));

import appUpdates, { checkForUpdatesManual, githubRepoSlug, isVersionNewer } from './appUpdates';
import { setUpdateNotification, checkForUpdates } from 'electron-update-notifier';
import { configGet } from '../config.js';
import { presentUpdateDialog, isUpdateSessionDismissed } from '../utils/platform/updateWindow.js';
import { openExternal } from '../utils/security/shellWrapper.js';

describe('appUpdates helpers', () => {
  it('githubRepoSlug parses HTTPS and bare owner/repo', () => {
    expect(githubRepoSlug('https://github.com/iWorkforces/GogChat')).toBe('iWorkforces/GogChat');
    expect(githubRepoSlug('https://github.com/iWorkforces/GogChat.git')).toBe(
      'iWorkforces/GogChat'
    );
    expect(githubRepoSlug('iWorkforces/GogChat')).toBe('iWorkforces/GogChat');
    expect(githubRepoSlug('https://example.com/not-github')).toBeNull();
  });

  it('isVersionNewer compares dotted segments', () => {
    expect(isVersionNewer('3.1.0', '3.0.0')).toBe(true);
    expect(isVersionNewer('v4.0.0', '3.18.5')).toBe(true);
    expect(isVersionNewer('3.0.0', '3.0.0')).toBe(false);
    expect(isVersionNewer('2.9.9', '3.0.0')).toBe(false);
  });
});

describe('appUpdates background', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(configGet).mockReturnValue(true);
  });

  it('schedules initial and daily checks', () => {
    appUpdates();
    expect(mockCreateTrackedTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      5000,
      'appUpdates-initial-check'
    );
    expect(mockCreateTrackedInterval).toHaveBeenCalledWith(
      expect.any(Function),
      1000 * 60 * 60 * 24,
      'appUpdates-daily-check'
    );
  });

  it('skips checks when auto-check is disabled', () => {
    vi.mocked(configGet).mockReturnValue(false);
    appUpdates();
    expect(setUpdateNotification).not.toHaveBeenCalled();
    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it('calls setUpdateNotification and checkForUpdates when auto-check is enabled', () => {
    appUpdates();
    expect(setUpdateNotification).toHaveBeenCalled();
    expect(checkForUpdates).toHaveBeenCalled();
  });
});

describe('checkForUpdatesManual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isUpdateSessionDismissed).mockReturnValue(false);
    vi.mocked(presentUpdateDialog).mockResolvedValue({ response: 1 });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            tag_name: 'v9.0.0',
            body: 'Release notes',
            html_url: 'https://github.com/iWorkforces/GogChat/releases/tag/v9.0.0',
          },
        ],
      })
    );
  });

  it('shows checking then new-release dialog when update exists', async () => {
    await checkForUpdatesManual();

    expect(presentUpdateDialog).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'checking' })
    );
    expect(presentUpdateDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'result',
        message: 'New release available',
        buttons: ['Download', 'Later'],
      })
    );
  });

  it('opens release page when user chooses Download', async () => {
    vi.mocked(presentUpdateDialog).mockImplementation(async (opts) => {
      if (opts.phase === 'result' && opts.buttons?.includes('Download')) {
        return { response: 0 };
      }
      return { response: -1 };
    });

    await checkForUpdatesManual();
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/iWorkforces/GogChat/releases/tag/v9.0.0'
    );
  });

  it('shows up-to-date when latest is not newer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            tag_name: 'v3.0.0',
            body: '',
            html_url: 'https://github.com/iWorkforces/GogChat/releases/tag/v3.0.0',
          },
        ],
      })
    );

    await checkForUpdatesManual();
    expect(presentUpdateDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'result',
        message: expect.stringContaining('up to date'),
      })
    );
  });

  it('shows error dialog when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    await checkForUpdatesManual();
    expect(presentUpdateDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'Couldn’t check for updates',
      })
    );
  });
});
