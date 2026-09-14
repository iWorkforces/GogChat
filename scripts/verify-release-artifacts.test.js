import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
  serializeReleaseArtifactSidecar,
} from './release-artifact-sidecar.js';
import { findReleaseArtifactViolations } from './verify-release-artifacts.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_SHA = 'c'.repeat(40);
const PACKAGE_VERSION = '3.15.1';
const IDENTITY = { sourceSha: SOURCE_SHA, packageVersion: PACKAGE_VERSION };

const ARTIFACTS = {
  macArm: { name: 'GogChat-3.15.1-arm64.dmg', contents: 'arm64', platform: 'macos', arch: 'arm64' },
  macX64: { name: 'GogChat-3.15.1-x64.dmg', contents: 'x64', platform: 'macos', arch: 'x64' },
  winX64: {
    name: 'GogChat-3.15.1-windows-x64-setup.exe',
    contents: 'win-x64',
    platform: 'windows',
    arch: 'x64',
  },
  winArm: {
    name: 'GogChat-3.15.1-windows-arm64-setup.exe',
    contents: 'win-arm64',
    platform: 'windows',
    arch: 'arm64',
  },
};

function writeBinary(dir, artifact, contents = artifact.contents) {
  const filePath = path.join(dir, artifact.name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

function sidecarFor(artifact, contents, overrides = {}) {
  const body = contents ?? artifact.contents;
  return {
    schemaVersion: RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
    sourceSha: SOURCE_SHA,
    packageVersion: PACKAGE_VERSION,
    platform: artifact.platform,
    arch: artifact.arch,
    basename: artifact.name,
    size: Buffer.byteLength(body),
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
    ...overrides,
  };
}

function writeSidecar(dir, artifact, overrides = {}, contents = artifact.contents) {
  fs.writeFileSync(
    path.join(dir, `${artifact.name}.json`),
    serializeReleaseArtifactSidecar(sidecarFor(artifact, contents, overrides))
  );
}

function writeCompleteSet(dir) {
  for (const artifact of Object.values(ARTIFACTS)) {
    writeBinary(dir, artifact);
    writeSidecar(dir, artifact);
  }
}

describe('verify-release-artifacts aggregation helper', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-release-artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('accepts one macOS DMG, one Windows setup, and one sidecar per official architecture', () => {
    writeCompleteSet(tmpRoot);

    expect(findReleaseArtifactViolations(tmpRoot, IDENTITY)).toEqual([]);
  });

  it('reports missing macOS arch when only arm64 DMG is present', () => {
    writeBinary(tmpRoot, ARTIFACTS.macArm);
    writeSidecar(tmpRoot, ARTIFACTS.macArm);
    writeBinary(tmpRoot, ARTIFACTS.winX64);
    writeSidecar(tmpRoot, ARTIFACTS.winX64);
    writeBinary(tmpRoot, ARTIFACTS.winArm);
    writeSidecar(tmpRoot, ARTIFACTS.winArm);

    expect(findReleaseArtifactViolations(tmpRoot, IDENTITY)).toEqual([
      'Missing required macOS DMG arch: x64',
    ]);
  });

  it('reports missing macOS/Windows arches, duplicate filenames, and forbidden outputs', () => {
    const nestedDir = path.join(tmpRoot, 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.15.1-windows-x64-setup.exe'), 'duplicate');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-ia32-setup.exe'), 'ia32');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-amd64.dmg'), 'bad');

    expect(findReleaseArtifactViolations(tmpRoot, IDENTITY)).toEqual([
      'Missing required macOS DMG arch: arm64',
      'Missing required macOS DMG arch: x64',
      'Missing required Windows installer arch: arm64',
      'Duplicate release artifact filename: GogChat-3.15.1-windows-x64-setup.exe',
      'Forbidden macOS artifact arch label "amd64" in GogChat-3.15.1-amd64.dmg',
      'Duplicate Windows installer outputs for x64: GogChat-3.15.1-windows-x64-setup.exe, nested/GogChat-3.15.1-windows-x64-setup.exe',
      'Forbidden Windows artifact arch label "ia32" in GogChat-3.15.1-windows-ia32-setup.exe',
      'Missing sidecar for GogChat-3.15.1-windows-x64-setup.exe',
    ]);
  });

  it('rejects missing, duplicate, and orphaned sidecars', () => {
    writeCompleteSet(tmpRoot);
    fs.unlinkSync(path.join(tmpRoot, `${ARTIFACTS.macX64.name}.json`));
    const extraDir = path.join(tmpRoot, 'extra');
    fs.mkdirSync(extraDir, { recursive: true });
    fs.copyFileSync(
      path.join(tmpRoot, `${ARTIFACTS.macArm.name}.json`),
      path.join(extraDir, `${ARTIFACTS.macArm.name}.json`)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'GogChat-3.15.1-orphan.dmg.json'),
      serializeReleaseArtifactSidecar(
        sidecarFor(ARTIFACTS.macArm, ARTIFACTS.macArm.contents, {
          basename: 'GogChat-3.15.1-orphan.dmg',
        })
      )
    );

    const violations = findReleaseArtifactViolations(tmpRoot, IDENTITY);
    expect(violations).toContain(
      'Duplicate release artifact filename: GogChat-3.15.1-arm64.dmg.json'
    );
    expect(violations).toContain('Missing sidecar for GogChat-3.15.1-x64.dmg');
    expect(violations).toContain(
      'Duplicate sidecar for GogChat-3.15.1-arm64.dmg: extra/GogChat-3.15.1-arm64.dmg.json, GogChat-3.15.1-arm64.dmg.json'
    );
    expect(violations).toContain('Orphaned sidecar: GogChat-3.15.1-orphan.dmg.json');
  });

  it('rejects malformed, cross-source, cross-version, and mismatched sidecar evidence', () => {
    writeCompleteSet(tmpRoot);
    fs.writeFileSync(path.join(tmpRoot, `${ARTIFACTS.macArm.name}.json`), '{not-json');
    writeSidecar(tmpRoot, ARTIFACTS.macX64, { sourceSha: 'd'.repeat(40) });
    writeSidecar(tmpRoot, ARTIFACTS.winX64, { packageVersion: '9.9.9' });
    writeSidecar(tmpRoot, ARTIFACTS.winArm, { arch: 'x64' });

    const violations = findReleaseArtifactViolations(tmpRoot, IDENTITY);
    expect(violations).toContain(`Malformed sidecar ${ARTIFACTS.macArm.name}.json: invalid JSON`);
    expect(violations).toContain(
      `Cross-source sidecar ${ARTIFACTS.macX64.name}.json: expected ${SOURCE_SHA}, got ${'d'.repeat(40)}`
    );
    expect(violations).toContain(
      `Cross-version sidecar ${ARTIFACTS.winX64.name}.json: expected ${PACKAGE_VERSION}, got 9.9.9`
    );
    expect(violations).toContain(
      `Architecture-mismatched sidecar ${ARTIFACTS.winArm.name}.json: expected arm64, got x64`
    );
  });

  it('rejects size and digest mismatches before copying files or writing checksums', () => {
    writeCompleteSet(tmpRoot);
    writeSidecar(tmpRoot, ARTIFACTS.macArm, { size: 999 });
    writeSidecar(tmpRoot, ARTIFACTS.macX64, { sha256: 'e'.repeat(64) });
    const outputDir = path.join(tmpRoot, 'verified');

    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-release-artifacts.js',
        '--input',
        tmpRoot,
        '--output',
        outputDir,
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Size-mismatched sidecar ${ARTIFACTS.macArm.name}.json: expected 5, got 999`
    );
    expect(result.stderr).toContain(
      `Digest-mismatched sidecar ${ARTIFACTS.macX64.name}.json: expected ${crypto
        .createHash('sha256')
        .update('x64')
        .digest('hex')}, got ${'e'.repeat(64)}`
    );
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it('copies verified release assets and writes SHA-256 checksums from the output bytes', () => {
    const outputDir = path.join(tmpRoot, 'verified');
    writeCompleteSet(tmpRoot);

    const result = spawnSync(
      process.execPath,
      [
        'scripts/verify-release-artifacts.js',
        '--input',
        tmpRoot,
        '--output',
        outputDir,
        '--source-sha',
        SOURCE_SHA,
        '--package-version',
        PACKAGE_VERSION,
      ],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(fs.readdirSync(outputDir).sort()).toEqual([
      'GogChat-3.15.1-arm64.dmg',
      'GogChat-3.15.1-arm64.dmg.json',
      'GogChat-3.15.1-windows-arm64-setup.exe',
      'GogChat-3.15.1-windows-arm64-setup.exe.json',
      'GogChat-3.15.1-windows-x64-setup.exe',
      'GogChat-3.15.1-windows-x64-setup.exe.json',
      'GogChat-3.15.1-x64.dmg',
      'GogChat-3.15.1-x64.dmg.json',
      'SHA256SUMS.txt',
    ]);
    const checksums = fs.readFileSync(path.join(outputDir, 'SHA256SUMS.txt'), 'utf-8');
    const dmgDigest = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(outputDir, 'GogChat-3.15.1-x64.dmg')))
      .digest('hex');
    const installerDigest = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(outputDir, 'GogChat-3.15.1-windows-x64-setup.exe')))
      .digest('hex');
    expect(checksums).toContain(`${dmgDigest}  GogChat-3.15.1-x64.dmg`);
    expect(checksums).toContain(`${installerDigest}  GogChat-3.15.1-windows-x64-setup.exe`);
  });

  it('requires source SHA and package version on the CLI', () => {
    writeCompleteSet(tmpRoot);
    const result = spawnSync(
      process.execPath,
      ['scripts/verify-release-artifacts.js', '--input', tmpRoot],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--source-sha requires a 40-character hex object id');
  });
});
