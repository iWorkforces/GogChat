#!/usr/bin/env node

/**
 * Threshold-gated performance candidate decisions (Todo 9).
 *
 * Each candidate is evaluated independently. Product code changes only when
 * declared thresholds pass (20 valid pairs, ≥10% median improvement, ≤5% p95
 * regression, invariants intact). Otherwise writes a NO CHANGE receipt.
 *
 * Usage:
 *   bun scripts/performance-candidate-benchmark.js --candidate unread
 *   bun scripts/performance-candidate-benchmark.js --candidate all
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export const CANDIDATES = ['unread', 'cdp', 'timers', 'split-chunks', 'preconnect'];

export const THRESHOLDS = {
  minValidPairs: 20,
  minMedianImprovementPct: 10,
  maxP95RegressionPct: 5,
};

/**
 * Decision protocol for one candidate given control/treatment pair stats.
 * When pairs are missing or below threshold → NO CHANGE.
 */
export function decideCandidate(candidate, evidence) {
  const receipt = {
    candidate,
    timestamp: new Date().toISOString(),
    thresholds: { ...THRESHOLDS },
    primaryMetric: evidence?.primaryMetric ?? null,
    validPairs: evidence?.validPairs ?? 0,
    medianImprovementPct: evidence?.medianImprovementPct ?? null,
    p95RegressionPct: evidence?.p95RegressionPct ?? null,
    invariantsOk: evidence?.invariantsOk ?? false,
    securityOk: evidence?.securityOk ?? false,
    decision: 'NO CHANGE',
    reasons: [],
  };

  if (!evidence || evidence.validPairs < THRESHOLDS.minValidPairs) {
    receipt.reasons.push(
      `insufficient valid pairs: ${evidence?.validPairs ?? 0} < ${THRESHOLDS.minValidPairs}`
    );
    return receipt;
  }
  if (
    evidence.medianImprovementPct == null ||
    evidence.medianImprovementPct < THRESHOLDS.minMedianImprovementPct
  ) {
    receipt.reasons.push(
      `median improvement ${evidence.medianImprovementPct}% < ${THRESHOLDS.minMedianImprovementPct}%`
    );
    return receipt;
  }
  if (
    evidence.p95RegressionPct != null &&
    evidence.p95RegressionPct > THRESHOLDS.maxP95RegressionPct
  ) {
    receipt.reasons.push(
      `p95 regression ${evidence.p95RegressionPct}% > ${THRESHOLDS.maxP95RegressionPct}%`
    );
    return receipt;
  }
  if (!evidence.invariantsOk || !evidence.securityOk) {
    receipt.reasons.push('invariant or security check failed');
    return receipt;
  }

  receipt.decision = 'CHANGE';
  receipt.reasons.push('all thresholds met');
  return receipt;
}

/**
 * Run all candidates without synthetic measurements → NO CHANGE receipts.
 * Preconnect requires secured authenticated first-interaction evidence which
 * is credential-isolated; without it always NO CHANGE.
 */
export function evaluateAllCandidates(fixtureEvidence = {}) {
  return CANDIDATES.map((candidate) => {
    const evidence = fixtureEvidence[candidate] ?? {
      primaryMetric: candidatePrimaryMetric(candidate),
      validPairs: 0,
      medianImprovementPct: null,
      p95RegressionPct: null,
      invariantsOk: true,
      securityOk: true,
    };
    if (candidate === 'preconnect' && !evidence.securedAuthReady) {
      evidence.validPairs = 0;
      evidence.note =
        'preconnect requires secured release authenticated first-interaction evidence';
    }
    return decideCandidate(candidate, evidence);
  });
}

function candidatePrimaryMetric(candidate) {
  switch (candidate) {
    case 'unread':
      return 'unread-reconcile-cpu-ms';
    case 'cdp':
      return 'cdp-sample-p95-ms';
    case 'timers':
      return 'long-session-heap-mb';
    case 'split-chunks':
      return 'main-bundle-parse-ms';
    case 'preconnect':
      return 'authenticated-first-interaction-ms';
    default:
      return candidate;
  }
}

function main() {
  const argv = process.argv.slice(2);
  let candidate = 'all';
  let evidenceDir = path.join(repoRoot, '.omo', 'evidence', 'performance-remediation');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--candidate') candidate = argv[++i];
    if (argv[i] === '--evidence') evidenceDir = argv[++i];
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  const receipts =
    candidate === 'all'
      ? evaluateAllCandidates()
      : [
          decideCandidate(candidate, {
            validPairs: 0,
            primaryMetric: candidatePrimaryMetric(candidate),
          }),
        ];

  for (const receipt of receipts) {
    const out = path.join(evidenceDir, `task-9-${receipt.candidate}.json`);
    fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
    process.stdout.write(
      `[candidate] ${receipt.candidate}: ${receipt.decision} (${receipt.reasons.join('; ')}) → ${out}\n`
    );
  }

  // Incomplete/noisy fixture path for tests
  if (process.env.GOGCHAT_CANDIDATE_FIXTURE === 'threshold-not-met') {
    const noisy = decideCandidate('unread', {
      primaryMetric: 'unread-reconcile-cpu-ms',
      validPairs: 5,
      medianImprovementPct: 2,
      p95RegressionPct: 1,
      invariantsOk: true,
      securityOk: true,
    });
    const out = path.join(evidenceDir, 'task-9-threshold-not-met.json');
    fs.writeFileSync(out, JSON.stringify(noisy, null, 2) + '\n');
  }

  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
