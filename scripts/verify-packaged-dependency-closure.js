#!/usr/bin/env node

/**
 * Packaged runtime dependency closure verifier (performance-remediation Todo 5).
 *
 * Derives external runtime packages from:
 *   1. Emitted main/preload bundle import statements (static + dynamic)
 *   2. Rsbuild output.externals string entries
 * and compares that set with packages present under a packaged app artifact
 * (or a fixture tree). Never modifies package.json / lockfile / builder rules.
 *
 * Usage:
 *   bun scripts/verify-packaged-dependency-closure.js [--artifact path] [--fixture path]
 *   bun scripts/verify-packaged-dependency-closure.js --report path/to/report.json
 *
 * Exit codes:
 *   0 — closure consistent (all runtime externals present when artifact given)
 *   1 — missing required runtime package or unreadable inputs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

/** Packages classified explicitly for Todo 5 diagnostics. */
const TARGETED_COMPILER_PACKAGES = ['@rspack', '@ast-grep', '@rslib'];

const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
  'async_hooks',
  'diagnostics_channel',
  'inspector',
  'trace_events',
]);

/**
 * Extract package name from an import specifier.
 * `@scope/pkg/sub` → `@scope/pkg`; `pkg/sub` → `pkg`; `node:fs` / `electron` → null (builtin).
 */
export function packageNameFromSpecifier(specifier) {
  if (typeof specifier !== 'string' || !specifier) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
    return null;
  }
  if (specifier.startsWith('node:')) return null;
  if (specifier === 'electron' || specifier.startsWith('electron/')) return null;
  const bare = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
  if (NODE_BUILTINS.has(bare)) return null;
  return bare || null;
}

/**
 * Structurally search source text for import/require/dynamic-import forms.
 * Returns unique package names (not relative / node / electron).
 */
export function extractExternalPackagesFromSource(source) {
  const found = new Set();
  const patterns = [
    // import ... from 'x' / import 'x'
    /\bimport\s+(?:[^'"\n]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    // export ... from 'x'
    /\bexport\s+(?:[^'"\n]+?\s+from\s+)['"]([^'"]+)['"]/g,
    // require('x')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // import('x') dynamic
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const pkg = packageNameFromSpecifier(m[1]);
      if (pkg) found.add(pkg);
    }
  }
  return found;
}

/**
 * Walk a directory tree and collect external package names from .js files.
 */
export function extractExternalPackagesFromDir(dir) {
  const found = new Set();
  if (!fs.existsSync(dir)) return found;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        try {
          const src = fs.readFileSync(full, 'utf8');
          for (const pkg of extractExternalPackagesFromSource(src)) {
            found.add(pkg);
          }
        } catch {
          /* skip unreadable */
        }
      }
    }
  }
  return found;
}

/**
 * Parse string externals from rsbuild.config.js without evaluating it.
 * Only string-literal externals count as package names (comments stripped first).
 */
export function parseRsbuildStringExternals(configSource) {
  const found = new Set();
  // Match string entries inside externals: [ ... ]
  const block = configSource.match(/externals\s*:\s*\[([\s\S]*?)\]/);
  if (!block) return found;
  // Strip line and block comments so examples like 'throttle-debounce' in
  // comments are not treated as runtime externals.
  const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const re = /['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const pkg = packageNameFromSpecifier(m[1]);
    if (pkg) found.add(pkg);
  }
  return found;
}

/**
 * List top-level package directories present under a packaged app or fixture.
 * Supports:
 *   - macOS .app: Contents/Resources/app/node_modules or app.asar.unpacked
 *   - plain fixture: node_modules/
 *   - asar-extracted tree
 */
export function listPackagedPackages(artifactRoot) {
  const candidates = [
    path.join(artifactRoot, 'Contents', 'Resources', 'app', 'node_modules'),
    path.join(artifactRoot, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules'),
    path.join(artifactRoot, 'resources', 'app', 'node_modules'),
    path.join(artifactRoot, 'resources', 'app.asar.unpacked', 'node_modules'),
    path.join(artifactRoot, 'node_modules'),
  ];
  const present = new Set();
  for (const nm of candidates) {
    if (!fs.existsSync(nm)) continue;
    for (const entry of fs.readdirSync(nm, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('@')) {
        const scopeDir = path.join(nm, entry.name);
        for (const nested of fs.readdirSync(scopeDir, { withFileTypes: true })) {
          if (nested.isDirectory()) present.add(`${entry.name}/${nested.name}`);
        }
      } else {
        present.add(entry.name);
      }
    }
  }
  return present;
}

/**
 * Classify a package as runtime-required, build-only, or unresolved.
 */
export function classifyPackage(pkg, { runtimeExternals, packageJson }) {
  const deps = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.optionalDependencies || {}),
  ]);
  const devDeps = new Set(Object.keys(packageJson.devDependencies || {}));

  if (runtimeExternals.has(pkg)) {
    return {
      classification: 'runtime-required',
      reason: 'imported by emitted main/preload or listed as string external',
    };
  }
  // Scope prefix match for targeted compiler packages
  const scopeHit = TARGETED_COMPILER_PACKAGES.some(
    (scope) => pkg === scope || pkg.startsWith(scope + '/')
  );
  if (
    scopeHit ||
    pkg.startsWith('@rspack/') ||
    pkg.startsWith('@rslib/') ||
    pkg.startsWith('@ast-grep/')
  ) {
    if (deps.has(pkg)) {
      return {
        classification: 'unresolved',
        reason: 'compiler package listed in dependencies but no runtime consumer found',
      };
    }
    return {
      classification: 'build-only',
      reason: 'compiler toolchain package with no runtime import consumer',
    };
  }
  if (deps.has(pkg)) {
    return {
      classification: 'unresolved',
      reason: 'in dependencies but not observed as runtime external import',
    };
  }
  if (devDeps.has(pkg)) {
    return {
      classification: 'build-only',
      reason: 'devDependency only',
    };
  }
  return {
    classification: 'unresolved',
    reason: 'not in package.json and not observed as runtime import',
  };
}

/**
 * Build the full closure report.
 */
export function buildClosureReport(options = {}) {
  const root = options.root || repoRoot;
  const libDir = options.libDir || path.join(root, 'lib');
  const packageJsonPath = options.packageJsonPath || path.join(root, 'package.json');
  const rsbuildPath = options.rsbuildPath || path.join(root, 'rsbuild.config.js');
  const artifact = options.artifact || null;
  const fixture = options.fixture || null;

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const rsbuildSource = fs.existsSync(rsbuildPath) ? fs.readFileSync(rsbuildPath, 'utf8') : '';

  const fromEmitted = extractExternalPackagesFromDir(libDir);
  const fromExternals = parseRsbuildStringExternals(rsbuildSource);
  const runtimeExternals = new Set([...fromEmitted, ...fromExternals]);

  // Also scan package.json dependency names for targeted classification
  const allNamed = new Set([
    ...runtimeExternals,
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ]);

  const classifications = {};
  for (const pkg of [...allNamed].sort()) {
    classifications[pkg] = classifyPackage(pkg, { runtimeExternals, packageJson });
  }

  // Targeted compiler packages always appear in the report
  for (const scope of TARGETED_COMPILER_PACKAGES) {
    const matching = [...allNamed].filter((p) => p === scope || p.startsWith(scope + '/'));
    if (matching.length === 0) {
      classifications[scope] = {
        classification: 'build-only',
        reason: 'no package with this scope present in package.json or emitted imports',
      };
    }
  }

  const packageTree = artifact || fixture;
  let packaged = new Set();
  let packageTreeKind = null;
  if (packageTree) {
    packageTreeKind = artifact ? 'artifact' : 'fixture';
    packaged = listPackagedPackages(packageTree);
  }

  const missingRuntime = [];
  for (const pkg of runtimeExternals) {
    if (packageTree && !packaged.has(pkg)) {
      missingRuntime.push(pkg);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    packageVersion: packageJson.version,
    artifact: artifact || null,
    fixture: fixture || null,
    packageTreeKind,
    runtimeExternals: [...runtimeExternals].sort(),
    emittedImports: [...fromEmitted].sort(),
    rsbuildStringExternals: [...fromExternals].sort(),
    packagedPackages: packageTree ? [...packaged].sort() : null,
    missingRuntime: missingRuntime.sort(),
    classifications,
    hash: '',
  };
  report.hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(report))
    .digest('hex')
    .slice(0, 16);
  return report;
}

function parseArgs(argv) {
  const out = { artifact: null, fixture: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artifact') out.artifact = argv[++i];
    else if (a === '--fixture') out.fixture = argv[++i];
    else if (a === '--report') out.report = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: verify-packaged-dependency-closure.js [--artifact path] [--fixture path] [--report path]\n'
    );
    process.exit(0);
  }

  const report = buildClosureReport({
    artifact: args.artifact,
    fixture: args.fixture,
  });

  const reportPath =
    args.report ||
    path.join(repoRoot, '.omo', 'evidence', 'performance-remediation', 'task-5-closure.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`[closure] Report written: ${reportPath}\n`);
  process.stdout.write(
    `[closure] runtimeExternals=${report.runtimeExternals.length} missing=${report.missingRuntime.length}\n`
  );

  for (const scope of TARGETED_COMPILER_PACKAGES) {
    const entries = Object.entries(report.classifications).filter(
      ([name]) => name === scope || name.startsWith(scope + '/')
    );
    for (const [name, info] of entries) {
      process.stdout.write(`[closure] ${name}: ${info.classification} — ${info.reason}\n`);
    }
  }

  if ((args.artifact || args.fixture) && report.missingRuntime.length > 0) {
    process.stderr.write(
      `[closure] FAIL: missing runtime packages: ${report.missingRuntime.join(', ')}\n`
    );
    process.exit(1);
  }

  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
