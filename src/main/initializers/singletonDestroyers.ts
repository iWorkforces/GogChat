/**
 * Singleton Destroyers
 *
 * Aggregates the destroy functions for singleton instances that need cleanup
 * during graceful shutdown. Centralized here so `registerShutdown.ts` keeps a
 * minimal import surface.
 */

import { destroyIconCache } from '../utils/platform/iconCache.js';
import { destroyRateLimiter } from '../utils/ipc/rateLimiter.js';
import { destroyDeduplicator } from '../utils/ipc/ipcDeduplicator.js';
import { destroyPerformanceMonitor } from '../utils/lifecycle/performanceMonitor.js';
import { destroyUpdateWindow } from '../utils/platform/updateWindow.js';
import { destroyAboutWindow } from '../features/aboutPanel.js';

/**
 * Destroy all tracked singleton instances.
 *
 * Order matches the original shutdown sequence:
 *   about/update dialogs → performanceMonitor → deduplicator → rateLimiter → iconCache.
 *
 * Errors are NOT caught here — callers are responsible for wrapping in
 * try/catch so the broader shutdown sequence can continue.
 */
export function destroyAllSingletons(): void {
  destroyAboutWindow();
  destroyUpdateWindow();
  destroyPerformanceMonitor();
  destroyDeduplicator();
  destroyRateLimiter();
  destroyIconCache();
}
