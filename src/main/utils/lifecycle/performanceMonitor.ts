/**
 * Performance Monitor
 * Tracks startup performance metrics and provides timing information
 * Helps measure the impact of optimizations
 *
 * Features:
 * - Timing markers for key lifecycle events
 * - Memory usage tracking
 * - <3s startup target validation
 * - JSON export for CI/CD integration (see ./performanceExport.ts)
 * - Module loading time tracking
 */

import { app } from 'electron';
import log from 'electron-log';

import environment from '../../../environment.js';

import {
  exportPerformanceMetrics,
  logPerformanceSummary,
  type ExportCaptureOptions,
} from './performanceExport.js';
import { PERFORMANCE_TARGETS } from './performanceTypes.js';
import type {
  IPCLatencySample,
  MemoryLatencySample,
  MemorySnapshot,
  PerformanceMetrics,
  RendererMemorySnapshot,
} from './performanceTypes.js';
import type { IAccountWindowManager } from '../../../shared/types/window.js';

/**
 * Performance metrics tracker
 */
class PerformanceMonitor {
  private startTime: number;
  private markers: Map<string, number> = new Map();
  private memorySnapshots: MemorySnapshot[] = [];
  private rendererSnapshots: RendererMemorySnapshot[] = [];
  private ipcLatencySamples: IPCLatencySample[] = [];
  private memoryLatencySamples: MemoryLatencySample[] = [];
  private warnings: string[] = [];
  private readonly MAX_SNAPSHOTS = 100;
  // 60s sampling interval → ~1000 snapshots covers ~17 hours of runtime
  private readonly MAX_RENDERER_SNAPSHOTS = 1000;
  // IPC latency: high-frequency channels can flood; cap with FIFO eviction.
  private readonly MAX_IPC_LATENCY_SAMPLES = 1000;
  // Memory ops are infrequent; a smaller cap is sufficient.
  private readonly MAX_MEMORY_LATENCY_SAMPLES = 500;
  private readonly MAX_WARNINGS = 50;
  private enabled: boolean = true;
  private readonly isDev: boolean;

  constructor() {
    this.isDev = environment.isDev;
    this.startTime = Date.now();
    this.captureMemorySnapshot('startup');
    if (this.isDev) log.debug('[Performance] Performance monitoring started');
  }

  /**
   * Capture memory snapshot at current point in time
   * @param label - Label for this snapshot
   */
  private captureMemorySnapshot(label: string): void {
    if (!this.enabled) return;

    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now() - this.startTime,
      heapUsed: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100, // MB
      heapTotal: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
      rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
    };

    if (this.memorySnapshots.length >= this.MAX_SNAPSHOTS) {
      this.memorySnapshots.shift();
    }
    this.memorySnapshots.push(snapshot);
    if (this.isDev) {
      log.debug(
        `[Performance] Memory snapshot [${label}]: ${snapshot.heapUsed}MB heap, ${snapshot.rss}MB RSS`
      );
    }
  }

  /**
   * Mark a point in time with a label
   * @param name - Marker name/label
   * @param logMessage - Optional custom message to log
   * @param captureMemory - Whether to capture memory snapshot at this marker
   */
  mark(name: string, logMessage?: string, captureMemory: boolean = false): void {
    if (!this.enabled) return;

    const elapsed = Date.now() - this.startTime;
    this.markers.set(name, elapsed);

    const message = logMessage || name;
    if (this.isDev) log.info(`[Performance] ${message}: ${elapsed}ms`);

    // Capture memory snapshot if requested
    if (captureMemory) {
      this.captureMemorySnapshot(name);
    }

    // Check against warning threshold
    if (
      elapsed > PERFORMANCE_TARGETS.WARNING_THRESHOLD_MS &&
      elapsed < PERFORMANCE_TARGETS.CRITICAL_THRESHOLD_MS
    ) {
      const warning = `Marker '${name}' at ${elapsed}ms approaching target threshold (${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms)`;
      if (this.warnings.length >= this.MAX_WARNINGS) {
        this.warnings.shift();
      }
      this.warnings.push(warning);
      log.warn(`[Performance] ${warning}`);
    } else if (elapsed > PERFORMANCE_TARGETS.CRITICAL_THRESHOLD_MS) {
      const warning = `Marker '${name}' at ${elapsed}ms EXCEEDS target threshold (${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms)`;
      if (this.warnings.length >= this.MAX_WARNINGS) {
        this.warnings.shift();
      }
      this.warnings.push(warning);
      log.error(`[Performance] ${warning}`);
    }
  }

  /**
   * Measure time between two markers
   * @param startMarker - Starting marker name
   * @param endMarker - Ending marker name
   * @returns Duration in milliseconds, or null if markers not found
   */
  measure(startMarker: string, endMarker: string): number | null {
    const startTime = this.markers.get(startMarker);
    const endTime = this.markers.get(endMarker);

    if (startTime === undefined || endTime === undefined) {
      log.warn(`[Performance] Cannot measure: marker(s) not found (${startMarker}, ${endMarker})`);
      return null;
    }

    const duration = endTime - startTime;
    if (this.isDev) log.info(`[Performance] ${startMarker} → ${endMarker}: ${duration}ms`);
    return duration;
  }

  /**
   * Get all recorded metrics
   * @returns Object with all markers and their timestamps
   */
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.markers);
  }

  /**
   * Get total elapsed time since monitor started
   * @returns Total elapsed time in milliseconds
   */
  getTotalElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if startup time target was met
   * @returns True if startup time is under target
   */
  isTargetMet(): boolean {
    const totalTime = this.getTotalElapsed();
    return totalTime < PERFORMANCE_TARGETS.STARTUP_TIME_MS;
  }

  /**
   * Get memory usage statistics
   * @returns Memory statistics object
   */
  getMemoryStats(): {
    initial: MemorySnapshot;
    current: MemorySnapshot;
    peak: MemorySnapshot;
  } | null {
    if (this.memorySnapshots.length === 0) return null;
    // Safe to use ! since we checked length > 0
    const current = this.memorySnapshots[this.memorySnapshots.length - 1]!;
    const initial = this.memorySnapshots[0]!;
    const peak = this.memorySnapshots.reduce(
      (max, snap) => (snap.heapUsed > max.heapUsed ? snap : max),
      initial
    );
    return { initial, current, peak };
  }

  /**
   * Internal accessor for the warnings list. Used by `performanceExport` helpers.
   * @internal
   */
  getWarningsList(): string[] {
    return this.warnings;
  }

  /**
   * Internal accessor for the memory-snapshot list. Used by `performanceExport` helpers.
   * @internal
   */
  getMemorySnapshotList(): MemorySnapshot[] {
    return this.memorySnapshots;
  }

  /**
   * Sample memory + CPU for every Electron process (renderer, GPU, utility)
   * via `app.getAppMetrics()`. Optionally correlates renderer PIDs with their
   * owning account index when an `accountWindowManager` is provided.
   *
   * Snapshots are appended to an internal ring buffer capped at
   * `MAX_RENDERER_SNAPSHOTS` (oldest entries are evicted FIFO).
   *
   * Visibility only. No process is killed or throttled here.
   *
   * @param accountWindowManager - Optional account manager used to map renderer
   *   PIDs to their owning account index.
   */
  sampleAllRenderers(accountWindowManager?: IAccountWindowManager): void {
    if (!this.enabled) return;

    // Map OS pid → account identity via backend-aware enumeration so WCV
    // child views are observed (host-only sampling would miss them).
    // Key includes creationTime when available later via ProcessMetric.
    const pidToAccount = new Map<
      number,
      {
        accountIndex: number;
        backend: 'browser-window' | 'web-contents-view';
        webContentsId: number;
      }
    >();
    if (accountWindowManager) {
      for (const info of accountWindowManager.enumerateAccountWebContents()) {
        if (info.osProcessId > 0) {
          pidToAccount.set(info.osProcessId, {
            accountIndex: info.accountIndex,
            backend: info.backend,
            webContentsId: info.webContentsId,
          });
        }
      }
    }

    const metrics = app.getAppMetrics();
    const timestamp = Date.now() - this.startTime;
    let rendererCount = 0;
    let sampled = 0;

    for (const m of metrics) {
      // Only track renderer ("Tab") / GPU / utility — ignore Browser (main) and helpers.
      if (m.type !== 'Tab' && m.type !== 'GPU' && m.type !== 'Utility') continue;

      const type: RendererMemorySnapshot['type'] =
        m.type === 'Tab' ? 'renderer' : m.type === 'GPU' ? 'gpu' : 'utility';
      if (type === 'renderer') rendererCount++;

      const privateBytes = m.memory.privateBytes;
      const privateAvailable = privateBytes !== undefined;
      const snapshot: RendererMemorySnapshot = {
        timestamp,
        pid: m.pid,
        type,
        memory: {
          // Electron's MemoryInfo values are in KB → convert to MB (2 decimals).
          residentSet: Math.round((m.memory.workingSetSize / 1024) * 100) / 100,
          peakResidentSet: Math.round((m.memory.peakWorkingSetSize / 1024) * 100) / 100,
          // Never represent unavailable private memory as measured zero.
          private: privateAvailable ? Math.round((privateBytes / 1024) * 100) / 100 : null,
          privateSource: privateAvailable ? 'measured' : 'unavailable',
        },
        cpuPercent: m.cpu.percentCPUUsage,
        creationTime: m.creationTime,
      };

      const accountInfo = pidToAccount.get(m.pid);
      if (accountInfo !== undefined) {
        snapshot.accountIndex = accountInfo.accountIndex;
        snapshot.backend = accountInfo.backend;
        snapshot.webContentsId = accountInfo.webContentsId;
      }

      if (this.rendererSnapshots.length >= this.MAX_RENDERER_SNAPSHOTS) {
        this.rendererSnapshots.shift();
      }
      this.rendererSnapshots.push(snapshot);
      sampled++;
    }

    if (this.isDev) {
      log.debug(
        `[Performance] Renderer memory sample: ${sampled} processes (${rendererCount} renderers)`
      );
    }
  }

  /**
   * Get the in-memory list of renderer snapshots collected by
   * {@link sampleAllRenderers}.
   */
  getRendererMemoryStats(): RendererMemorySnapshot[] {
    return this.rendererSnapshots;
  }

  /**
   * Internal accessor for the renderer-snapshot list. Used by
   * `performanceExport` helpers and satisfies
   * {@link PerformanceMonitorReader.getRendererSnapshots}.
   * @internal
   */
  getRendererSnapshots(): RendererMemorySnapshot[] {
    return this.rendererSnapshots;
  }

  /**
   * Record an IPC handler-latency sample. Optional Wave 0 primitive — callers
   * pass the channel name, measured duration in ms, and any per-call context.
   * No-op when monitoring is disabled. Buffer is FIFO-capped at
   * `MAX_IPC_LATENCY_SAMPLES` to keep memory bounded on hot channels.
   */
  recordIpcLatency(
    channel: string,
    durationMs: number,
    options: { accountIndex?: number; kind?: IPCLatencySample['kind'] } = {}
  ): void {
    if (!this.enabled) return;
    const sample: IPCLatencySample = {
      timestamp: Date.now() - this.startTime,
      channel,
      durationMs,
    };
    if (options.accountIndex !== undefined) sample.accountIndex = options.accountIndex;
    if (options.kind !== undefined) sample.kind = options.kind;
    if (this.ipcLatencySamples.length >= this.MAX_IPC_LATENCY_SAMPLES) {
      this.ipcLatencySamples.shift();
    }
    this.ipcLatencySamples.push(sample);
  }

  /**
   * Record a memory-operation latency sample (e.g. `clearCodeCaches`,
   * `dehydrateAccount`). No-op when monitoring is disabled. Buffer is
   * FIFO-capped at `MAX_MEMORY_LATENCY_SAMPLES`.
   */
  recordMemoryLatency(
    operation: string,
    durationMs: number,
    options: { accountIndex?: number } = {}
  ): void {
    if (!this.enabled) return;
    const sample: MemoryLatencySample = {
      timestamp: Date.now() - this.startTime,
      operation,
      durationMs,
    };
    if (options.accountIndex !== undefined) sample.accountIndex = options.accountIndex;
    if (this.memoryLatencySamples.length >= this.MAX_MEMORY_LATENCY_SAMPLES) {
      this.memoryLatencySamples.shift();
    }
    this.memoryLatencySamples.push(sample);
  }

  /**
   * Internal accessor for the IPC latency samples list. Used by
   * `performanceExport` helpers and satisfies
   * {@link PerformanceMonitorReader.getIpcLatencySamples}.
   * @internal
   */
  getIpcLatencySamples(): IPCLatencySample[] {
    return this.ipcLatencySamples;
  }

  /**
   * Internal accessor for the memory latency samples list. Used by
   * `performanceExport` helpers and satisfies
   * {@link PerformanceMonitorReader.getMemoryLatencySamples}.
   * @internal
   */
  getMemoryLatencySamples(): MemoryLatencySample[] {
    return this.memoryLatencySamples;
  }

  /**
   * Internal accessor for the enabled flag. Used by `performanceExport` helpers.
   * @internal
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Export metrics to JSON format with schema version, units, and capture completeness.
   * @param outputPath - Optional file path to write JSON
   * @param captureOptions - Completeness metadata (final export path sets complete=true)
   * @returns Performance metrics object
   */
  exportToJSON(outputPath?: string, captureOptions?: ExportCaptureOptions): PerformanceMetrics {
    return exportPerformanceMetrics(this, outputPath, captureOptions);
  }

  /**
   * Log summary of all metrics
   */
  logSummary(): void {
    logPerformanceSummary(this);
  }

  /**
   * Enable or disable performance monitoring
   * @param enabled - Whether to enable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.isDev) log.debug(`[Performance] Monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Reset all markers and start time
   */
  reset(): void {
    this.markers.clear();
    this.memorySnapshots = [];
    this.rendererSnapshots = [];
    this.ipcLatencySamples = [];
    this.memoryLatencySamples = [];
    this.warnings = [];
    this.startTime = Date.now();
    this.captureMemorySnapshot('reset');
    if (this.isDev) log.debug('[Performance] Monitor reset');
  }
}

export { PerformanceMonitor };

// Create singleton instance
let instance: PerformanceMonitor | null = null;

/**
 * Get the singleton performance monitor instance
 * @returns PerformanceMonitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

/**
 * Destroy the performance monitor singleton
 */
export function destroyPerformanceMonitor(): void {
  if (instance) {
    instance.reset();
    instance = null;
    if (environment.isDev) log.debug('[Performance] Destroyed performance monitor');
  }
}

// Export convenience singleton for easy access
export const perfMonitor = getPerformanceMonitor();
