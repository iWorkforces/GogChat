/**
 * Proactive camera/microphone TCC permission check.
 *
 * Kept in the security phase (security.spec.ts) but must not block
 * `runPhase('security')` / first-window creation: TCC prompts are scheduled
 * fire-and-forget via a tracked timeout (KD4).
 */

import log from 'electron-log';
import type { FeatureContext } from '../utils/lifecycle/featureConfigTypes.js';
import { createTrackedTimeout } from '../utils/lifecycle/resourceCleanup.js';
import { checkAndRequestMediaAccess } from '../utils/security/mediaAccess.js';

const TCC_TIMEOUT_NAME = 'media-permissions-tcc';

async function runMediaPermissionChecks(): Promise<void> {
  try {
    const cameraGranted = await checkAndRequestMediaAccess('camera');
    if (!cameraGranted) {
      log.warn('[MediaPermissions] Camera permission denied or restricted');
    }

    const micGranted = await checkAndRequestMediaAccess('microphone');
    if (!micGranted) {
      log.warn('[MediaPermissions] Microphone permission denied or restricted');
    }
  } catch (error: unknown) {
    log.error('[MediaPermissions] Failed to check media permissions:', error);
  }
}

/**
 * Security-phase init: schedule TCC work and return immediately (do not await).
 */
export default async (_context: FeatureContext): Promise<void> => {
  await Promise.resolve();
  if (process.platform !== 'darwin') {
    log.debug('[MediaPermissions] Skipping permission checks on non-darwin platform');
    return;
  }

  createTrackedTimeout(
    () => {
      void runMediaPermissionChecks();
    },
    0,
    TCC_TIMEOUT_NAME
  );
  log.debug('[MediaPermissions] Scheduled fire-and-forget TCC checks');
};

/**
 * Cleanup function for media permissions feature
 */
export function cleanupMediaPermissions(): void {
  log.debug('[MediaPermissions] Cleanup (no-op)');
}
