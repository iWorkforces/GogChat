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
  detectWindowsInstallerArch,
  findWindowsInstallers,
  findWindowsPackageArtifactViolations,
} from './verify-windows-package-artifacts.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SHA = 'b'.repeat(40);
const PACKAGE_VERSION = '3.15.1';

describe('verify-windows-package-artifacts helpers', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-win-artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('detects Electron builder x64 and arm64 installer artifact names', () => {
    expect(detectWindowsInstallerArch('GogChat-3.15.1-windows-x64-setup.exe')).toBe('x64');
    expect(detectWindowsInstallerArch('GogChat-3.15.1-windows-arm64-setup.exe')).toBe('arm64');
    expect(detectWindowsInstallerArch('GogChat-3.15.1-x64.exe')).toBeNull();
    expect(detectWindowsInstallerArch('GogChat-3.15.1-amd64.exe')).toBeNull();
  });

  it('lists Windows installers with stable relative paths and sizes', () => {
    const nestedDir = path.join(tmpRoot, 'win-unpacked');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.15.1-windows-arm64-setup.exe'), 'arm64');
    fs.writeFileSync(
      path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe.blockmap'),
      'blockmap'
    );

    expect(findWindowsInstallers(tmpRoot)).toEqual([
      { arch: 'x64', relativePath: 'GogChat-3.15.1-windows-x64-setup.exe', sizeBytes: 3 },
      {
        arch: 'arm64',
        relativePath: 'win-unpacked/GogChat-3.15.1-windows-arm64-setup.exe',
        sizeBytes: 5,
      },
    ]);
  });

  it('reports missing required installers and duplicate arch outputs', () => {
    const nestedDir = path.join(tmpRoot, 'duplicate');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');

    expect(findWindowsPackageArtifactViolations(tmpRoot, ['x64', 'arm64'])).toEqual([
      'Missing required Windows installer arch: arm64',
      'Duplicate Windows installer outputs for x64: duplicate/GogChat-3.15.1-windows-x64-setup.exe, GogChat-3.15.1-windows-x64-setup.exe',
    ]);
  });

  it('reports universal, ia32, amd64, and non-NSIS Windows outputs', () => {
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-arm64-setup.exe'), 'arm64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-universal-setup.exe'), 'universal');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-ia32-setup.exe'), 'ia32');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-amd64-setup.exe'), 'amd64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64.msi'), 'msi');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-arm64.zip'), 'zip');

    expect(findWindowsPackageArtifactViolations(tmpRoot, ['x64', 'arm64'])).toEqual([
      'Forbidden Windows artifact arch label "amd64" in GogChat-3.15.1-windows-amd64-setup.exe',
      'Forbidden Windows artifact arch label "ia32" in GogChat-3.15.1-windows-ia32-setup.exe',
      'Forbidden Windows artifact arch label "universal" in GogChat-3.15.1-windows-universal-setup.exe',
      'Forbidden Windows package artifact type in GogChat-3.15.1-windows-arm64.zip',
      'Forbidden Windows package artifact type in GogChat-3.15.1-windows-x64.msi',
    ]);
  });

  it('prints an empty manifest when artifacts have not been generated yet', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/verify-windows-package-artifacts.js', '--dist', tmpRoot, '--manifest'],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ installers: [] });
  });

  it('prints CLI help without requiring package artifacts', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/verify-windows-package-artifacts.js', '--help'],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: bun scripts/verify-windows-package-artifacts.js');
    expect(result.stdout).toContain('--require-arch <x64|arm64>');
  });

  it('writes one deterministic sidecar after filename and architecture checks succeed', () => {
    const installerName = 'GogChat-3.15.1-windows-x64-setup.exe';
    const installerPath = path.join(tmpRoot, installerName);
    fs.writeFileSync(installerPath, 'x64-setup');

    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-windows-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--manifest',
        '--require-arch',
        'x64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );

    expect(result.status).toBe(0);
    const sidecarPath = `${installerPath}.json`;
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const parsed = parseReleaseArtifactSidecar(
      fs.readFileSync(sidecarPath, 'utf-8'),
      `${installerName}.json`
    );
    expect(parsed).toEqual({
      ok: true,
      sidecar: {
        schemaVersion: RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
        sourceSha: SOURCE_SHA,
        packageVersion: PACKAGE_VERSION,
        platform: 'windows',
        arch: 'x64',
        basename: installerName,
        size: 9,
        sha256: sha256File(installerPath),
      },
    });
    expect(fs.readFileSync(sidecarPath, 'utf-8')).toBe(
      serializeReleaseArtifactSidecar(parsed.sidecar)
    );
  });

  it('does not write sidecars when filename or architecture checks fail', () => {
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');

    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-windows-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'arm64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing required Windows installer arch: arm64');
    expect(fs.readdirSync(tmpRoot).filter((name) => name.endsWith('.json'))).toEqual([]);
  });

  it('validates an existing matching sidecar and rejects a tampered size', () => {
    const installerName = 'GogChat-3.15.1-windows-arm64-setup.exe';
    const installerPath = path.join(tmpRoot, installerName);
    fs.writeFileSync(installerPath, 'arm64-setup');
    const created = spawnSync(
      process.execPath,
      [
        'scripts/verify-windows-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'arm64',
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
        'scripts/verify-windows-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'arm64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );
    expect(matching.status).toBe(0);

    const sidecarPath = `${installerPath}.json`;
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    sidecar.size = sidecar.size + 1;
    fs.writeFileSync(sidecarPath, serializeReleaseArtifactSidecar(sidecar));

    const tampered = spawnSync(
      process.execPath,
      [
        'scripts/verify-windows-package-artifacts.js',
        '--dist',
        tmpRoot,
        '--require-arch',
        'arm64',
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      { cwd: PROJECT_ROOT, encoding: 'utf-8' }
    );
    expect(tampered.status).toBe(1);
    expect(tampered.stderr).toContain(`Size-mismatched sidecar ${installerName}.json`);
  });
});
