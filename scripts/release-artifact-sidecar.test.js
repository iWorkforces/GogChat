import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
  buildReleaseArtifactSidecar,
  compareReleaseArtifactSidecar,
  parseReleaseArtifactSidecar,
  serializeReleaseArtifactSidecar,
} from './release-artifact-sidecar.js';

const SOURCE_SHA = 'f'.repeat(40);

describe('release-artifact-sidecar', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-sidecar-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('builds a deterministic sidecar from the producer file and release identity', () => {
    const filePath = path.join(tmpRoot, 'GogChat-3.21.4-arm64.dmg');
    fs.writeFileSync(filePath, 'payload');

    const sidecar = buildReleaseArtifactSidecar({
      sourceSha: SOURCE_SHA.toUpperCase(),
      packageVersion: '3.21.4',
      platform: 'macos',
      arch: 'arm64',
      filePath,
    });

    expect(sidecar).toMatchObject({
      schemaVersion: RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
      sourceSha: SOURCE_SHA,
      packageVersion: '3.21.4',
      platform: 'macos',
      arch: 'arm64',
      basename: 'GogChat-3.21.4-arm64.dmg',
      size: 7,
    });
    expect(serializeReleaseArtifactSidecar(sidecar).startsWith('{\n  "schemaVersion":')).toBe(true);
  });

  it('treats invalid JSON, missing fields, and extra fields as malformed', () => {
    expect(parseReleaseArtifactSidecar('{', 'broken.json').violations).toEqual([
      'Malformed sidecar broken.json: invalid JSON',
    ]);
    expect(parseReleaseArtifactSidecar('[]', 'array.json').violations).toEqual([
      'Malformed sidecar array.json: expected an object',
    ]);
    expect(
      parseReleaseArtifactSidecar(
        JSON.stringify({
          schemaVersion: 1,
          extra: true,
        }),
        'partial.json'
      ).violations
    ).toEqual([
      'Malformed sidecar partial.json: unexpected fields extra',
      'Malformed sidecar partial.json: missing fields sourceSha, packageVersion, platform, arch, basename, size, sha256',
    ]);
  });

  it('reports field mismatches against the expected producer sidecar', () => {
    const expected = {
      schemaVersion: 1,
      sourceSha: SOURCE_SHA,
      packageVersion: '3.21.4',
      platform: 'macos',
      arch: 'arm64',
      basename: 'GogChat-3.21.4-arm64.dmg',
      size: 7,
      sha256: 'a'.repeat(64),
    };
    const actual = {
      ...expected,
      platform: 'windows',
      arch: 'x64',
      sourceSha: 'e'.repeat(40),
      packageVersion: '0.0.1',
      size: 8,
      sha256: 'b'.repeat(64),
    };

    expect(compareReleaseArtifactSidecar(actual, expected, 'file.json')).toEqual([
      'Platform-mismatched sidecar file.json: expected macos, got windows',
      'Architecture-mismatched sidecar file.json: expected arm64, got x64',
      `Cross-source sidecar file.json: expected ${SOURCE_SHA}, got ${'e'.repeat(40)}`,
      'Cross-version sidecar file.json: expected 3.21.4, got 0.0.1',
      'Size-mismatched sidecar file.json: expected 7, got 8',
      `Digest-mismatched sidecar file.json: expected ${'a'.repeat(64)}, got ${'b'.repeat(64)}`,
    ]);
  });
});
