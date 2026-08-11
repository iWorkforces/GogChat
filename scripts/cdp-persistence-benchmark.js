#!/usr/bin/env node

/**
 * Fail-closed CDP persistence measurement harness.
 *
 * Measures the built `lib/chunks/cdpMetrics.js` recordMetrics path inside a
 * disposable Electron child with a unique userData directory. This plan has no
 * control/treatment pair — a valid run can only emit NO CHANGE after raw
 * samples exist.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

export const SIZES = [1, 100, 1000];
export const MIN_SAMPLES = 20;
export const MAX_RECORDS_PER_ACCOUNT = 1000;
export const BUILT_ENTRY = path.join(repoRoot, 'lib/chunks/cdpMetrics.js');

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function p95(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index];
}

export function seedMetricsFile(userDataDir, accountIndex, count) {
  const records = Array.from({ length: count }, (_, index) => ({
    timestamp: 1_700_000_000_000 + index,
    metrics: { JSHeapUsedSize: index },
  }));
  const file = { version: 1, records, lastCleanup: 1_700_000_000_000 };
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, `cdp-metrics-account-${accountIndex}.json`),
    JSON.stringify(file)
  );
  return file;
}

export function readSeededFile(userDataDir, accountIndex) {
  const raw = fs.readFileSync(
    path.join(userDataDir, `cdp-metrics-account-${accountIndex}.json`),
    'utf8'
  );
  return { raw, parsed: JSON.parse(raw) };
}

export function validateFifo(file, seededCount) {
  if (!file || !Array.isArray(file.records)) return false;
  if (file.records.length > MAX_RECORDS_PER_ACCOUNT) return false;
  const expected = Math.min(seededCount + 1, MAX_RECORDS_PER_ACCOUNT);
  if (file.records.length !== expected) return false;
  for (let i = 1; i < file.records.length; i += 1) {
    if (file.records[i].timestamp < file.records[i - 1].timestamp) return false;
  }
  return true;
}

export function validateEvidence(evidence) {
  const errors = [];
  if (!evidence?.environment?.os || !evidence.environment.arch) {
    errors.push('missing environment metadata');
  }
  if (!evidence?.cells || typeof evidence.cells !== 'object') {
    errors.push('missing cells');
    return { ok: false, errors };
  }
  for (const size of SIZES) {
    const cell = evidence.cells[size];
    if (!cell) {
      errors.push(`missing size ${size}`);
      continue;
    }
    if (!Array.isArray(cell.samples) || cell.samples.length < MIN_SAMPLES) {
      errors.push(`size ${size} has ${cell.samples?.length ?? 0} samples`);
      continue;
    }
    for (const [index, sample] of cell.samples.entries()) {
      if (sample.jsonValid !== true) errors.push(`size ${size} sample ${index} invalid JSON`);
      if (sample.fifoOk !== true) errors.push(`size ${size} sample ${index} FIFO/cap failed`);
      if (sample.recordCount > MAX_RECORDS_PER_ACCOUNT) {
        errors.push(`size ${size} sample ${index} exceeded cap`);
      }
      if (typeof sample.durationMs !== 'number' || typeof sample.fileBytes !== 'number') {
        errors.push(`size ${size} sample ${index} missing duration/bytes`);
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    sizes: SIZES.filter((size) => evidence.cells[size]),
    environment: evidence.environment ?? null,
  };
}

export function decideMeasurement(evidence) {
  const validated = validateEvidence(evidence);
  if (!validated.ok) {
    return {
      ok: false,
      decision: 'INVALID',
      reason: validated.errors.join('; '),
      rawSamples: 0,
    };
  }
  const rawSamples = SIZES.reduce(
    (sum, size) => sum + (evidence.cells[size]?.samples.length ?? 0),
    0
  );
  return {
    ok: true,
    decision: 'NO CHANGE',
    reason: 'this approved plan has no control/treatment optimization candidate',
    rawSamples,
  };
}

export function teardownRun({ userDataDir, child } = {}) {
  let childLeaked = false;
  if (child && child.exitCode == null && child.killed !== true) {
    childLeaked = true;
    child.kill?.('SIGTERM');
  }
  if (userDataDir && fs.existsSync(userDataDir)) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  return { childLeaked, removed: Boolean(userDataDir) };
}

export function environmentMetadata() {
  return {
    os: process.platform,
    arch: process.arch,
    electron: process.versions.electron ?? null,
    node: process.versions.node,
    bun: process.versions.bun ?? null,
  };
}

function electronBinary() {
  const name = process.platform === 'win32' ? 'electron.cmd' : 'electron';
  return path.join(repoRoot, 'node_modules', '.bin', name);
}

/**
 * Load `recordMetrics` from the built rspack chunk by supplying Electron/fs stubs.
 */
export async function loadBuiltRecordMetrics(app) {
  if (!fs.existsSync(BUILT_ENTRY)) {
    throw new Error(`missing built CDP entry: ${BUILT_ENTRY}`);
  }
  const chunk = await import(pathToFileURL(BUILT_ENTRY).href);
  const factories = Object.values(chunk.__webpack_modules__ ?? {});
  if (factories.length === 0) {
    throw new Error('built CDP entry has no webpack modules');
  }

  const stubs = [
    { app },
    fs,
    path,
    { default: { warn() {}, debug() {}, info() {} } },
    { ZQ: (value) => value },
  ];

  for (const factory of factories) {
    const exported = {};
    const assigned = new Map();
    const req = (id) => {
      if (assigned.has(id)) return assigned.get(id);
      const next = stubs[assigned.size];
      if (!next) {
        throw new Error(`unresolved built CDP dependency ${id}`);
      }
      assigned.set(id, next);
      return next;
    };
    req.d = (target, definition) => {
      for (const [key, getter] of Object.entries(definition)) {
        Object.defineProperty(target, key, { enumerable: true, get: getter });
      }
    };
    factory({}, exported, req);
    const fns = Object.values(exported).filter((value) => typeof value === 'function');
    const recordMetrics = fns.find((fn) => fn.length >= 2);
    if (recordMetrics) {
      return recordMetrics;
    }
  }
  throw new Error('built CDP entry did not export recordMetrics');
}

export async function measureOneAppend({ userDataDir, accountIndex, seededCount, recordMetrics }) {
  seedMetricsFile(userDataDir, accountIndex, seededCount);
  const start = process.hrtime.bigint();
  const loopStart = globalThis.performance.now();
  recordMetrics(accountIndex, { JSHeapUsedSize: seededCount + 1 });
  const eventLoopDelayMs = globalThis.performance.now() - loopStart;
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  const { raw, parsed } = readSeededFile(userDataDir, accountIndex);
  return {
    size: seededCount,
    durationMs,
    eventLoopDelayMs,
    fileBytes: Buffer.byteLength(raw),
    recordCount: parsed.records.length,
    jsonValid: parsed.version === 1 && Array.isArray(parsed.records),
    fifoOk: validateFifo(parsed, seededCount),
    monotonic: validateFifo(parsed, seededCount),
    capped: parsed.records.length <= MAX_RECORDS_PER_ACCOUNT,
  };
}

export async function runDryElectronChild({ samplesPerSize = 1 } = {}) {
  if (!fs.existsSync(BUILT_ENTRY)) {
    throw new Error(`build first: missing ${BUILT_ENTRY}`);
  }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-cdp-'));
  const childPath = path.join(__dirname, 'cdp-persistence-child.js');
  const child = spawn(electronBinary(), [childPath, userDataDir, String(samplesPerSize)], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
  });
  const teardown = teardownRun({ userDataDir, child: { ...child, exitCode } });
  return { exitCode, stdout, stderr, teardown, userDataDir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const samples = Number(process.env.CDP_SAMPLES ?? MIN_SAMPLES);
  console.log(
    JSON.stringify(
      {
        builtEntry: BUILT_ENTRY,
        exists: fs.existsSync(BUILT_ENTRY),
        sizes: SIZES,
        minSamples: samples,
      },
      null,
      2
    )
  );
}
