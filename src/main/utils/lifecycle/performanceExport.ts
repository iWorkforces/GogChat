/**
 * Performance Export Helpers
 *
 * File I/O and formatted summary logging helpers for {@link PerformanceMonitor}.
 * Split from `performanceMonitor.ts` to keep the core monitor focused on state
 * management while isolating side-effectful export/logging concerns here.
 */

import log from 'electron-log';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import type {
  CaptureCompleteness,
  PerformanceMetrics,
  PerformanceMonitorReader,
} from './performanceTypes.js';
import {
  PERFORMANCE_TARGETS,
  PERF_EXPORT_SCHEMA_VERSION,
  PERF_METRIC_UNITS,
  REQUIRED_STARTUP_MARKERS,
} from './performanceTypes.js';

/**
 * Options controlling capture completeness metadata on export.
 */
export interface ExportCaptureOptions {
  /** When true, marks the capture as having finished the final export path. */
  complete?: boolean;
  /** Override reason when the run is incomplete or invalid. */
  reason?: string;
  /**
   * When false, forces `capture.valid` to false even if markers/samples look
   * present (e.g. load failure / timeout). Defaults to true when omitted.
   */
  forceInvalid?: boolean;
}

/**
 * Compute capture completeness for a metrics snapshot.
 * Memory values are treated as MB; renderer evidence requires at least one
 * renderer-type snapshot.
 */
export function computeCaptureCompleteness(
  markers: Record<string, number>,
  rendererSnapshots: ReadonlyArray<{ type?: string }>,
  options: ExportCaptureOptions = {}
): CaptureCompleteness {
  const missingMarkers = REQUIRED_STARTUP_MARKERS.filter(
    (name) => typeof markers[name] !== 'number'
  );
  const rendererSampleCount = rendererSnapshots.filter((s) => s?.type === 'renderer').length;
  const markersOk = missingMarkers.length === 0;
  const samplesOk = rendererSampleCount > 0;
  const complete = options.complete === true;
  const forceInvalid = options.forceInvalid === true;
  const valid = complete && markersOk && samplesOk && !forceInvalid;

  let reason = options.reason;
  if (!reason) {
    if (forceInvalid) {
      reason = 'capture marked invalid';
    } else if (!complete) {
      reason = 'export before capture producers finished';
    } else if (!markersOk) {
      reason = `missing required markers: ${missingMarkers.join(', ')}`;
    } else if (!samplesOk) {
      reason = 'no renderer samples';
    }
  }

  const capture: CaptureCompleteness = {
    complete,
    valid,
    requiredMarkers: [...REQUIRED_STARTUP_MARKERS],
    missingMarkers: [...missingMarkers],
    rendererSampleCount,
  };
  if (reason !== undefined) {
    capture.reason = reason;
  }
  return capture;
}

/**
 * Export monitor metrics to JSON, optionally writing to disk.
 *
 * Builds a versioned `PerformanceMetrics` snapshot with explicit units and
 * capture completeness. If `outputPath` is provided, the JSON is written
 * (creating any missing parent directories). Write errors are logged but never
 * thrown, preserving the original behavior of the class method.
 *
 * @param monitor - PerformanceMonitor instance to read state from
 * @param outputPath - Optional file path to write JSON
 * @param captureOptions - Completeness metadata for the final export path
 * @returns Performance metrics object
 */
export function exportPerformanceMetrics(
  monitor: PerformanceMonitorReader,
  outputPath?: string,
  captureOptions: ExportCaptureOptions = {}
): PerformanceMetrics {
  const ipcLatencySamples = monitor.getIpcLatencySamples();
  const memoryLatencySamples = monitor.getMemoryLatencySamples();
  const markers = monitor.getMetrics();
  const rendererSnapshots = monitor.getRendererSnapshots();
  const capture = computeCaptureCompleteness(markers, rendererSnapshots, captureOptions);

  const metrics: PerformanceMetrics = {
    schemaVersion: PERF_EXPORT_SCHEMA_VERSION,
    units: { memory: PERF_METRIC_UNITS.memory, time: PERF_METRIC_UNITS.time },
    capture,
    startupTime: monitor.getTotalElapsed(),
    markers,
    memorySnapshots: monitor.getMemorySnapshotList(),
    rendererSnapshots,
    targetMet: monitor.isTargetMet(),
    warnings: monitor.getWarningsList(),
    timestamp: new Date().toISOString(),
    appVersion: app.getVersion(),
  };
  // Only include latency arrays when present — keeps export shape
  // backward compatible with consumers that don't expect these fields.
  if (ipcLatencySamples.length > 0) {
    metrics.ipcLatencySamples = ipcLatencySamples;
  }
  if (memoryLatencySamples.length > 0) {
    metrics.memoryLatencySamples = memoryLatencySamples;
  }

  if (outputPath) {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
      log.info(
        `[Performance] Metrics exported to: ${outputPath}` +
          ` (complete=${capture.complete}, valid=${capture.valid})`
      );
    } catch (error: unknown) {
      log.error('[Performance] Failed to export metrics:', error);
    }
  }

  return metrics;
}

/**
 * Log a formatted summary of monitor state (markers, memory, warnings).
 *
 * Short-circuits when the monitor is disabled, matching the original
 * class-method behavior. Output format is preserved verbatim.
 *
 * @param monitor - PerformanceMonitor instance to summarize
 */
export function logPerformanceSummary(monitor: PerformanceMonitorReader): void {
  if (!monitor.isEnabled()) return;

  const totalTime = monitor.getTotalElapsed();
  const targetMet = monitor.isTargetMet();
  const memStats = monitor.getMemoryStats();
  const markers = monitor.getMetrics();
  const warnings = monitor.getWarningsList();

  log.info('[Performance] ========== Performance Summary ==========');
  log.info(`[Performance] Total startup time: ${totalTime}ms`);

  // Target validation
  if (targetMet) {
    log.info(
      `[Performance] ✅ Target met: ${totalTime}ms < ${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms`
    );
  } else {
    log.error(
      `[Performance] ❌ Target MISSED: ${totalTime}ms >= ${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms`
    );
  }

  // Markers timeline
  log.info('[Performance] --- Timing Markers ---');
  const sortedMarkers = Object.entries(markers).sort((a, b) => a[1] - b[1]);
  sortedMarkers.forEach(([name, time]) => {
    log.info(`[Performance]   ${name}: ${time}ms`);
  });

  // Memory statistics
  if (memStats) {
    log.info('[Performance] --- Memory Statistics ---');
    log.info(
      `[Performance]   Initial: ${memStats.initial.heapUsed}MB heap, ${memStats.initial.rss}MB RSS`
    );
    log.info(
      `[Performance]   Current: ${memStats.current.heapUsed}MB heap, ${memStats.current.rss}MB RSS`
    );
    log.info(`[Performance]   Peak: ${memStats.peak.heapUsed}MB heap, ${memStats.peak.rss}MB RSS`);
    log.info(
      `[Performance]   Growth: ${(memStats.current.heapUsed - memStats.initial.heapUsed).toFixed(2)}MB`
    );
  }

  // Warnings
  if (warnings.length > 0) {
    log.info('[Performance] --- Warnings ---');
    warnings.forEach((warning) => {
      log.warn(`[Performance]   ${warning}`);
    });
  }

  log.info('[Performance] =======================================');
}
