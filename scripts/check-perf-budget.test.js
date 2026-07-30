import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  evaluateBudgets,
  validateMetricsContract,
  PERF_EXPORT_SCHEMA_VERSION,
  BUDGETS,
} from './check-perf-budget.js';

const REQUIRED_MARKERS = [
  'app-start',
  'app-ready',
  'account-0-ready',
  'account-0-content-loaded',
  'features-loaded',
  'all-features-loaded',
];

function makeValidMetrics(overrides = {}) {
  const markers = {
    'app-start': 0,
    'app-ready': 100,
    'account-0-ready': 200,
    'account-0-content-loaded': 500,
    'features-loaded': 400,
    'all-features-loaded': 800,
    'store-init-start': 110,
    'store-init-end': 150,
    'deferred-features-start': 500,
  };
  return {
    schemaVersion: PERF_EXPORT_SCHEMA_VERSION,
    units: { memory: 'MB', time: 'ms' },
    capture: {
      complete: true,
      valid: true,
      requiredMarkers: REQUIRED_MARKERS,
      missingMarkers: [],
      rendererSampleCount: 1,
    },
    startupTime: 800,
    markers,
    memorySnapshots: [
      { timestamp: 0, heapUsed: 40, heapTotal: 60, external: 1, rss: 120 },
      { timestamp: 800, heapUsed: 55, heapTotal: 80, external: 2, rss: 150 },
    ],
    rendererSnapshots: [
      {
        timestamp: 500,
        pid: 1,
        type: 'renderer',
        memory: { residentSet: 10, peakResidentSet: 12, private: 0 },
        cpuPercent: 1,
      },
    ],
    targetMet: true,
    warnings: [],
    timestamp: new Date().toISOString(),
    appVersion: '1.0.0',
    ...overrides,
  };
}

describe('validateMetricsContract', () => {
  it('accepts a complete MB-unit schema-valid artifact', () => {
    expect(validateMetricsContract(makeValidMetrics()).ok).toBe(true);
  });

  it('rejects schema version mismatch', () => {
    const r = validateMetricsContract(makeValidMetrics({ schemaVersion: 0 }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('schemaVersion'))).toBe(true);
  });

  it('rejects MB/byte unit mismatch', () => {
    const r = validateMetricsContract(makeValidMetrics({ units: { memory: 'bytes', time: 'ms' } }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('units.memory'))).toBe(true);
  });

  it('rejects empty renderer evidence', () => {
    const r = validateMetricsContract(
      makeValidMetrics({ rendererSnapshots: [], capture: { complete: true, valid: true } })
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /renderer/i.test(e))).toBe(true);
  });
});

describe('evaluateBudgets', () => {
  it('passes a complete compatible fixture', () => {
    const { results, failed, contractErrors } = evaluateBudgets(makeValidMetrics(), {
      silent: true,
    });
    expect(contractErrors).toEqual([]);
    // Gated timing/memory/renderer metrics present; bundle sizes may fail if lib missing
    const gatedByName = Object.fromEntries(
      results.filter((r) => r.gated).map((r) => [r.name, r.status])
    );
    expect(gatedByName.totalStartup).toBe('PASS');
    expect(gatedByName.nativeWindowReady).toBe('PASS');
    expect(gatedByName.contentDocumentLoaded).toBe('PASS');
    expect(gatedByName.heapBaseline).toBe('PASS');
    expect(gatedByName.rendererCount).toBe('PASS');
    // Memory formatted as MB once (budget is 150 MB, actual 55)
    const heap = results.find((r) => r.name === 'heapBaseline');
    expect(heap.actual).toBe(55);
    expect(heap.budget).toBe(150);
    void failed;
  });

  it('fails when a gated marker is missing (no SKIP for gated)', () => {
    const metrics = makeValidMetrics();
    delete metrics.markers['account-0-content-loaded'];
    const { results } = evaluateBudgets(metrics, { silent: true });
    const content = results.find((r) => r.name === 'contentDocumentLoaded');
    expect(content.status).toBe('FAIL');
    expect(content.actual).toBeNull();
  });

  it('fails when renderer samples are empty', () => {
    const metrics = makeValidMetrics({
      rendererSnapshots: [],
      capture: {
        complete: true,
        valid: false,
        requiredMarkers: REQUIRED_MARKERS,
        missingMarkers: [],
        rendererSampleCount: 0,
      },
    });
    const { failed, contractErrors } = evaluateBudgets(metrics, { silent: true });
    expect(contractErrors.some((e) => /renderer/i.test(e))).toBe(true);
    expect(failed).toBeGreaterThan(0);
  });

  it('keeps missing warn-only metrics as SKIP (non-blocking)', () => {
    const metrics = makeValidMetrics({ ipcLatencySamples: undefined });
    const { results, failed } = evaluateBudgets(metrics, { silent: true });
    const ipc = results.find((r) => r.name === 'ipcLatencyP50');
    expect(ipc.gated).toBe(false);
    expect(ipc.status).toBe('SKIP');
    // Contract-valid metrics should not force warn-only into FAIL
    void failed;
  });

  it('renamed nativeWindowReady is present and windowFirstPaint is not', () => {
    const names = BUDGETS.map((b) => b.name);
    expect(names).toContain('nativeWindowReady');
    expect(names).not.toContain('windowFirstPaint');
    expect(names).toContain('contentDocumentLoaded');
    expect(names).not.toContain('contentFirstPaint');
  });
});

describe('fixture files', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-budget-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('writes missing-gated-marker fixture and evaluates FAIL', () => {
    const metrics = makeValidMetrics();
    delete metrics.markers['account-0-content-loaded'];
    const file = path.join(tmp, 'missing-gated-marker.json');
    fs.writeFileSync(file, JSON.stringify(metrics, null, 2));
    const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { results } = evaluateBudgets(loaded, { silent: true });
    expect(results.find((r) => r.name === 'contentDocumentLoaded').status).toBe('FAIL');
  });
});
