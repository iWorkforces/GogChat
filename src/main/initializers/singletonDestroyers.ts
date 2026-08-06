/**
 * Singleton Destroyers
 *
 * Aggregates the destroy functions for singleton instances that need cleanup
 * during graceful shutdown. Centralized here so `registerShutdown.ts` keeps a
 * minimal import surface.
 *
 * About/Update windows are loaded only via deferred features (async chunks).
 * Destroy them with dynamic import so the large aurora HTML/CSS never lands in
 * the main entry bundle (mainBundleSize budget).
 */

import { destroyIconCache } from '../utils/platform/iconCache.js';
import { destroyRateLimiter } from '../utils/ipc/rateLimiter.js';
import { destroyDeduplicator } from '../utils/ipc/ipcDeduplicator.js';
import { destroyPerformanceMonitor } from '../utils/lifecycle/performanceMonitor.js';

/**
 * Destroy all tracked singleton instances.
 *
 * Order:
 *   about/update dialogs (lazy) → performanceMonitor → deduplicator → rateLimiter → iconCache.
 *
 * Errors are NOT caught here — callers are responsible for wrapping in
 * try/catch so the broader shutdown sequence can continue.
 */
export async function destroyAllSingletons(): Promise<void> {
  // Dynamic imports keep About/Update + aurora out of lib/main/index.js.
  const [{ destroyAboutWindow }, { destroyUpdateWindow }] = await Promise.all([
    import('../features/aboutPanel.js'),
    import('../utils/platform/updateWindow.js'),
  ]);
  destroyAboutWindow();
  destroyUpdateWindow();
  destroyPerformanceMonitor();
  destroyDeduplicator();
  destroyRateLimiter();
  destroyIconCache();
}
