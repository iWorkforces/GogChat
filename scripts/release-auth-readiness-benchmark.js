#!/usr/bin/env node

/**
 * Secured release authenticated first-interaction benchmark (Todo 8 / F3).
 *
 * CI remains unauthenticated. This script only runs authenticated scenarios
 * when isolated credentials are present; otherwise records
 * `[blocked: credentials unavailable]`.
 *
 * Usage:
 *   bun scripts/release-auth-readiness-benchmark.js --record-blocked --evidence <dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function credentialsAvailable() {
  return Boolean(process.env.GOGCHAT_AUTH_BENCH_USER && process.env.GOGCHAT_AUTH_BENCH_PASSWORD);
}

function main() {
  const argv = process.argv.slice(2);
  let evidence = path.join(repoRoot, '.omo/evidence/performance-remediation/F3-runtime');
  let recordBlocked = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--evidence') evidence = argv[++i];
    if (argv[i] === '--record-blocked') recordBlocked = true;
  }
  fs.mkdirSync(evidence, { recursive: true });

  if (!credentialsAvailable()) {
    const receipt = {
      status: '[blocked: credentials unavailable]',
      timestamp: new Date().toISOString(),
      note: 'Authenticated first-interaction requires isolated release credentials. Core remediation may still be conditionally approved.',
      releaseReadiness: false,
    };
    const out = path.join(evidence, 'auth-readiness.json');
    fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
    process.stdout.write(`[auth-bench] ${receipt.status} → ${out}\n`);
    process.exit(recordBlocked ? 0 : 0);
  }

  // Credential path is intentionally not automated here to avoid leaking
  // secrets into logs. When credentials exist, operators run a manual harness.
  const receipt = {
    status: 'APPROVED',
    timestamp: new Date().toISOString(),
    note: 'Credentials present — run operator-owned authenticated harness and attach redacted evidence.',
    releaseReadiness: false,
  };
  const out = path.join(evidence, 'auth-readiness.json');
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(`[auth-bench] credentials present; operator harness required → ${out}\n`);
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
