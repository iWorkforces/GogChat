import { describe, expect, it } from 'vitest';

import {
  BENCHMARK_SCHEMA_VERSION,
  SUPPORTED_BACKENDS,
  SUPPORTED_ACCOUNT_COUNTS,
  SUPPORTED_STATES,
  validateRunRecord,
  buildMatrixScaffold,
  finalizeCell,
  verifyContract,
  median,
  p95,
} from './account-backend-benchmark.js';

describe('account-backend-benchmark contract', () => {
  it('verifyContract passes', () => {
    const result = verifyContract();
    expect(result.ok).toBe(true);
    expect(result.schemaVersion).toBe(BENCHMARK_SCHEMA_VERSION);
  });

  it('matrix scaffold covers backend × accounts × states', () => {
    const scaffold = buildMatrixScaffold();
    expect(scaffold.cells.length).toBe(
      SUPPORTED_BACKENDS.length * SUPPORTED_ACCOUNT_COUNTS.length * SUPPORTED_STATES.length
    );
  });

  it('rejects auth-protection breach and missing child renderer', () => {
    expect(
      validateRunRecord({
        backend: 'browser-window',
        accountCount: 1,
        state: 'auth-protected',
        identities: [{ pid: 1, creationTime: 1, accountIndex: 0, backend: 'browser-window' }],
        authProtectionBreached: true,
      }).valid
    ).toBe(false);

    expect(
      validateRunRecord({
        backend: 'web-contents-view',
        accountCount: 2,
        state: 'active',
        identities: [{ pid: 1, creationTime: 1, accountIndex: 0, backend: 'web-contents-view' }],
        missingChildRenderer: true,
      }).valid
    ).toBe(false);
  });

  it('finalizes cell with median/p95 when enough valid runs exist', () => {
    const cell = {
      backend: 'browser-window',
      accountCount: 1,
      state: 'active',
      runs: Array.from({ length: 5 }, (_, i) => ({
        valid: true,
        metrics: { switchLatencyMs: 10 + i, hydrateLatencyMs: 20 + i },
      })),
    };
    finalizeCell(cell, 5);
    expect(cell.status).toBe('complete');
    expect(cell.aggregates.switchLatencyMs.median).toBe(12);
    expect(cell.aggregates.switchLatencyMs.p95).toBe(p95([10, 11, 12, 13, 14]));
  });

  it('median helper works for even lengths', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
