/**
 * Unit tests for mediaPermissions feature.
 * Security-phase init must resolve without awaiting TCC (KD4 fire-and-forget).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/security/mediaAccess.js', () => ({
  checkAndRequestMediaAccess: vi.fn(),
}));

vi.mock('../utils/lifecycle/resourceCleanup.js', () => ({
  createTrackedTimeout: vi.fn(),
}));

import log from 'electron-log';
import { checkAndRequestMediaAccess } from '../utils/security/mediaAccess.js';
import { createTrackedTimeout } from '../utils/lifecycle/resourceCleanup.js';
import mediaPermissionsInit, { cleanupMediaPermissions } from './mediaPermissions';

const mockCheckAndRequest = checkAndRequestMediaAccess as Mock;
const mockCreateTrackedTimeout = createTrackedTimeout as Mock;

/** Run the scheduled TCC callback (if any) and flush microtasks. */
async function flushScheduledTcc(): Promise<void> {
  expect(mockCreateTrackedTimeout).toHaveBeenCalledWith(
    expect.any(Function),
    0,
    'media-permissions-tcc'
  );
  const scheduled = mockCreateTrackedTimeout.mock.calls[0]?.[0] as (() => void) | undefined;
  expect(scheduled).toBeTypeOf('function');
  scheduled?.();
  await Promise.resolve();
  await Promise.resolve();
}

describe('mediaPermissions', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    // Do not auto-run — tests control when TCC work starts.
    mockCreateTrackedTimeout.mockImplementation(() => 1 as unknown as NodeJS.Timeout);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('default (init) — fire-and-forget', () => {
    it('resolves before TCC settles (does not await media access)', async () => {
      let resolveCamera!: (value: boolean) => void;
      mockCheckAndRequest.mockImplementation(
        (type: string) =>
          new Promise<boolean>((resolve) => {
            if (type === 'camera') {
              resolveCamera = resolve;
            } else {
              resolve(true);
            }
          })
      );

      await expect(mediaPermissionsInit({})).resolves.toBeUndefined();

      // Scheduled but not started until timeout callback runs
      expect(mockCreateTrackedTimeout).toHaveBeenCalledTimes(1);
      expect(mockCheckAndRequest).not.toHaveBeenCalled();

      const scheduled = mockCreateTrackedTimeout.mock.calls[0]?.[0] as () => void;
      scheduled();
      // Camera pending — still must not have thrown from init
      expect(mockCheckAndRequest).toHaveBeenCalledWith('camera');
      expect(mockCheckAndRequest).not.toHaveBeenCalledWith('microphone');

      resolveCamera(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(mockCheckAndRequest).toHaveBeenCalledWith('microphone');
    });

    it('checks camera and microphone after the tracked timeout fires', async () => {
      mockCheckAndRequest.mockResolvedValue(true);

      await mediaPermissionsInit({});
      expect(mockCheckAndRequest).not.toHaveBeenCalled();

      await flushScheduledTcc();

      expect(mockCheckAndRequest).toHaveBeenCalledWith('camera');
      expect(mockCheckAndRequest).toHaveBeenCalledWith('microphone');
    });

    it('logs warning when camera permission is denied', async () => {
      mockCheckAndRequest.mockImplementation((type: string) => Promise.resolve(type !== 'camera'));

      await mediaPermissionsInit({});
      await flushScheduledTcc();

      expect(log.warn).toHaveBeenCalledWith(
        '[MediaPermissions] Camera permission denied or restricted'
      );
    });

    it('logs warning when microphone permission is denied', async () => {
      mockCheckAndRequest.mockImplementation((type: string) =>
        Promise.resolve(type !== 'microphone')
      );

      await mediaPermissionsInit({});
      await flushScheduledTcc();

      expect(log.warn).toHaveBeenCalledWith(
        '[MediaPermissions] Microphone permission denied or restricted'
      );
    });

    it('skips permission checks on non-darwin platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      await mediaPermissionsInit({});

      expect(mockCreateTrackedTimeout).not.toHaveBeenCalled();
      expect(mockCheckAndRequest).not.toHaveBeenCalled();
    });

    it('handles errors in scheduled work without throwing from init', async () => {
      mockCheckAndRequest.mockRejectedValue(new Error('TCC error'));

      await expect(mediaPermissionsInit({})).resolves.toBeUndefined();
      await flushScheduledTcc();

      expect(log.error).toHaveBeenCalledWith(
        '[MediaPermissions] Failed to check media permissions:',
        expect.any(Error)
      );
    });
  });

  describe('cleanupMediaPermissions', () => {
    it('logs cleanup message', () => {
      cleanupMediaPermissions();

      expect(log.debug).toHaveBeenCalledWith('[MediaPermissions] Cleanup (no-op)');
    });
  });
});
