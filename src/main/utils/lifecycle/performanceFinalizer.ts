/**
 * One-shot startup performance finalization.
 *
 * Owns development metrics export so it runs exactly once after:
 *   1. Deferred phase marks (including `all-features-loaded`) are present, and
 *   2. Account-0 document load emits `account-0-content-loaded` (or fails), and
 *   3. An immediate renderer sample has been taken.
 *
 * A load failure or capture timeout exports an invalid (not complete) artifact.
 * Early export from deferred phase alone is intentionally not performed here.
 */

import { app } from 'electron';
import log from 'electron-log';
import path from 'path';

import type { IAccountWindowManager } from '../../../shared/types/window.js';
import { createTrackedTimeout } from './resourceCleanup.js';
import { getPerformanceMonitor } from './performanceMonitor.js';

export interface ArmPerformanceFinalizerOptions {
  /** Optional account manager for PID → account mapping during the final sample. */
  getAccountManager?: () => IAccountWindowManager | undefined;
  /**
   * Capture timeout in ms. Defaults to `GOGCHAT_AUTO_QUIT_AFTER_MS` when set,
   * otherwise 12s. On timeout the export is invalid, not complete.
   */
  timeoutMs?: number;
  /** Override metrics output path (defaults to userData/performance-metrics.json). */
  outputPath?: string;
}

interface FinalizerState {
  armed: boolean;
  deferredReady: boolean;
  contentReady: boolean;
  contentFailed: boolean;
  failReason?: string;
  exported: boolean;
  getAccountManager?: () => IAccountWindowManager | undefined;
  outputPath?: string;
  timeoutHandle: NodeJS.Timeout | null;
}

const state: FinalizerState = {
  armed: false,
  deferredReady: false,
  contentReady: false,
  contentFailed: false,
  exported: false,
  timeoutHandle: null,
};

function defaultTimeoutMs(): number {
  const fromEnv = Number(process.env['GOGCHAT_AUTO_QUIT_AFTER_MS']);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 12_000;
}

function resolveOutputPath(override?: string): string {
  if (override) return override;
  return path.join(app.getPath('userData'), 'performance-metrics.json');
}

function shouldExport(): boolean {
  // Export when metrics are requested (CI/dev harness) or in development.
  // Packaged production does not write startup metrics by default.
  if (process.env['GOGCHAT_EXPORT_METRICS'] === '1') return true;
  if (process.env['NODE_ENV'] === 'development') return true;
  return false;
}

function tryFinalize(reasonIfForced?: string): void {
  if (state.exported) return;
  if (!state.armed) return;

  const forcedFail = state.contentFailed || reasonIfForced !== undefined;
  const ready = state.deferredReady && state.contentReady;

  if (!ready && !forcedFail) {
    return;
  }

  state.exported = true;
  if (state.timeoutHandle) {
    clearTimeout(state.timeoutHandle);
    state.timeoutHandle = null;
  }

  if (!shouldExport()) {
    log.debug('[Performance] Finalizer skipped export (not in export mode)');
    return;
  }

  const monitor = getPerformanceMonitor();
  const accountManager = state.getAccountManager?.();
  // Immediate renderer sample before export so empty renderer evidence cannot
  // be presented as a measured-zero run. Use getPerformanceMonitor() so tests
  // that destroy/recreate the singleton still hit the live instance.
  try {
    monitor.sampleAllRenderers(accountManager);
  } catch (error: unknown) {
    log.warn('[Performance] Final renderer sample failed:', error);
  }

  const outputPath = resolveOutputPath(state.outputPath);
  const failReason =
    reasonIfForced ??
    state.failReason ??
    (forcedFail ? 'document load failed or timed out' : undefined);

  const complete = ready && !forcedFail;
  monitor.exportToJSON(outputPath, {
    complete,
    forceInvalid: !complete,
    ...(failReason !== undefined ? { reason: failReason } : {}),
  });

  log.info(
    `[Performance] Final export written (complete=${complete}, path=${outputPath}` +
      `${failReason ? `, reason=${failReason}` : ''})`
  );
}

/**
 * Arm the one-shot finalizer. Safe to call once per process lifetime.
 * Arms a capture timeout that exports an invalid run if producers never finish.
 */
export function armPerformanceFinalizer(options: ArmPerformanceFinalizerOptions = {}): void {
  if (state.armed) {
    // Allow updating account manager / output path if re-armed after tests reset.
    if (options.getAccountManager) state.getAccountManager = options.getAccountManager;
    if (options.outputPath) state.outputPath = options.outputPath;
    return;
  }

  state.armed = true;
  state.deferredReady = false;
  state.contentReady = false;
  state.contentFailed = false;
  delete state.failReason;
  state.exported = false;
  if (options.getAccountManager) state.getAccountManager = options.getAccountManager;
  if (options.outputPath) state.outputPath = options.outputPath;

  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs();
  state.timeoutHandle = createTrackedTimeout(
    () => {
      state.timeoutHandle = null;
      if (!state.exported) {
        tryFinalize('capture timeout waiting for document load / deferred phase');
      }
    },
    timeoutMs,
    'perf-export-capture-timeout'
  );

  log.debug(`[Performance] Finalizer armed (timeout=${timeoutMs}ms)`);
}

/** Signal that deferred phase (including `all-features-loaded`) has finished. */
export function notifyDeferredPhaseComplete(): void {
  state.deferredReady = true;
  tryFinalize();
}

/** Signal that account-0 document load completed (`account-0-content-loaded`). */
export function notifyDocumentLoadComplete(): void {
  state.contentReady = true;
  tryFinalize();
}

/** Signal document load failure; exports an invalid capture when deferred is ready or on timeout. */
export function notifyDocumentLoadFailed(reason: string): void {
  state.contentFailed = true;
  state.failReason = reason;
  // Export immediately as invalid so harnesses do not wait for timeout only.
  tryFinalize(reason);
}

/**
 * Reset finalizer state (tests only).
 * @internal
 */
export function resetPerformanceFinalizerForTests(): void {
  if (state.timeoutHandle) {
    clearTimeout(state.timeoutHandle);
  }
  state.armed = false;
  state.deferredReady = false;
  state.contentReady = false;
  state.contentFailed = false;
  delete state.failReason;
  state.exported = false;
  delete state.getAccountManager;
  delete state.outputPath;
  state.timeoutHandle = null;
}

/**
 * Whether a final export has already been written (tests / diagnostics).
 * @internal
 */
export function hasFinalizedPerformanceExport(): boolean {
  return state.exported;
}
