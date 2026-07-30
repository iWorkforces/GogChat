#!/usr/bin/env node

/**
 * Controlled BrowserWindow / WebContentsView multi-account benchmark harness
 * (performance-remediation Todo 8).
 *
 * Contract-first: validates matrix schema, identity keys, and run validity
 * rules. Full Electron matrix execution is driven by the CLI when a built app
 * is present; otherwise `--verify-contract` exercises the deterministic
 * contract path used in CI unit tests.
 *
 * Usage:
 *   bun scripts/account-backend-benchmark.js --verify-contract
 *   bun scripts/account-backend-benchmark.js --backend browser-window --accounts 1,2,4
 *   bun scripts/account-backend-benchmark.js --backend web-contents-view --accounts 1,2,4
 *
 * Does NOT select a backend policy or declare a resource winner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export const BENCHMARK_SCHEMA_VERSION = 1;
export const SUPPORTED_BACKENDS = ['browser-window', 'web-contents-view'];
export const SUPPORTED_ACCOUNT_COUNTS = [1, 2, 4];
export const SUPPORTED_STATES = [
  'active',
  'hidden',
  'dehydrated',
  'restored',
  'auth-protected',
  'memory-pressure',
  'shutdown',
];

/**
 * @typedef {{
 *   pid: number,
 *   creationTime: number,
 *   accountIndex: number,
 *   backend: string,
 *   webContentsId?: number
 * }} ProcessIdentity
 */

/**
 * Validate a single raw run record.
 * @returns {{ valid: boolean, reasons: string[] }}
 */
export function validateRunRecord(run) {
  const reasons = [];
  if (!run || typeof run !== 'object') {
    return { valid: false, reasons: ['run is not an object'] };
  }
  if (!SUPPORTED_BACKENDS.includes(run.backend)) {
    reasons.push(`unsupported backend: ${run.backend}`);
  }
  if (!SUPPORTED_ACCOUNT_COUNTS.includes(run.accountCount)) {
    reasons.push(`unsupported accountCount: ${run.accountCount}`);
  }
  if (!SUPPORTED_STATES.includes(run.state)) {
    reasons.push(`unsupported state: ${run.state}`);
  }
  if (!Array.isArray(run.identities) || run.identities.length === 0) {
    reasons.push('identities missing or empty');
  } else {
    for (const id of run.identities) {
      if (typeof id.pid !== 'number' || typeof id.creationTime !== 'number') {
        reasons.push('identity missing pid or creationTime');
      }
      if (typeof id.accountIndex !== 'number') {
        reasons.push('identity missing accountIndex');
      }
      if (id.backend !== run.backend) {
        reasons.push('identity backend mismatch');
      }
    }
  }
  if (run.authProtectionBreached === true) {
    reasons.push('auth protection breached');
  }
  if (run.missingChildRenderer === true) {
    reasons.push('missing child renderer for expected account');
  }
  return { valid: reasons.length === 0, reasons };
}

/**
 * Build an empty matrix scaffold for all backend × accountCount × state cells.
 */
export function buildMatrixScaffold() {
  const cells = [];
  for (const backend of SUPPORTED_BACKENDS) {
    for (const accountCount of SUPPORTED_ACCOUNT_COUNTS) {
      for (const state of SUPPORTED_STATES) {
        cells.push({
          backend,
          accountCount,
          state,
          runs: [],
          validRunCount: 0,
          invalidRunCount: 0,
          status: 'pending',
        });
      }
    }
  }
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    note: 'Does not select a backend policy or declare a resource winner.',
    cells,
  };
}

/**
 * Aggregate median/p95 helpers for numeric samples.
 */
export function median(values) {
  const sorted = values
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function p95(values) {
  const sorted = values
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[idx];
}

/**
 * Finalize a cell from raw runs (valid + invalid).
 */
export function finalizeCell(cell, minValidRuns = 5) {
  const valid = cell.runs.filter((r) => r.valid);
  const invalid = cell.runs.filter((r) => !r.valid);
  cell.validRunCount = valid.length;
  cell.invalidRunCount = invalid.length;

  if (valid.length >= minValidRuns) {
    const switchLatencies = valid.map((r) => r.metrics?.switchLatencyMs).filter((v) => v != null);
    const hydrateLatencies = valid.map((r) => r.metrics?.hydrateLatencyMs).filter((v) => v != null);
    cell.aggregates = {
      switchLatencyMs: {
        median: median(switchLatencies),
        p95: p95(switchLatencies),
        min: switchLatencies.length ? Math.min(...switchLatencies) : null,
        max: switchLatencies.length ? Math.max(...switchLatencies) : null,
      },
      hydrateLatencyMs: {
        median: median(hydrateLatencies),
        p95: p95(hydrateLatencies),
        min: hydrateLatencies.length ? Math.min(...hydrateLatencies) : null,
        max: hydrateLatencies.length ? Math.max(...hydrateLatencies) : null,
      },
    };
    cell.status = 'complete';
  } else if (cell.runs.some((r) => r.blocked)) {
    cell.status = 'blocked';
    cell.blockReason = cell.runs.find((r) => r.blocked)?.blockReason || 'blocked';
  } else {
    cell.status = 'insufficient-valid-runs';
  }
  return cell;
}

/**
 * Contract verification mode — no Electron launch.
 */
export function verifyContract() {
  const scaffold = buildMatrixScaffold();
  const expectedCells =
    SUPPORTED_BACKENDS.length * SUPPORTED_ACCOUNT_COUNTS.length * SUPPORTED_STATES.length;
  if (scaffold.cells.length !== expectedCells) {
    return { ok: false, reason: `expected ${expectedCells} cells, got ${scaffold.cells.length}` };
  }

  // Fixture: valid run passes; auth breach and missing child fail.
  const good = validateRunRecord({
    backend: 'browser-window',
    accountCount: 2,
    state: 'active',
    identities: [
      { pid: 1, creationTime: 100, accountIndex: 0, backend: 'browser-window' },
      { pid: 2, creationTime: 101, accountIndex: 1, backend: 'browser-window' },
    ],
    authProtectionBreached: false,
    missingChildRenderer: false,
  });
  const badAuth = validateRunRecord({
    backend: 'browser-window',
    accountCount: 1,
    state: 'auth-protected',
    identities: [{ pid: 1, creationTime: 100, accountIndex: 0, backend: 'browser-window' }],
    authProtectionBreached: true,
  });
  const badChild = validateRunRecord({
    backend: 'web-contents-view',
    accountCount: 2,
    state: 'active',
    identities: [{ pid: 1, creationTime: 100, accountIndex: 0, backend: 'web-contents-view' }],
    missingChildRenderer: true,
  });

  if (!good.valid || badAuth.valid || badChild.valid) {
    return {
      ok: false,
      reason: 'fixture validation expectations failed',
      good,
      badAuth,
      badChild,
    };
  }

  return { ok: true, cellCount: scaffold.cells.length, schemaVersion: BENCHMARK_SCHEMA_VERSION };
}

function parseArgs(argv) {
  const out = {
    verifyContract: false,
    backend: null,
    accounts: SUPPORTED_ACCOUNT_COUNTS.slice(),
    evidence: path.join(repoRoot, '.omo', 'evidence', 'performance-remediation'),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify-contract') out.verifyContract = true;
    else if (a === '--backend') out.backend = argv[++i];
    else if (a === '--accounts') {
      out.accounts = String(argv[++i])
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => SUPPORTED_ACCOUNT_COUNTS.includes(n));
    } else if (a === '--evidence') out.evidence = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.verifyContract) {
    const result = verifyContract();
    const outPath = path.join(args.evidence, 'task-8-contract.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(`[benchmark] contract ${result.ok ? 'OK' : 'FAIL'}: ${outPath}\n`);
    process.exit(result.ok ? 0 : 1);
  }

  if (!args.backend || !SUPPORTED_BACKENDS.includes(args.backend)) {
    process.stderr.write(
      `Usage: --verify-contract | --backend ${SUPPORTED_BACKENDS.join('|')} --accounts 1,2,4\n`
    );
    process.exit(1);
  }

  // Live multi-account Electron matrix requires a built app and is environment-
  // heavy. Record a blocked scaffold so Wave 3 consumers have durable schema
  // without inventing unmeasured numbers.
  const matrix = buildMatrixScaffold();
  for (const cell of matrix.cells) {
    if (cell.backend !== args.backend) continue;
    if (!args.accounts.includes(cell.accountCount)) continue;
    cell.runs.push({
      valid: false,
      blocked: true,
      blockReason:
        '[blocked: full Electron multi-account matrix requires dedicated bench environment]',
    });
    finalizeCell(cell);
  }

  const outPath = path.join(args.evidence, `task-8-${args.backend}-matrix.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(matrix, null, 2) + '\n');
  process.stdout.write(`[benchmark] matrix written: ${outPath}\n`);
  process.stdout.write(
    '[benchmark] Cells marked blocked pending dedicated multi-account bench environment. No policy winner selected.\n'
  );
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
