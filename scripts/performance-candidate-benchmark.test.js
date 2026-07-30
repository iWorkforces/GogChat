import { describe, expect, it } from 'vitest';

import {
  CANDIDATES,
  decideCandidate,
  evaluateAllCandidates,
  THRESHOLDS,
} from './performance-candidate-benchmark.js';

describe('performance-candidate-benchmark', () => {
  it('defaults all candidates to NO CHANGE without measurements', () => {
    const receipts = evaluateAllCandidates();
    expect(receipts).toHaveLength(CANDIDATES.length);
    expect(receipts.every((r) => r.decision === 'NO CHANGE')).toBe(true);
  });

  it('returns NO CHANGE when pairs are below threshold', () => {
    const r = decideCandidate('cdp', {
      primaryMetric: 'cdp-sample-p95-ms',
      validPairs: 5,
      medianImprovementPct: 50,
      p95RegressionPct: 0,
      invariantsOk: true,
      securityOk: true,
    });
    expect(r.decision).toBe('NO CHANGE');
    expect(r.reasons.some((x) => /pairs/i.test(x))).toBe(true);
  });

  it('returns CHANGE only when all thresholds pass', () => {
    const r = decideCandidate('timers', {
      primaryMetric: 'long-session-heap-mb',
      validPairs: THRESHOLDS.minValidPairs,
      medianImprovementPct: 15,
      p95RegressionPct: 2,
      invariantsOk: true,
      securityOk: true,
    });
    expect(r.decision).toBe('CHANGE');
  });

  it('rejects CHANGE when p95 regresses too much', () => {
    const r = decideCandidate('unread', {
      primaryMetric: 'unread-reconcile-cpu-ms',
      validPairs: 20,
      medianImprovementPct: 20,
      p95RegressionPct: 10,
      invariantsOk: true,
      securityOk: true,
    });
    expect(r.decision).toBe('NO CHANGE');
  });
});
