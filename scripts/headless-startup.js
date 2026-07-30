#!/usr/bin/env node

/**
 * Headless GogChat startup harness for CI perf gating (PI1).
 *
 * Launches the built Electron app with:
 *   - GOGCHAT_EXPORT_METRICS=1        (signals intent — informational)
 *   - GOGCHAT_AUTO_QUIT_AFTER_MS=12000 (capture timeout + max lifetime)
 *   - NODE_ENV=development             (dev path; final export is owned by
 *                                        performanceFinalizer after document load)
 *   - --user-data-dir=<temp>           (controls where performance-metrics.json lands)
 *
 * Polls the temp userData dir for `performance-metrics.json`. Once it appears
 * AND is stable for one tick, validates the versioned schema, then writes the
 * aggregate (or single run) to `./performance-metrics.json` in the repo root.
 *
 * Exit codes:
 *   0 — every requested run produced a complete+valid artifact; aggregate written
 *   1 — crash, timeout, schema invalid, incomplete run, or partial success
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const TIMEOUT_MS = Number(process.env.HEADLESS_TIMEOUT_MS || 60_000);
const AUTO_QUIT_MS = Number(process.env.GOGCHAT_AUTO_QUIT_AFTER_MS || 12_000);
const POLL_INTERVAL_MS = 250;

// N-run median support. Defaults to 1 (existing single-run behavior preserved).
// Set GOGCHAT_PERF_RUNS=5 (etc.) for CI-style median aggregation.
const PERF_RUNS = Math.max(1, Number(process.env.GOGCHAT_PERF_RUNS || 1) | 0);
// Optional: forward GOGCHAT_DISABLE_PRECONNECT to the child Electron so the harness
// can A/B-measure preconnect contribution. Read here only for logging.
const PRECONNECT_DISABLED = process.env.GOGCHAT_DISABLE_PRECONNECT === '1';

/** Must match PERF_EXPORT_SCHEMA_VERSION in performanceTypes.ts */
export const PERF_EXPORT_SCHEMA_VERSION = 1;

/** Must match REQUIRED_STARTUP_MARKERS in performanceTypes.ts */
export const REQUIRED_STARTUP_MARKERS = [
  'app-start',
  'app-ready',
  'account-0-ready',
  'account-0-content-loaded',
  'features-loaded',
  'all-features-loaded',
];

const outputPath = path.resolve(repoRoot, 'performance-metrics.json');

function log(msg) {
  process.stdout.write(`[headless-startup] ${msg}\n`);
}

export function resolveElectronBinary(root = repoRoot) {
  // Prefer the unpacked macOS app bundle directly, but only when its framework
  // is present. dyld needs `Electron Framework.framework/Electron Framework`
  // alongside the launcher; an installer that placed only the executable will
  // crash with `Library not loaded: @rpath/Electron Framework.framework/...`.
  const macAppRoot = path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app');
  const directExecutable = path.join(macAppRoot, 'Contents', 'MacOS', 'Electron');
  const frameworkBinary = path.join(
    macAppRoot,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Electron Framework'
  );
  // `existsSync` follows symlinks, so a symlink into `Versions/A/...` resolves.
  if (fs.existsSync(directExecutable) && fs.existsSync(frameworkBinary)) {
    return directExecutable;
  }

  const wrapperPaths = [
    path.join(root, 'node_modules', '.bin', 'electron'),
    path.join(root, 'node_modules', '.bin', 'electron.cmd'),
  ];
  for (const p of wrapperPaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'electron';
}

/**
 * Validate a single-run performance artifact against the versioned schema.
 * Incomplete or invalid runs must not feed median aggregation.
 *
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export function validateRunArtifact(metrics) {
  const reasons = [];
  if (!metrics || typeof metrics !== 'object') {
    return { valid: false, reasons: ['metrics is not an object'] };
  }
  if (metrics.schemaVersion !== PERF_EXPORT_SCHEMA_VERSION) {
    reasons.push(
      `schemaVersion mismatch: expected ${PERF_EXPORT_SCHEMA_VERSION}, got ${metrics.schemaVersion}`
    );
  }
  if (metrics.units?.memory !== 'MB') {
    reasons.push(`units.memory must be "MB", got ${metrics.units?.memory}`);
  }
  if (metrics.units?.time !== 'ms') {
    reasons.push(`units.time must be "ms", got ${metrics.units?.time}`);
  }
  if (!metrics.capture || typeof metrics.capture !== 'object') {
    reasons.push('capture completeness metadata missing');
  } else {
    if (metrics.capture.complete !== true) {
      reasons.push(`capture.complete is not true (${metrics.capture.complete})`);
    }
    if (metrics.capture.valid !== true) {
      reasons.push(
        `capture.valid is not true (${metrics.capture.valid}` +
          `${metrics.capture.reason ? `: ${metrics.capture.reason}` : ''})`
      );
    }
    if (
      typeof metrics.capture.rendererSampleCount !== 'number' ||
      metrics.capture.rendererSampleCount < 1
    ) {
      reasons.push(`rendererSampleCount must be >= 1, got ${metrics.capture.rendererSampleCount}`);
    }
  }
  const markers = metrics.markers && typeof metrics.markers === 'object' ? metrics.markers : {};
  for (const name of REQUIRED_STARTUP_MARKERS) {
    if (typeof markers[name] !== 'number') {
      reasons.push(`missing required marker: ${name}`);
    }
  }
  const rendererSnaps = Array.isArray(metrics.rendererSnapshots) ? metrics.rendererSnapshots : [];
  const rendererCount = rendererSnaps.filter((s) => s?.type === 'renderer').length;
  if (rendererCount < 1) {
    reasons.push('no renderer-type samples in rendererSnapshots');
  }
  return { valid: reasons.length === 0, reasons };
}

/**
 * Run a single Electron startup, capture performance-metrics.json from a fresh
 * temp userData dir, and return `{ metrics, valid, reasons }` on parse success.
 *
 * Does NOT touch the repo-root `performance-metrics.json`.
 * Returns `{ metrics: null, valid: false, reasons }` on timeout / crash / bad JSON.
 */
async function runOnce(runIndex, totalRuns) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-perf-'));
  const metricsPathInUserData = path.join(userDataDir, 'performance-metrics.json');

  const electron = resolveElectronBinary();
  const args = ['.', `--user-data-dir=${userDataDir}`];

  log(`Run ${runIndex}/${totalRuns}: Spawning Electron: ${electron} ${args.join(' ')}`);
  log(`Run ${runIndex}/${totalRuns}: User data dir: ${userDataDir}`);
  log(`Run ${runIndex}/${totalRuns}: Watching for: ${metricsPathInUserData}`);

  const child = spawn(electron, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      GOGCHAT_EXPORT_METRICS: '1',
      GOGCHAT_AUTO_QUIT_AFTER_MS: String(AUTO_QUIT_MS),
      // Forward the preconnect kill switch verbatim (default unset = enabled).
      GOGCHAT_DISABLE_PRECONNECT: process.env.GOGCHAT_DISABLE_PRECONNECT || '',
      // Headless hints (most of these are no-ops on macOS but harmless)
      ELECTRON_DISABLE_SANDBOX: process.env.ELECTRON_DISABLE_SANDBOX || '',
      CI: process.env.CI || '1',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  let resolved = false;
  let timedOut = false;
  let lastChildExit = null;

  child.on('exit', (code, signal) => {
    lastChildExit = { code, signal };
    log(`Run ${runIndex}/${totalRuns}: Electron exited (code=${code}, signal=${signal})`);
  });

  // Hard timeout
  const overallTimer = setTimeout(() => {
    timedOut = true;
    log(`Run ${runIndex}/${totalRuns}: Overall timeout (${TIMEOUT_MS}ms) — killing Electron.`);
    safeKill(child);
  }, TIMEOUT_MS);

  const stableNeeded = 2; // poll-cycles file size must be stable

  let stableCount = 0;
  let lastSize = -1;

  while (!resolved && !timedOut && lastChildExit == null) {
    if (fs.existsSync(metricsPathInUserData)) {
      try {
        const { size } = fs.statSync(metricsPathInUserData);
        if (size > 0 && size === lastSize) {
          stableCount++;
        } else {
          stableCount = 0;
          lastSize = size;
        }
        if (stableCount >= stableNeeded) {
          resolved = true;
          break;
        }
      } catch {
        /* file may be mid-write; keep polling */
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }

  clearTimeout(overallTimer);

  let metricsObj = null;
  let validation = { valid: false, reasons: ['no metrics file'] };
  if (resolved) {
    try {
      const raw = fs.readFileSync(metricsPathInUserData, 'utf8');
      metricsObj = JSON.parse(raw);
      validation = validateRunArtifact(metricsObj);
      if (!validation.valid) {
        log(`Run ${runIndex}/${totalRuns}: INVALID artifact: ${validation.reasons.join('; ')}`);
      }
    } catch (err) {
      log(`Run ${runIndex}/${totalRuns}: ERROR reading metrics: ${err.message}`);
      validation = { valid: false, reasons: [`unreadable JSON: ${err.message}`] };
    }
  }

  // Always terminate the child if still alive.
  if (lastChildExit == null) {
    safeKill(child);
    await waitExit(child);
  }

  // Cleanup temp userData (best-effort)
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (!resolved) {
    if (timedOut) {
      log(`Run ${runIndex}/${totalRuns}: FAILURE: timed out waiting for performance-metrics.json`);
      validation = { valid: false, reasons: ['timeout waiting for metrics file'] };
    } else {
      log(
        `Run ${runIndex}/${totalRuns}: FAILURE: Electron exited before producing metrics (code=${lastChildExit?.code})`
      );
      validation = {
        valid: false,
        reasons: [`electron exited before metrics (code=${lastChildExit?.code})`],
      };
    }
  }

  return { metrics: metricsObj, valid: validation.valid, reasons: validation.reasons };
}

export function median(values) {
  const sorted = values
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Build a merged metrics object whose numeric markers + memorySnapshots fields
 * represent the per-key median across N complete+valid runs. Non-numeric fields
 * are taken from the last successful run.
 *
 * Refuses to assemble medians from incomplete data: every run in `runs` must
 * already have passed {@link validateRunArtifact}. The caller is responsible
 * for that gate; this function still stamps aggregate completeness metadata.
 */
export function mergeMedian(runs, options = {}) {
  const requestedRuns = options.requestedRuns ?? runs.length;
  const invalidRuns = options.invalidRuns ?? 0;

  if (runs.length === 0) return null;
  if (runs.length === 1) {
    const single = { ...runs[0] };
    single.aggregation = {
      strategy: 'single',
      runs: requestedRuns,
      successfulRuns: 1,
      invalidRuns,
      complete: invalidRuns === 0 && requestedRuns === 1,
    };
    return single;
  }

  const last = runs[runs.length - 1];

  // Median markers: union of marker keys, median of numeric values across runs.
  const markerKeys = new Set();
  for (const r of runs) {
    if (r?.markers && typeof r.markers === 'object') {
      for (const k of Object.keys(r.markers)) markerKeys.add(k);
    }
  }
  const mergedMarkers = {};
  for (const k of markerKeys) {
    const values = runs.map((r) => r?.markers?.[k]).filter((v) => typeof v === 'number');
    const m = median(values);
    if (m != null) mergedMarkers[k] = m;
  }

  // Median memorySnapshots: emit a single synthetic snapshot whose fields are
  // medians of the LAST snapshot of each run. The budget extractor only reads
  // the last entry, so this is sufficient and avoids array-length mismatches.
  const memFields = ['heapUsed', 'heapTotal', 'external', 'rss', 'timestamp'];
  const lastSnaps = runs
    .map((r) =>
      Array.isArray(r?.memorySnapshots) && r.memorySnapshots.length > 0
        ? r.memorySnapshots[r.memorySnapshots.length - 1]
        : null
    )
    .filter(Boolean);
  let mergedMemorySnapshots = last?.memorySnapshots ?? [];
  if (lastSnaps.length > 0) {
    const synthetic = {};
    for (const f of memFields) {
      const m = median(lastSnaps.map((s) => s?.[f]).filter((v) => typeof v === 'number'));
      if (m != null) synthetic[f] = m;
    }
    // Also synthesize a first snapshot so memoryGrowth extractor can compute deltas.
    const firstSnaps = runs
      .map((r) =>
        Array.isArray(r?.memorySnapshots) && r.memorySnapshots.length > 0
          ? r.memorySnapshots[0]
          : null
      )
      .filter(Boolean);
    const syntheticFirst = {};
    for (const f of memFields) {
      const m = median(firstSnaps.map((s) => s?.[f]).filter((v) => typeof v === 'number'));
      if (m != null) syntheticFirst[f] = m;
    }
    mergedMemorySnapshots =
      Object.keys(syntheticFirst).length > 0 ? [syntheticFirst, synthetic] : [synthetic];
  }

  const aggregateComplete = invalidRuns === 0 && runs.length === requestedRuns;

  return {
    ...last,
    markers: mergedMarkers,
    memorySnapshots: mergedMemorySnapshots,
    aggregation: {
      strategy: 'median',
      runs: requestedRuns,
      successfulRuns: runs.length,
      invalidRuns,
      complete: aggregateComplete,
    },
  };
}

async function main() {
  if (!fs.existsSync(path.join(repoRoot, 'lib', 'main', 'index.js'))) {
    log('ERROR: lib/main/index.js missing — run `bun run build:prod` first.');
    process.exit(1);
  }

  // Ensure stale output is removed so we don't accidentally accept a previous run.
  try {
    fs.rmSync(outputPath, { force: true });
  } catch {
    /* ignore */
  }

  log(`PERF_RUNS=${PERF_RUNS} (default 1; set GOGCHAT_PERF_RUNS=N for median aggregation)`);
  if (PRECONNECT_DISABLED) {
    log('GOGCHAT_DISABLE_PRECONNECT=1 — child Electron will skip session.preconnect()');
  }

  const validRuns = [];
  const invalidReceipts = [];
  for (let i = 1; i <= PERF_RUNS; i++) {
    const result = await runOnce(i, PERF_RUNS);
    if (result.valid && result.metrics) {
      validRuns.push(result.metrics);
    } else {
      invalidReceipts.push({
        run: i,
        reasons: result.reasons,
        hasMetrics: result.metrics != null,
      });
    }
  }

  if (validRuns.length === 0) {
    log(`FAILURE: 0/${PERF_RUNS} runs produced complete+valid performance metrics`);
    if (invalidReceipts.length > 0) {
      log(`Invalid run receipts: ${JSON.stringify(invalidReceipts)}`);
    }
    process.exit(1);
  }

  // Refuse medians assembled from incomplete data: every requested run must be valid.
  if (validRuns.length < PERF_RUNS) {
    log(
      `FAILURE: only ${validRuns.length}/${PERF_RUNS} runs are complete+valid — ` +
        `refusing median of incomplete set`
    );
    log(`Invalid run receipts: ${JSON.stringify(invalidReceipts)}`);
    process.exit(1);
  }

  const merged = mergeMedian(validRuns, {
    requestedRuns: PERF_RUNS,
    invalidRuns: invalidReceipts.length,
  });
  try {
    fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2) + '\n');
    log(
      `Metrics written to: ${outputPath} (${validRuns.length}/${PERF_RUNS} complete+valid runs, ` +
        `${PERF_RUNS === 1 ? 'single run' : 'median of complete runs'})`
    );
  } catch (err) {
    log(`ERROR writing merged metrics: ${err.message}`);
    process.exit(1);
  }

  process.exit(0);
}

function safeKill(child) {
  if (!child || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  // Force kill after grace period
  setTimeout(() => {
    if (child && !child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }, 3000).unref();
}

function waitExit(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null || child.killed) return resolve();
    child.once('exit', () => resolve());
    setTimeout(resolve, 5000).unref();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    log(`Fatal: ${err?.stack || err}`);
    process.exit(1);
  });
}
