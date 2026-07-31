#!/usr/bin/env bun
/**
 * check-doc-claims.js
 *
 * CI audit: verify AGENTS.md claims against actual source code.
 *
 * Checks:
 *   1. Singleton compliance: every `export function getXxx` in src/main/utils
 *      should have a matching `export function destroyXxx` (with allowlist).
 *   2. Lazy require: src/main/initializers/registerGlobalCleanups.ts is documented
 *      to lazy-import cleanup owners — verify at least one `require(` exists.
 *   3. Branded type usage: `asValidatedURL` and `asFeatureName` should be
 *      imported somewhere outside their definition file.
 *   4. Feature-to-feature imports: no relative `from './sibling'` imports
 *      between files in src/main/features (excluding menuActionRegistry.ts
 *      and *.test.ts).
 *
 * Exit 0 on full compliance, exit 1 with diagnostics otherwise.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, basename } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const UTILS_DIR = join(ROOT, 'src/main/utils');
const FEATURES_DIR = join(ROOT, 'src/main/features');
const SHARED_DIR = join(ROOT, 'src/shared');
const SRC_DIR = join(ROOT, 'src');

// Singletons that intentionally have no destroyer (stateless / process-lifetime).
// Update sparingly with justification in a comment.
const SINGLETON_DESTROYER_EXEMPT = new Set([
  // Stateless or process-lifetime accessors — no teardown needed.
  // Add entries here ONLY with rationale.
  //
  // ── Pure store/file readers (no module-level state) ──────────────────────
  'windowUtils.ts:getWindowDefaults', // reads electron-store on each call
  'cdpMetrics.ts:getMetrics', // reads per-account JSON file on each call
  'secureFlags.ts:getDisableCertPinning', // reads encrypted blob on each call
  'secureFlags.ts:getDisableCdpTelemetry', // reads encrypted blob on each call
  'accountLabelStore.ts:getStoredAccountLabel', // reads app.accountLabels config on each call
  'accountLabelStore.ts:getAllStoredAccountLabels', // reads app.accountLabels config on each call
  //
  // ── Pure wrappers around process / electron globals ───────────────────────
  'cspHeaderHandler.ts:getHostname', // pure URL parser, no state
  'platformHelpers.ts:getAppPath', // wraps app.getAppPath(), no state
  'logger.ts:getLogPath', // wraps electron-log file transport, no state
  //
  // ── Pure delegates to other singletons (own state lives elsewhere) ────────
  'trayIconState.ts:getTrayIconImage', // delegates to iconCache singleton
  'trayIconState.ts:getTrayUnreadImage', // delegates to iconCache singleton
  'accountWindowManager.ts:getMostRecentWindow', // delegates to manager singleton
  'accountWindowManager.ts:getWindowForAccount', // delegates to manager singleton
  'accountWindowManager.ts:getAccountIndex', // delegates to manager singleton
  'accountWindowManager.ts:getAccountForWebContents', // delegates to manager singleton
  //
  // ── Pure free helpers (no module-level singleton state) ────────────────────
  'accountNavigation.ts:getAccountURL', // pure WC helper; no process singleton
  //
  // ── Diagnostic/accessor functions (state cleared by sibling APIs) ────────
  'bootstrapTracker.ts:getBootstrapAccounts', // accessor; state cleared by clearAllBootstrap()
  'featureContextStore.ts:getSharedFeatureContext', // paired with setSharedFeatureContext({})
  'featureRunner.ts:getSummary', // diagnostic accessor; state cleared by cleanupAll()
]);

const FEATURE_IMPORT_EXEMPT = new Set(['menuActionRegistry.ts']);

/** @type {{level: 'error'|'warn', code: string, message: string}[]} */
const findings = [];

function err(code, message) {
  findings.push({ level: 'error', code, message });
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function listTs(dir, { excludeTests = true } = {}) {
  const result = [];
  for (const file of walk(dir)) {
    if (!file.endsWith('.ts')) continue;
    if (excludeTests && (file.endsWith('.test.ts') || file.endsWith('.d.ts'))) continue;
    result.push(file);
  }
  return result;
}

// ── Check 1: singleton compliance ────────────────────────────────────────────
function checkSingletonCompliance() {
  const utilFiles = listTs(UTILS_DIR);
  const getRe = /^export\s+function\s+(get[A-Z]\w*)\s*\(/gm;
  const destroyRe = /^export\s+function\s+(destroy[A-Z]\w*)\s*\(/gm;

  let totalGetters = 0;
  let totalMatched = 0;

  for (const file of utilFiles) {
    const src = readFileSync(file, 'utf8');
    const getters = new Set();
    const destroyers = new Set();
    for (const m of src.matchAll(getRe)) getters.add(m[1]);
    for (const m of src.matchAll(destroyRe)) destroyers.add(m[1]);

    for (const g of getters) {
      totalGetters++;
      // Convert `getFooBar` → `destroyFooBar`
      const expected = 'destroy' + g.slice(3);
      const fname = basename(file);
      if (destroyers.has(expected)) {
        totalMatched++;
        continue;
      }
      if (SINGLETON_DESTROYER_EXEMPT.has(`${fname}:${g}`)) {
        totalMatched++;
        continue;
      }
      err(
        'SINGLETON_GAP',
        `${relative(ROOT, file)}: \`${g}()\` has no matching \`${expected}()\`. ` +
          `AGENTS.md claims "All singleton managers expose getXxx() factory + destroyXxx() cleanup".`
      );
    }
  }

  return { totalGetters, totalMatched };
}

// ── Check 2: global cleanup lazy require ─────────────────────────────────────
function checkGlobalCleanupLazyRequire() {
  const file = join(ROOT, 'src/main/initializers/registerGlobalCleanups.ts');
  const src = readFileSync(file, 'utf8');
  // Strip line comments and block comments before checking.
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  if (!/\brequire\s*\(/.test(stripped)) {
    err(
      'LAZY_REQUIRE_MISSING',
      `src/main/initializers/registerGlobalCleanups.ts has no \`require(...)\` calls, ` +
        `but AGENTS.md claims cleanup owners are lazy-imported to avoid startup coupling.`
    );
  }
}

// ── Check 3: branded type usage ──────────────────────────────────────────────
function checkBrandedTypeUsage() {
  const targets = [
    { name: 'asValidatedURL', defFile: 'src/shared/types/branded.ts' },
    { name: 'asFeatureName', defFile: 'src/shared/types/branded.ts' },
  ];

  /** @type {Map<string, number>} */
  const usage = new Map(targets.map((t) => [t.name, 0]));

  for (const file of walk(SRC_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const src = readFileSync(file, 'utf8');
    for (const t of targets) {
      if (rel === t.defFile) continue; // skip definition file
      // Match identifier usage anywhere outside the definition file.
      const re = new RegExp(`\\b${t.name}\\b`, 'g');
      const matches = src.match(re);
      if (matches) usage.set(t.name, (usage.get(t.name) || 0) + matches.length);
    }
  }

  for (const t of targets) {
    const count = usage.get(t.name) || 0;
    if (count === 0) {
      err(
        'BRANDED_UNUSED',
        `Branded helper \`${t.name}\` defined in ${t.defFile} but used 0 times outside its definition file.`
      );
    }
  }
}

// ── Check 4: feature-to-feature imports ──────────────────────────────────────
function checkFeatureToFeatureImports() {
  const featureFiles = readdirSync(FEATURES_DIR).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts')
  );
  const featureBasenames = new Set(featureFiles.map((f) => f.replace(/\.ts$/, '')));

  for (const f of featureFiles) {
    if (FEATURE_IMPORT_EXEMPT.has(f)) continue;
    const file = join(FEATURES_DIR, f);
    const src = readFileSync(file, 'utf8');
    // Match: import ... from './something';  (only same-dir relative)
    const importRe = /from\s+['"](\.\/[^'"]+)['"]/g;
    for (const m of src.matchAll(importRe)) {
      const target = m[1].replace(/^\.\//, '').replace(/\.(ts|js)$/, '');
      if (featureBasenames.has(target) && !FEATURE_IMPORT_EXEMPT.has(`${target}.ts`)) {
        err(
          'FEATURE_CROSS_IMPORT',
          `${relative(ROOT, file)} imports sibling feature \`./${target}\`. ` +
            `AGENTS.md: "Never import from other features directly — use menuActionRegistry".`
        );
      }
    }
  }
}

// ── Check 5: feature spec ipcChannels references ─────────────────────────────
function checkFeatureSpecIpcChannels() {
  // Parse IPC_CHANNELS keys from src/shared/constants.ts.
  const constantsFile = join(SHARED_DIR, 'constants.ts');
  const constantsSrc = readFileSync(constantsFile, 'utf8');
  const blockMatch = constantsSrc.match(
    /export\s+const\s+IPC_CHANNELS\s*=\s*\{([\s\S]*?)\}\s*as\s+const/
  );
  const validKeys = new Set();
  if (blockMatch) {
    const keyRe = /^\s*([A-Z_][A-Z0-9_]*)\s*:/gm;
    for (const m of blockMatch[1].matchAll(keyRe)) validKeys.add(m[1]);
  }
  if (validKeys.size === 0) {
    err('IPC_CHANNELS_PARSE', `Could not parse IPC_CHANNELS keys from src/shared/constants.ts.`);
    return;
  }

  const specFiles = [
    'src/main/initializers/security.spec.ts',
    'src/main/initializers/ui.spec.ts',
    'src/main/initializers/deferred.spec.ts',
  ];
  // Match `IPC_CHANNELS.<KEY>` references inside spec files.
  const refRe = /IPC_CHANNELS\.([A-Z_][A-Z0-9_]*)/g;
  for (const rel of specFiles) {
    const file = join(ROOT, rel);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(refRe)) {
      const key = m[1];
      if (!validKeys.has(key)) {
        err(
          'IPC_CHANNEL_UNKNOWN',
          `${rel}: spec references \`IPC_CHANNELS.${key}\` which is not defined in src/shared/constants.ts.`
        );
      }
    }
  }
}

// ── Run all checks ───────────────────────────────────────────────────────────
const t0 = Date.now();
const { totalGetters, totalMatched } = checkSingletonCompliance();
checkGlobalCleanupLazyRequire();
checkBrandedTypeUsage();
checkFeatureToFeatureImports();
checkFeatureSpecIpcChannels();
const elapsed = (Date.now() - t0).toFixed(0);

const errors = findings.filter((f) => f.level === 'error');
const warns = findings.filter((f) => f.level === 'warn');

console.log(`\nDocumentation claim audit (${elapsed}ms)`);
console.log(`──────────────────────────────────────────`);
console.log(
  `Singleton compliance: ${totalMatched}/${totalGetters} (${
    totalGetters === 0 ? '0' : Math.round((totalMatched / totalGetters) * 100)
  }%)`
);

if (findings.length === 0) {
  console.log('\n✓ All AGENTS.md claims verified.\n');
  process.exit(0);
}

console.log(`\nFindings: ${errors.length} error(s), ${warns.length} warning(s)\n`);
for (const f of findings) {
  const tag = f.level === 'error' ? '✗' : '⚠';
  console.log(`${tag} [${f.code}] ${f.message}`);
}
console.log('');

process.exit(errors.length > 0 ? 1 : 0);
