import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  detectMacosDmgArch,
  findMacosDmgs,
  findMacosPackageArtifactViolations,
} from './verify-macos-package-artifacts.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

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
});
