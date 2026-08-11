#!/usr/bin/env node

/**
 * Packaged preload presence verifier.
 * Proves lib/preload/index.js and every CommonJS chunk it requires are included.
 * Presence is not execution — pair with Todo 7's built-CJS Playwright fixture.
 *
 * Usage:
 *   bun scripts/verify-packaged-preload.js --dist dist
 *   bun scripts/verify-packaged-preload.js --root path/to/app
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const REQUIRE_RE = /require\((['"])([^'"]+)\1\)/g;

export function collectRequiredSpecifiers(source) {
  const specs = new Set();
  for (const match of source.matchAll(REQUIRE_RE)) {
    const spec = match[2];
    if (spec && (spec.startsWith('./') || spec.startsWith('../'))) {
      specs.add(spec);
    }
  }
  return [...specs];
}

export function resolvePreloadRoot(searchRoot) {
  const candidates = [
    path.join(searchRoot, 'lib/preload/index.js'),
    path.join(searchRoot, 'Contents/Resources/app/lib/preload/index.js'),
    path.join(searchRoot, 'resources/app/lib/preload/index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // electron-builder unpacked asar-less or Resources/app.asar.unpacked
  if (fs.existsSync(searchRoot) && fs.statSync(searchRoot).isDirectory()) {
    const stack = [searchRoot];
    while (stack.length > 0) {
      const dir = stack.pop();
      if (!dir) continue;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === 'index.js' && dir.endsWith(`${path.sep}preload`)) {
          return full;
        }
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
          stack.push(full);
        }
      }
    }
  }
  return null;
}

export function verifyPackagedPreload(searchRoot) {
  const entry = resolvePreloadRoot(searchRoot);
  if (!entry) {
    return {
      ok: false,
      error: `missing lib/preload/index.js under ${searchRoot}`,
      entry: null,
      missing: [],
    };
  }
  const source = fs.readFileSync(entry, 'utf8');
  const specs = collectRequiredSpecifiers(source);
  const missing = [];
  for (const spec of specs) {
    const resolved = path.resolve(path.dirname(entry), spec);
    const withJs = resolved.endsWith('.js') ? resolved : `${resolved}.js`;
    if (!fs.existsSync(resolved) && !fs.existsSync(withJs)) {
      missing.push(spec);
    }
  }
  return {
    ok: missing.length === 0,
    entry,
    required: specs,
    missing,
    error: missing.length === 0 ? null : `missing preload chunks: ${missing.join(', ')}`,
  };
}

function parseArgs(argv) {
  const args = { dist: null, root: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dist') args.dist = argv[i + 1];
    if (argv[i] === '--root') args.root = argv[i + 1];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const searchRoot = args.root
    ? path.resolve(args.root)
    : args.dist
      ? path.resolve(args.dist)
      : path.join(repoRoot, 'lib');
  const result = verifyPackagedPreload(searchRoot);
  if (!result.ok) {
    console.error(`[verify-packaged-preload] FAIL ${result.error}`);
    process.exit(1);
  }
  console.log(`[verify-packaged-preload] OK entry=${result.entry}`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
