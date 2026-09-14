import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
  parseReleaseArtifactSidecar,
  serializeReleaseArtifactSidecar,
  sha256File,
} from './release-artifact-sidecar.js';
import {
  detectMacosDmgArch,
  findMacosDmgs,
  findMacosPackageArtifactViolations,
} from './verify-macos-package-artifacts.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SHA = 'a'.repeat(40);
const PACKAGE_VERSION = '3.17.0';

describe('verify-macos-package-artifacts', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-macos-artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('detects Electron builder arm64 and x64 DMG artifact names', () => {
    expect(detectMacosDmgArch('GogChat-3.17.0-arm64.dmg')).toBe('arm64');
    expect(detectMacosDmgArch('GogChat-3.17.0-x64.dmg')).toBe('x64');
    expect(detectMacosDmgArch('GogChat-3.17.0-windows-x64-setup.exe')).toBeNull();
    expect(detectMacosDmgArch('GogChat-3.17.0-amd64.dmg')).toBeNull();
    expect(detectMacosDmgArch('GogChat-3.17.0.dmg')).toBeNull();
  });

  it('finds DMGs under nested dist paths', () => {
    const nestedDir = path.join(tmpRoot, 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-arm64.dmg'), 'arm64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.17.0-x64.dmg'), 'x64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-arm64.dmg.blockmap'), 'map');

    expect(findMacosDmgs(tmpRoot)).toEqual([
      { arch: 'arm64', relativePath: 'GogChat-3.17.0-arm64.dmg', sizeBytes: 5 },
      {
        arch: 'x64',
        relativePath: 'nested/GogChat-3.17.0-x64.dmg',
        sizeBytes: 3,
      },
    ]);
  });

  it('reports missing required arches, duplicates, and forbidden labels', () => {
    const nestedDir = path.join(tmpRoot, 'duplicate');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-arm64.dmg'), 'arm64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.17.0-arm64.dmg'), 'dup');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-amd64.dmg'), 'bad');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-universal.dmg'), 'uni');

    expect(findMacosPackageArtifactViolations(tmpRoot, ['arm64', 'x64'])).toEqual([
      'Missing required macOS DMG arch: x64',
      'Duplicate macOS DMG outputs for arm64: duplicate/GogChat-3.17.0-arm64.dmg, GogChat-3.17.0-arm64.dmg',
      'Forbidden macOS artifact arch label "amd64" in GogChat-3.17.0-amd64.dmg',
      'Forbidden macOS artifact arch label "universal" in GogChat-3.17.0-universal.dmg',
    ]);
  });

  it('accepts both official arches with no violations', () => {
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-arm64.dmg'), 'arm64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-x64.dmg'), 'x64');

    expect(findMacosPackageArtifactViolations(tmpRoot, ['arm64', 'x64'])).toEqual([]);
  });

  it('exposes --require-arch help and fails when a required arch is missing', () => {
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-arm64.dmg'), 'arm64');

    const help = spawnSync(
      process.execPath,
      ['scripts/verify-macos-package-artifacts.js', '--help'],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--require-arch <arm64|x64>');

    const missing = spawnSync(
      process.execPath,
      [
        'scripts/verify-macos-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--manifest',
        '--require-arch',
        'x64',
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('Missing required macOS DMG arch: x64');
  });

  it('writes one deterministic sidecar after filename and architecture checks succeed', () => {
    const dmgName = 'GogChat-3.17.0-arm64.dmg';
    const dmgPath = path.join(tmpRoot, dmgName);
    fs.writeFileSync(dmgPath, 'arm64-bytes');

    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-macos-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--manifest',
        '--require-arch',
        'arm64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );

    expect(result.status).toBe(0);
    const sidecarPath = `${dmgPath}.json`;
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const parsed = parseReleaseArtifactSidecar(
      fs.readFileSync(sidecarPath, 'utf-8'),
      `${dmgName}.json`
    );
    expect(parsed).toEqual({
      ok: true,
      sidecar: {
        schemaVersion: RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
        sourceSha: SOURCE_SHA,
        packageVersion: PACKAGE_VERSION,
        platform: 'macos',
        arch: 'arm64',
        basename: dmgName,
        size: 11,
        sha256: sha256File(dmgPath),
      },
    });
    expect(fs.readFileSync(sidecarPath, 'utf-8')).toBe(
      serializeReleaseArtifactSidecar(parsed.sidecar)
    );
  });

  it('does not write sidecars when filename or architecture checks fail', () => {
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.17.0-arm64.dmg'), 'arm64');

    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-macos-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'x64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing required macOS DMG arch: x64');
    expect(fs.readdirSync(tmpRoot).filter((name) => name.endsWith('.json'))).toEqual([]);
  });

  it('validates an existing matching sidecar and rejects a tampered digest', () => {
    const dmgName = 'GogChat-3.17.0-x64.dmg';
    const dmgPath = path.join(tmpRoot, dmgName);
    fs.writeFileSync(dmgPath, 'x64-bytes');
    const created = spawnSync(
      process.execPath,
      [
        'scripts/verify-macos-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'x64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );
    expect(created.status).toBe(0);

    const matching = spawnSync(
      process.execPath,
      [
        'scripts/verify-macos-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'x64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );
    expect(matching.status).toBe(0);

    const sidecarPath = `${dmgPath}.json`;
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    sidecar.sha256 = 'b'.repeat(64);
    fs.writeFileSync(sidecarPath, serializeReleaseArtifactSidecar(sidecar));

    const tampered = spawnSync(
      process.execPath,
      [
        'scripts/verify-macos-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'x64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toContain(`Digest-mismatched sidecar ${dmgName}.json`);
  });
});
