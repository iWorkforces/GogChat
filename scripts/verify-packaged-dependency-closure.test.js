import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  packageNameFromSpecifier,
  extractExternalPackagesFromSource,
  extractExternalPackagesFromDir,
  parseRsbuildStringExternals,
  listPackagedPackages,
  classifyPackage,
  buildClosureReport,
} from './verify-packaged-dependency-closure.js';

describe('packageNameFromSpecifier', () => {
  it('extracts bare and scoped package names', () => {
    expect(packageNameFromSpecifier('electron-log')).toBe('electron-log');
    expect(packageNameFromSpecifier('electron-log/main')).toBe('electron-log');
    expect(packageNameFromSpecifier('@rslib/core')).toBe('@rslib/core');
    expect(packageNameFromSpecifier('@rslib/core/foo')).toBe('@rslib/core');
  });

  it('ignores relative, node builtins, and electron', () => {
    expect(packageNameFromSpecifier('./local.js')).toBeNull();
    expect(packageNameFromSpecifier('node:fs')).toBeNull();
    expect(packageNameFromSpecifier('fs')).toBeNull();
    expect(packageNameFromSpecifier('electron')).toBeNull();
    expect(packageNameFromSpecifier('electron/main')).toBeNull();
  });
});

describe('extractExternalPackagesFromSource', () => {
  it('finds static, dynamic, and require forms', () => {
    const src = `
      import log from 'electron-log';
      import('electron-store');
      const x = require('auto-launch');
      export { y } from 'electron-context-menu';
      import './relative.js';
      import 'node:path';
    `;
    const found = extractExternalPackagesFromSource(src);
    expect([...found].sort()).toEqual([
      'auto-launch',
      'electron-context-menu',
      'electron-log',
      'electron-store',
    ]);
  });
});

describe('parseRsbuildStringExternals', () => {
  it('extracts string externals only', () => {
    const cfg = `
      output: {
        externals: [
          'electron',
          /^electron\\/.*/,
          'electron-log',
          'auto-launch',
        ],
      },
    `;
    const found = parseRsbuildStringExternals(cfg);
    expect(found.has('electron-log')).toBe(true);
    expect(found.has('auto-launch')).toBe(true);
    expect(found.has('electron')).toBe(false);
  });
});

describe('listPackagedPackages + closure failure', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-closure-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('lists packages under a fixture node_modules tree', () => {
    const nm = path.join(tmp, 'node_modules');
    fs.mkdirSync(path.join(nm, 'electron-log'), { recursive: true });
    fs.mkdirSync(path.join(nm, '@scope', 'pkg'), { recursive: true });
    const pkgs = listPackagedPackages(tmp);
    expect(pkgs.has('electron-log')).toBe(true);
    expect(pkgs.has('@scope/pkg')).toBe(true);
  });

  it('fails report when a required runtime package is absent from fixture', () => {
    const libDir = path.join(tmp, 'lib', 'main');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, 'index.js'),
      `import log from 'electron-log';\nimport store from 'electron-store';\n`
    );

    const fixture = path.join(tmp, 'app');
    fs.mkdirSync(path.join(fixture, 'node_modules', 'electron-log'), { recursive: true });
    // electron-store intentionally missing

    const packageJsonPath = path.join(tmp, 'package.json');
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        version: '0.0.0-test',
        dependencies: { 'electron-log': '1', 'electron-store': '1' },
        devDependencies: { '@rspack/core': '1' },
      })
    );

    const report = buildClosureReport({
      root: tmp,
      libDir: path.join(tmp, 'lib'),
      packageJsonPath,
      rsbuildPath: path.join(tmp, 'missing-rsbuild.js'),
      fixture,
    });

    expect(report.runtimeExternals).toEqual(
      expect.arrayContaining(['electron-log', 'electron-store'])
    );
    expect(report.missingRuntime).toContain('electron-store');
    expect(report.missingRuntime).not.toContain('electron-log');
    expect(report.hash).toMatch(/^[a-f0-9]{16}$/);
    expect(report.packageVersion).toBe('0.0.0-test');
  });
});

describe('classifyPackage', () => {
  const packageJson = {
    dependencies: { 'electron-log': '1', '@rslib/core': '1' },
    devDependencies: { '@rspack/core': '1', vitest: '1' },
  };

  it('marks runtime externals as runtime-required', () => {
    const r = classifyPackage('electron-log', {
      runtimeExternals: new Set(['electron-log']),
      packageJson,
    });
    expect(r.classification).toBe('runtime-required');
  });

  it('marks @rspack as build-only when not imported', () => {
    const r = classifyPackage('@rspack/core', {
      runtimeExternals: new Set(),
      packageJson,
    });
    expect(r.classification).toBe('build-only');
  });

  it('marks @rslib/core in dependencies with no import as unresolved', () => {
    const r = classifyPackage('@rslib/core', {
      runtimeExternals: new Set(),
      packageJson,
    });
    expect(r.classification).toBe('unresolved');
  });
});

describe('extractExternalPackagesFromDir', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-libscan-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('scans nested js files', () => {
    fs.mkdirSync(path.join(tmp, 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'main.js'), `import 'electron-log';`);
    fs.writeFileSync(path.join(tmp, 'chunks', 'a.js'), `import('auto-launch')`);
    const found = extractExternalPackagesFromDir(tmp);
    expect(found.has('electron-log')).toBe(true);
    expect(found.has('auto-launch')).toBe(true);
  });
});
