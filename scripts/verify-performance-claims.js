#!/usr/bin/env node

/**
 * Performance claim calibration (Todo 10 / F4).
 *
 * Rejects unsupported runtime-savings claims that are not backed by evidence
 * artifacts. Package-size facts are allowed only when worded as delivery-size
 * facts, not startup gains.
 *
 * Usage:
 *   bun scripts/verify-performance-claims.js --root .
 *   bun scripts/verify-performance-claims.js --root tests/fixtures/overclaim --expect-reject
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

/** Phrases that over-claim runtime improvement without measurement. */
export const FORBIDDEN_CLAIM_PATTERNS = [
  /\bfaster startup by\b/i,
  /\bstartup (?:improved|improvement|reduced) by\s+\d/i,
  /\b\d+%\s+faster startup\b/i,
  /\bpackage size reduction (?:implies|means|equals)\s+faster\b/i,
  /\bWCV is (?:faster|better) than BrowserWindow\b/i,
  /\bWebContentsView is the new default\b/i,
];

/**
 * Scan a directory for markdown/js/ts claim overreach (shallow + one level).
 */
export function scanClaims(rootDir, options = {}) {
  const findings = [];
  const maxDepth = options.maxDepth ?? 2;
  const skip = new Set(['node_modules', 'dist', 'lib', '.git', 'coverage']);

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!/\.(md|txt|js|ts)$/.test(entry.name)) continue;
      // Skip our own verifier and plan (plan documents forbidden claims as examples)
      if (entry.name.includes('verify-performance-claims')) continue;
      if (entry.name === 'performance-remediation.md') continue;
      let text;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      for (const re of FORBIDDEN_CLAIM_PATTERNS) {
        if (re.test(text)) {
          findings.push({ file: full, pattern: re.source });
        }
      }
    }
  }

  walk(rootDir, 0);
  return findings;
}

/**
 * Validate that CHANGE candidates have linked evidence and NO CHANGE has no product claim.
 */
export function validateCandidateClaims(evidenceDir) {
  const errors = [];
  if (!fs.existsSync(evidenceDir)) {
    return { ok: true, errors: [], note: 'no evidence dir' };
  }
  for (const f of fs.readdirSync(evidenceDir)) {
    if (!f.startsWith('task-9-') || !f.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(evidenceDir, f), 'utf8'));
      if (data.decision === 'CHANGE' && !data.benchmarkReceipt) {
        errors.push(`${f}: CHANGE without benchmarkReceipt`);
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: errors.length === 0, errors };
}

function parseArgs(argv) {
  const out = {
    root: repoRoot,
    evidence: path.join(repoRoot, '.omo/evidence/performance-remediation'),
    expectReject: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = argv[++i];
    else if (argv[i] === '--evidence') out.evidence = argv[++i];
    else if (argv[i] === '--expect-reject') out.expectReject = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const findings = scanClaims(args.root);
  const candidate = validateCandidateClaims(args.evidence);
  const rejected = findings.length > 0 || !candidate.ok;

  const report = {
    timestamp: new Date().toISOString(),
    root: args.root,
    findings,
    candidateErrors: candidate.errors,
    ok: !rejected,
  };

  const outPath = path.join(args.evidence, rejected ? 'F4-overclaim.json' : 'F4-scope.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (outPath.endsWith('.md')) {
    fs.writeFileSync(
      outPath,
      `# Scope fidelity\n\nok: true\n\nNo unsupported runtime-savings claims detected.\n` +
        `Candidate errors: ${candidate.errors.length}\n`
    );
  } else {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  }

  process.stdout.write(`[claims] findings=${findings.length} ok=${!rejected}\n`);

  if (args.expectReject) {
    process.exit(rejected ? 1 : 0);
  }
  process.exit(rejected ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
