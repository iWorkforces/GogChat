/**
 * Shutdown Diagnostics
 *
 * Comprehensive cache statistics logging emitted during graceful shutdown.
 * Purely diagnostic — has no effect on shutdown behavior.
 */

import log from 'electron-log';
import { session } from 'electron';
import type Store from 'electron-store';
import { getSummary as getFeatureSummary } from '../utils/lifecycle/featureRunner.js';
import { getIconCache } from '../utils/platform/iconCache.js';
import { getStore } from '../config.js';
import type { CachedStore } from '../utils/config/configCache.js';
import { getRateLimiter } from '../utils/ipc/rateLimiter.js';
import { getDeduplicator } from '../utils/ipc/ipcDeduplicator.js';
import { toPartition, type AccountIndex } from '../../shared/types/branded.js';
import type { StoreType } from '../../shared/types/config.js';
import { asType } from '../../shared/typeUtils.js';

export type ShutdownDiagnosticsOptions = {
  /** Snapshot taken before {@link destroyAccountWindowManager}. Never recreate the manager. */
  accountIndices?: readonly AccountIndex[];
};

/**
 * Type guard to check if a store has cache enabled
 */
function isCachedStore(store: Store<StoreType>): store is CachedStore<StoreType> {
  return typeof asType<CachedStore<StoreType>>(store).getCacheStats === 'function';
}

/**
 * Log comprehensive cache statistics on app quit.
 * Provides visibility into cache performance for optimization.
 */
export async function logShutdownDiagnostics(
  options: ShutdownDiagnosticsOptions = {}
): Promise<void> {
  try {
    // Icon Cache Statistics
    const iconCache = getIconCache();
    const iconStats = iconCache.getStats();

    log.info('[Main] --- Icon Cache Statistics ---');
    log.info(`[Main]   Total icons cached: ${iconStats.size}/${iconStats.maxSize}`);
    log.info(`[Main]   Total accesses: ${iconStats.totalAccesses}`);
    log.info(`[Main]   Most accessed: ${iconStats.mostAccessed || 'N/A'}`);
    log.info(`[Main]   Least accessed: ${iconStats.leastAccessed || 'N/A'}`);
    log.info(
      `[Main]   Average accesses per icon: ${iconStats.size > 0 ? (iconStats.totalAccesses / iconStats.size).toFixed(2) : '0'}`
    );

    // Config Cache Statistics
    try {
      const storeInstance = getStore();
      if (isCachedStore(storeInstance)) {
        const configStats = storeInstance.getCacheStats();
        const hitRate = parseFloat(configStats.hitRate.replace('%', ''));

        log.info('[Main] --- Config Cache Statistics ---');
        log.info(`[Main]   Cache hits: ${configStats.hits}`);
        log.info(`[Main]   Cache misses: ${configStats.misses}`);
        log.info(`[Main]   Cache writes: ${configStats.writes}`);
        log.info(`[Main]   Hit rate: ${configStats.hitRate}`);
        log.info(
          `[Main]   Performance: ${hitRate > 80 ? 'Excellent' : hitRate > 60 ? 'Good' : 'Poor'}`
        );
      }
    } catch {
      log.debug('[Main] Store not initialized or cache disabled');
    }

    // IPC Deduplicator Statistics
    try {
      const deduplicator = getDeduplicator();
      const dedupStats = deduplicator.getStats();

      log.info('[Main] --- IPC Deduplicator Statistics ---');
      log.info(`[Main]   Cache hits (deduplicated): ${dedupStats.cacheHits}`);
      log.info(`[Main]   Cache misses (executed): ${dedupStats.cacheMisses}`);
      log.info(`[Main]   Total deduplicated: ${dedupStats.deduplicatedCount}`);
      log.info(
        `[Main]   Deduplication rate: ${dedupStats.cacheHits + dedupStats.cacheMisses > 0 ? ((dedupStats.cacheHits / (dedupStats.cacheHits + dedupStats.cacheMisses)) * 100).toFixed(1) : '0'}%`
      );
    } catch (error: unknown) {
      log.debug('[Main] IPC deduplicator not available:', error);
    }

    // Rate Limiter Statistics
    try {
      const rateLimiter = getRateLimiter();
      const allStats = rateLimiter.getAllStats();
      let totalBlocked = 0;
      let totalMessages = 0;

      for (const [, stats] of allStats) {
        totalBlocked += stats.totalBlocked;
        totalMessages += stats.messagesLastSecond + stats.totalBlocked;
      }

      log.info('[Main] --- Rate Limiter Statistics ---');
      log.info(`[Main]   Active channels: ${allStats.size}`);
      log.info(`[Main]   Total blocked: ${totalBlocked}`);
      log.info(`[Main]   Total messages: ${totalMessages}`);
      log.info(
        `[Main]   Block rate: ${totalMessages > 0 ? ((totalBlocked / totalMessages) * 100).toFixed(1) : '0'}%`
      );
    } catch (error: unknown) {
      log.debug('[Main] Rate limiter not available:', error);
    }

    // Feature Manager Statistics
    const summary = getFeatureSummary();
    log.info('[Main] --- Feature Runner Statistics ---');
    log.info(`[Main]   Total features: ${summary.total}`);
    log.info(`[Main]   Initialized: ${summary.initialized}`);
    log.info(
      `[Main]   By phase: security=${summary.byPhase.security}, critical=${summary.byPhase.critical}, ui=${summary.byPhase.ui}, deferred=${summary.byPhase.deferred}`
    );

    // Per-account disk cache sizes (diagnostics only). Indices are snapshotted
    // before destroy — do not call getAccountWindowManager() here.
    const accountIndices = options.accountIndices ?? [];
    if (accountIndices.length > 0) {
      log.info('[Main] --- Account Disk Cache Sizes ---');
      for (const accountIndex of accountIndices) {
        const partition = toPartition(accountIndex);
        try {
          const sesh = session.fromPartition(partition);
          const sizeBytes = await sesh.getCacheSize();
          log.info(
            `[Main]   Account ${accountIndex} (${partition}) disk cache: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`
          );
        } catch (err: unknown) {
          log.debug(`[Main]   Account ${accountIndex} cache size unavailable:`, err);
        }
      }
    }
  } catch (error: unknown) {
    log.error('[Main] Failed to log comprehensive cache statistics:', error);
  }
}
