import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  median,
  mergeMedian,
  resolveElectronBinary,
  validateRunArtifact,
  PERF_EXPORT_SCHEMA_VERSION,
  REQUIRED_STARTUP_MARKERS,
} from './headless-startup.js';

function makeValidRun(overrides = {}) {
  const markers = Object.fromEntries(REQUIRED_STARTUP_MARKERS.map((name, i) => [name, i * 10]));
  return {
    schemaVersion: PERF_EXPORT_SCHEMA_VERSION,
    units: { memory: 'MB', time: 'ms' },
    capture: {
      complete: true,
      valid: true,
      requiredMarkers: [...REQUIRED_STARTUP_MARKERS],
      missingMarkers: [],
      rendererSampleCount: 1,
    },
    startupTime: 100,
    markers,
    memorySnapshots: [
      { timestamp: 0, heapUsed: 10, heapTotal: 20, external: 1, rss: 100 },
      { timestamp: 10, heapUsed: 30, heapTotal: 40, external: 2, rss: 120 },
    ],
    rendererSnapshots: [
      {
        timestamp: 10,
        pid: 1,
        type: 'renderer',
        memory: { residentSet: 1, peakResidentSet: 1, private: 0 },
        cpuPercent: 0,
      },
    ],
    targetMet: true,
    warnings: [],
    timestamp: 'run',
    appVersion: '1.0.0',
    ...overrides,
  };
}

/** Build renderer snapshots. `creationTime` is omitted when not provided. */
function makeRendererSnapshots(identities) {
  return identities.map((id, i) => {
    const snap = {
      timestamp: 10 + i,
      pid: id.pid,
      type: 'renderer',
      memory: { residentSet: 1, peakResidentSet: 1, private: 0 },
      cpuPercent: 0,
    };
    if (Object.prototype.hasOwnProperty.call(id, 'creationTime')) {
      snap.creationTime = id.creationTime;
    }
    return snap;
  });
}

function identitiesWithCount(count, pidBase, options = {}) {
  const withCreationTime = options.withCreationTime !== false;
  return Array.from({ length: count }, (_, i) => {
    const id = { pid: pidBase + i };
    if (withCreationTime) id.creationTime = 1000 + i;
    return id;
  });
}

describe('headless-startup median aggregation', () => {
  it('computes medians for odd and even numeric samples', () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('ignores non-finite and non-number values', () => {
    expect(median([Number.NaN, 'x', 2, Number.POSITIVE_INFINITY, 6])).toBe(4);
    expect(median([Number.NaN, 'x', undefined])).toBeNull();
  });

  it('stamps aggregation completeness on a single-run merge', () => {
    const run = makeValidRun({ markers: { a: 1 }, memorySnapshots: [{ heapUsed: 10 }] });
    const merged = mergeMedian([run], { requestedRuns: 1, invalidRuns: 0 });
    expect(merged.aggregation).toEqual({
      strategy: 'single',
      runs: 1,
      successfulRuns: 1,
      invalidRuns: 0,
      complete: true,
    });
  });

  it('merges markers and first/last memory snapshots by median', () => {
    const merged = mergeMedian(
      [
        {
          markers: { start: 0, end: 10 },
          memorySnapshots: [
            { timestamp: 0, heapUsed: 10, heapTotal: 20, external: 1, rss: 100 },
            { timestamp: 10, heapUsed: 30, heapTotal: 40, external: 2, rss: 120 },
          ],
          timestamp: 'run-1',
        },
        {
          markers: { start: 0, end: 20, extra: 50 },
          memorySnapshots: [
            { timestamp: 0, heapUsed: 20, heapTotal: 30, external: 3, rss: 200 },
            { timestamp: 20, heapUsed: 50, heapTotal: 70, external: 4, rss: 250 },
          ],
          timestamp: 'run-2',
        },
        {
          markers: { start: 0, end: 30 },
          memorySnapshots: [
            { timestamp: 0, heapUsed: 30, heapTotal: 40, external: 5, rss: 300 },
            { timestamp: 30, heapUsed: 70, heapTotal: 90, external: 6, rss: 350 },
          ],
          timestamp: 'run-3',
        },
      ],
      { requestedRuns: 3, invalidRuns: 0 }
    );

    expect(merged.markers).toEqual({ start: 0, end: 20, extra: 50 });
    expect(merged.memorySnapshots).toEqual([
      { timestamp: 0, heapUsed: 20, heapTotal: 30, external: 3, rss: 200 },
      { timestamp: 20, heapUsed: 50, heapTotal: 70, external: 4, rss: 250 },
    ]);
    expect(merged.aggregation).toEqual({
      strategy: 'median',
      runs: 3,
      successfulRuns: 3,
      invalidRuns: 0,
      complete: true,
    });
    expect(merged.timestamp).toBe('run-3');
  });

  it('marks aggregate incomplete when invalid runs were excluded', () => {
    const merged = mergeMedian([makeValidRun()], { requestedRuns: 2, invalidRuns: 1 });
    expect(merged.aggregation.complete).toBe(false);
    expect(merged.aggregation.invalidRuns).toBe(1);
  });
});

describe('representative rendererSnapshots selection', () => {
  it('selects upper-median count [4,4,4,4,1] -> 4 from a complete valid run, not the last run', () => {
    const snapSets = [
      makeRendererSnapshots(identitiesWithCount(4, 10)),
      makeRendererSnapshots(identitiesWithCount(4, 20)),
      makeRendererSnapshots(identitiesWithCount(4, 30)),
      makeRendererSnapshots(identitiesWithCount(4, 40)),
      makeRendererSnapshots(identitiesWithCount(1, 50)),
    ];
    const runs = snapSets.map((rendererSnapshots, i) =>
      makeValidRun({ timestamp: `run-${i}`, rendererSnapshots })
    );
    const merged = mergeMedian(runs, { requestedRuns: 5, invalidRuns: 0 });
    // Sorted by count then original index: (1@4), (4@0), (4@1), (4@2), (4@3).
    // floor(5/2) = 2 → original index 1.
    expect(merged.rendererSnapshots).toEqual(snapSets[1]);
    expect(merged.rendererSnapshots).not.toEqual(snapSets[4]);
    expect(merged.aggregation.complete).toBe(true);
  });

  it('uses the even-count upper median (floor(n/2)), not the last run', () => {
    const snapSets = [
      makeRendererSnapshots(identitiesWithCount(1, 10)),
      makeRendererSnapshots(identitiesWithCount(2, 20)),
      makeRendererSnapshots(identitiesWithCount(4, 30)),
      makeRendererSnapshots(identitiesWithCount(8, 40)),
    ];
    const runs = snapSets.map((rendererSnapshots, i) =>
      makeValidRun({ timestamp: `run-${i}`, rendererSnapshots })
    );
    const merged = mergeMedian(runs, { requestedRuns: 4, invalidRuns: 0 });
    // Sorted counts [1,2,4,8]; floor(4/2) = 2 → count 4 (original index 2).
    expect(merged.rendererSnapshots).toEqual(snapSets[2]);
    expect(merged.rendererSnapshots).not.toEqual(snapSets[3]);
  });

  it('breaks equal-count ties by original index (deterministic, not last)', () => {
    const snapSets = [
      makeRendererSnapshots(identitiesWithCount(4, 10)),
      makeRendererSnapshots(identitiesWithCount(4, 20)),
      makeRendererSnapshots(identitiesWithCount(4, 30)),
      makeRendererSnapshots(identitiesWithCount(4, 40)),
    ];
    const runs = snapSets.map((rendererSnapshots, i) =>
      makeValidRun({ timestamp: `run-${i}`, rendererSnapshots })
    );
    const merged = mergeMedian(runs, { requestedRuns: 4, invalidRuns: 0 });
    // All counts 4; stable order is original index; floor(4/2) = 2.
    expect(merged.rendererSnapshots).toEqual(snapSets[2]);
    expect(merged.rendererSnapshots).not.toEqual(snapSets[3]);
  });

  it('counts unique renderer identity by (pid, creationTime) so PID reuse is not collapsed', () => {
    const reusedPidFour = makeRendererSnapshots([
      { pid: 100, creationTime: 1 },
      { pid: 100, creationTime: 2 },
      { pid: 100, creationTime: 3 },
      { pid: 100, creationTime: 4 },
    ]);
    const reusedPidOne = makeRendererSnapshots([
      { pid: 100, creationTime: 9 },
      { pid: 100, creationTime: 9 },
      { pid: 100, creationTime: 9 },
      { pid: 100, creationTime: 9 },
    ]);
    const snapSets = [reusedPidFour, reusedPidFour, reusedPidFour, reusedPidFour, reusedPidOne];
    const runs = snapSets.map((rendererSnapshots, i) =>
      makeValidRun({ timestamp: `run-${i}`, rendererSnapshots })
    );
    const merged = mergeMedian(runs, { requestedRuns: 5, invalidRuns: 0 });
    // Counts [4,4,4,4,1]; same pick as the odd-count case → first 4-identity run
    // after the low-count row (original index 1). Last run is 1 identity.
    expect(merged.rendererSnapshots).toEqual(snapSets[1]);
    expect(merged.rendererSnapshots).not.toEqual(snapSets[4]);
    const uniqueKeys = new Set(merged.rendererSnapshots.map((s) => `${s.pid}:${s.creationTime}`));
    expect(uniqueKeys.size).toBe(4);
  });

  it('falls back to PID identity when creationTime is missing', () => {
    const fourPids = makeRendererSnapshots(identitiesWithCount(4, 10, { withCreationTime: false }));
    const onePidRepeated = makeRendererSnapshots([
      { pid: 50 },
      { pid: 50 },
      { pid: 50 },
      { pid: 50 },
    ]);
    const snapSets = [fourPids, fourPids, fourPids, fourPids, onePidRepeated];
    const runs = snapSets.map((rendererSnapshots, i) =>
      makeValidRun({ timestamp: `run-${i}`, rendererSnapshots })
    );
    const merged = mergeMedian(runs, { requestedRuns: 5, invalidRuns: 0 });
    expect(merged.rendererSnapshots).toEqual(snapSets[1]);
    expect(merged.rendererSnapshots).not.toEqual(snapSets[4]);
    const uniquePids = new Set(merged.rendererSnapshots.map((s) => s.pid));
    expect(uniquePids.size).toBe(4);
  });

  it('never copies representative snapshots from an incomplete run and fails completeness', () => {
    const validSnaps = makeRendererSnapshots(identitiesWithCount(1, 10));
    const incompleteSnaps = makeRendererSnapshots(identitiesWithCount(5, 80));
    const valid = makeValidRun({ timestamp: 'valid-0', rendererSnapshots: validSnaps });
    const incomplete = makeValidRun({
      timestamp: 'incomplete-last',
      rendererSnapshots: incompleteSnaps,
      capture: {
        complete: false,
        valid: false,
        requiredMarkers: [...REQUIRED_STARTUP_MARKERS],
        missingMarkers: [],
        rendererSampleCount: incompleteSnaps.length,
        reason: 'export before capture producers finished',
      },
    });
    const merged = mergeMedian([valid, incomplete], { requestedRuns: 2, invalidRuns: 1 });
    // If the incomplete last run were eligible, even-count upper median would
    // pick it (counts [1,5], floor(2/2)=1). It must not contribute snapshots.
    expect(merged.rendererSnapshots).toEqual(validSnaps);
    expect(merged.rendererSnapshots).not.toEqual(incompleteSnaps);
    expect(merged.aggregation.complete).toBe(false);
    expect(merged.aggregation.invalidRuns).toBe(1);
  });
});

describe('validateRunArtifact', () => {
  it('accepts a complete valid run', () => {
    expect(validateRunArtifact(makeValidRun())).toEqual({ valid: true, reasons: [] });
  });

  it('rejects missing account-0-content-loaded marker', () => {
    const run = makeValidRun();
    delete run.markers['account-0-content-loaded'];
    const result = validateRunArtifact(run);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('account-0-content-loaded'))).toBe(true);
  });

  it('rejects empty renderer evidence', () => {
    const run = makeValidRun({
      rendererSnapshots: [],
      capture: {
        complete: true,
        valid: true,
        requiredMarkers: [...REQUIRED_STARTUP_MARKERS],
        missingMarkers: [],
        rendererSampleCount: 0,
      },
    });
    const result = validateRunArtifact(run);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => /renderer/i.test(r))).toBe(true);
  });

  it('rejects schema version mismatch', () => {
    const run = makeValidRun({ schemaVersion: 0 });
    const result = validateRunArtifact(run);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('schemaVersion'))).toBe(true);
  });

  it('rejects capture.complete=false (early export)', () => {
    const run = makeValidRun({
      capture: {
        complete: false,
        valid: false,
        requiredMarkers: [...REQUIRED_STARTUP_MARKERS],
        missingMarkers: [],
        rendererSampleCount: 1,
        reason: 'export before capture producers finished',
      },
    });
    const result = validateRunArtifact(run);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('capture.complete'))).toBe(true);
  });

  it('rejects MB unit mismatch', () => {
    const run = makeValidRun({ units: { memory: 'bytes', time: 'ms' } });
    const result = validateRunArtifact(run);
    expect(result.valid).toBe(false);
    expect(result.reasons.some((r) => r.includes('units.memory'))).toBe(true);
  });
});

describe('resolveElectronBinary', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-resolve-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeExecutable(filePath, contents = '#!/bin/sh\nexit 0\n') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    fs.chmodSync(filePath, 0o755);
  }

  it('prefers the unpacked macOS Electron executable when its framework is present', () => {
    const direct = path.join(
      tmpRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron'
    );
    const framework = path.join(
      tmpRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'Frameworks',
      'Electron Framework.framework',
      'Electron Framework'
    );
    const wrapper = path.join(tmpRoot, 'node_modules', '.bin', 'electron');
    writeExecutable(direct);
    writeExecutable(framework);
    writeExecutable(wrapper);

    expect(resolveElectronBinary(tmpRoot)).toBe(direct);
  });

  it('falls back to the wrapper when the direct executable exists but the framework is missing', () => {
    const direct = path.join(
      tmpRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron'
    );
    const wrapper = path.join(tmpRoot, 'node_modules', '.bin', 'electron');
    writeExecutable(direct);
    writeExecutable(wrapper);

    expect(resolveElectronBinary(tmpRoot)).toBe(wrapper);
  });

  it('falls back to the wrapper when the direct executable is absent', () => {
    const wrapper = path.join(tmpRoot, 'node_modules', '.bin', 'electron');
    writeExecutable(wrapper);

    expect(resolveElectronBinary(tmpRoot)).toBe(wrapper);
  });
});
