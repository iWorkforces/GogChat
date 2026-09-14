#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION = 1;
export const RELEASE_ARTIFACT_SIDECAR_PLATFORMS = ['macos', 'windows'];
export const RELEASE_ARTIFACT_SIDECAR_ARCHES = ['arm64', 'x64'];

const SIDECAR_FIELD_TYPES = {
  schemaVersion: 'number',
  sourceSha: 'string',
  packageVersion: 'string',
  platform: 'string',
  arch: 'string',
  basename: 'string',
  size: 'number',
  sha256: 'string',
};

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function listFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

export function sidecarFileName(basename) {
  return `${path.basename(basename)}.json`;
}

export function sidecarPathFor(filePath) {
  return `${filePath}.json`;
}

export function isReleaseArtifactSidecarFileName(fileName) {
  const baseName = path.basename(fileName);
  return (
    /\.dmg\.json$/i.test(baseName) || /.+-windows-(?:arm64|x64)-setup\.exe\.json$/i.test(baseName)
  );
}

export function normalizeSourceSha(value) {
  const sourceSha = String(value ?? '')
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{40}$/.test(sourceSha) ? sourceSha : null;
}

export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function buildReleaseArtifactSidecar({
  sourceSha,
  packageVersion,
  platform,
  arch,
  filePath,
}) {
  const normalizedSourceSha = normalizeSourceSha(sourceSha);
  if (normalizedSourceSha === null) {
    throw new Error('source SHA must be a 40-character hex object id');
  }
  const normalizedVersion = String(packageVersion ?? '').trim();
  if (normalizedVersion === '') {
    throw new Error('package version is required');
  }
  if (!RELEASE_ARTIFACT_SIDECAR_PLATFORMS.includes(platform)) {
    throw new Error('platform must be macos or windows');
  }
  if (!RELEASE_ARTIFACT_SIDECAR_ARCHES.includes(arch)) {
    throw new Error('arch must be arm64 or x64');
  }

  return {
    schemaVersion: RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION,
    sourceSha: normalizedSourceSha,
    packageVersion: normalizedVersion,
    platform,
    arch,
    basename: path.basename(filePath),
    size: fs.statSync(filePath).size,
    sha256: sha256File(filePath),
  };
}

export function serializeReleaseArtifactSidecar(sidecar) {
  return `${JSON.stringify(sidecar, null, 2)}\n`;
}

export function writeReleaseArtifactSidecar(filePath, sidecar) {
  const sidecarPath = sidecarPathFor(filePath);
  fs.writeFileSync(sidecarPath, serializeReleaseArtifactSidecar(sidecar));
  return sidecarPath;
}

export function parseReleaseArtifactSidecar(raw, relativePath) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, violations: [`Malformed sidecar ${relativePath}: invalid JSON`] };
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, violations: [`Malformed sidecar ${relativePath}: expected an object`] };
  }

  const keys = Object.keys(value);
  const unexpected = keys.filter((key) => !(key in SIDECAR_FIELD_TYPES)).sort();
  const missing = Object.keys(SIDECAR_FIELD_TYPES).filter((key) => !(key in value));
  const violations = [];

  if (unexpected.length > 0) {
    violations.push(
      `Malformed sidecar ${relativePath}: unexpected fields ${unexpected.join(', ')}`
    );
  }
  if (missing.length > 0) {
    violations.push(`Malformed sidecar ${relativePath}: missing fields ${missing.join(', ')}`);
  }
  for (const [key, typeName] of Object.entries(SIDECAR_FIELD_TYPES)) {
    if (key in value && typeof value[key] !== typeName) {
      violations.push(`Malformed sidecar ${relativePath}: ${key} must be a ${typeName}`);
    }
  }
  if (violations.length > 0) {
    return { ok: false, violations };
  }

  if (value.schemaVersion !== RELEASE_ARTIFACT_SIDECAR_SCHEMA_VERSION) {
    return {
      ok: false,
      violations: [
        `Malformed sidecar ${relativePath}: unsupported schemaVersion ${value.schemaVersion}`,
      ],
    };
  }
  if (normalizeSourceSha(value.sourceSha) === null) {
    return {
      ok: false,
      violations: [
        `Malformed sidecar ${relativePath}: sourceSha must be a 40-character hex object id`,
      ],
    };
  }
  if (value.packageVersion.trim() === '') {
    return {
      ok: false,
      violations: [`Malformed sidecar ${relativePath}: packageVersion must be a non-empty string`],
    };
  }
  if (!RELEASE_ARTIFACT_SIDECAR_PLATFORMS.includes(value.platform)) {
    return {
      ok: false,
      violations: [`Malformed sidecar ${relativePath}: platform must be macos or windows`],
    };
  }
  if (!RELEASE_ARTIFACT_SIDECAR_ARCHES.includes(value.arch)) {
    return {
      ok: false,
      violations: [`Malformed sidecar ${relativePath}: arch must be arm64 or x64`],
    };
  }
  if (!Number.isInteger(value.size) || value.size < 0) {
    return {
      ok: false,
      violations: [`Malformed sidecar ${relativePath}: size must be a non-negative integer`],
    };
  }
  if (!/^[0-9a-f]{64}$/i.test(value.sha256)) {
    return {
      ok: false,
      violations: [`Malformed sidecar ${relativePath}: sha256 must be a 64-character hex digest`],
    };
  }
  if (value.basename.trim() === '' || path.basename(value.basename) !== value.basename) {
    return {
      ok: false,
      violations: [`Malformed sidecar ${relativePath}: basename must be a file name`],
    };
  }

  return {
    ok: true,
    sidecar: {
      schemaVersion: value.schemaVersion,
      sourceSha: value.sourceSha.toLowerCase(),
      packageVersion: value.packageVersion,
      platform: value.platform,
      arch: value.arch,
      basename: value.basename,
      size: value.size,
      sha256: value.sha256.toLowerCase(),
    },
  };
}

export function compareReleaseArtifactSidecar(sidecar, expected, relativePath) {
  const violations = [];
  if (sidecar.basename !== expected.basename) {
    violations.push(
      `Malformed sidecar ${relativePath}: basename ${sidecar.basename} does not match ${expected.basename}`
    );
  }
  if (sidecar.platform !== expected.platform) {
    violations.push(
      `Platform-mismatched sidecar ${relativePath}: expected ${expected.platform}, got ${sidecar.platform}`
    );
  }
  if (sidecar.arch !== expected.arch) {
    violations.push(
      `Architecture-mismatched sidecar ${relativePath}: expected ${expected.arch}, got ${sidecar.arch}`
    );
  }
  if (sidecar.sourceSha !== expected.sourceSha) {
    violations.push(
      `Cross-source sidecar ${relativePath}: expected ${expected.sourceSha}, got ${sidecar.sourceSha}`
    );
  }
  if (sidecar.packageVersion !== expected.packageVersion) {
    violations.push(
      `Cross-version sidecar ${relativePath}: expected ${expected.packageVersion}, got ${sidecar.packageVersion}`
    );
  }
  if (sidecar.size !== expected.size) {
    violations.push(
      `Size-mismatched sidecar ${relativePath}: expected ${expected.size}, got ${sidecar.size}`
    );
  }
  if (sidecar.sha256 !== expected.sha256) {
    violations.push(
      `Digest-mismatched sidecar ${relativePath}: expected ${expected.sha256}, got ${sidecar.sha256}`
    );
  }
  return violations;
}

export function findReleaseArtifactSidecarFiles(rootDir) {
  return listFiles(rootDir)
    .filter((filePath) => isReleaseArtifactSidecarFileName(path.basename(filePath)))
    .map((filePath) => ({
      filePath,
      relativePath: normalizeRelativePath(path.relative(rootDir, filePath)),
      fileName: path.basename(filePath),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function findReleaseArtifactSidecarViolations({
  inputDir,
  artifacts,
  expectedSourceSha,
  expectedPackageVersion,
}) {
  const violations = [];
  const normalizedSourceSha = normalizeSourceSha(expectedSourceSha);
  const normalizedVersion = String(expectedPackageVersion ?? '').trim();

  if (normalizedSourceSha === null) {
    violations.push('Expected source SHA must be a 40-character hex object id');
  }
  if (normalizedVersion === '') {
    violations.push('Expected package version is required');
  }

  const artifactsByBasename = new Map();
  for (const artifact of artifacts) {
    const basename = path.basename(artifact.relativePath);
    const matches = artifactsByBasename.get(basename) ?? [];
    matches.push(artifact);
    artifactsByBasename.set(basename, matches);
  }

  const sidecars = findReleaseArtifactSidecarFiles(inputDir);
  const sidecarsByName = new Map();
  for (const sidecar of sidecars) {
    const matches = sidecarsByName.get(sidecar.fileName) ?? [];
    matches.push(sidecar);
    sidecarsByName.set(sidecar.fileName, matches);
  }

  for (const basename of [...artifactsByBasename.keys()].sort((left, right) =>
    left.localeCompare(right)
  )) {
    const sidecarName = sidecarFileName(basename);
    const matches = sidecarsByName.get(sidecarName) ?? [];
    if (matches.length === 0) {
      violations.push(`Missing sidecar for ${basename}`);
    } else if (matches.length > 1) {
      violations.push(
        `Duplicate sidecar for ${basename}: ${matches.map((entry) => entry.relativePath).join(', ')}`
      );
    }
  }

  for (const sidecar of sidecars) {
    const claimedBinaryName = sidecar.fileName.replace(/\.json$/i, '');
    if (!artifactsByBasename.has(claimedBinaryName)) {
      violations.push(`Orphaned sidecar: ${sidecar.relativePath}`);
    }
  }

  if (normalizedSourceSha === null || normalizedVersion === '') {
    return violations;
  }

  for (const basename of [...artifactsByBasename.keys()].sort((left, right) =>
    left.localeCompare(right)
  )) {
    const matches = sidecarsByName.get(sidecarFileName(basename)) ?? [];
    const artifactMatches = artifactsByBasename.get(basename) ?? [];
    if (matches.length !== 1 || artifactMatches.length !== 1) {
      continue;
    }

    const artifact = artifactMatches[0];
    const expected = buildReleaseArtifactSidecar({
      sourceSha: normalizedSourceSha,
      packageVersion: normalizedVersion,
      platform: artifact.platform,
      arch: artifact.arch,
      filePath: path.join(inputDir, artifact.relativePath),
    });
    const parsed = parseReleaseArtifactSidecar(
      fs.readFileSync(matches[0].filePath, 'utf8'),
      matches[0].relativePath
    );
    if (!parsed.ok) {
      violations.push(...parsed.violations);
      continue;
    }
    violations.push(
      ...compareReleaseArtifactSidecar(parsed.sidecar, expected, matches[0].relativePath)
    );
  }

  return violations;
}

export function syncAcceptedArtifactSidecars({
  distDir,
  artifacts,
  platform,
  sourceSha,
  packageVersion,
}) {
  const normalizedSourceSha = normalizeSourceSha(sourceSha);
  const normalizedVersion = String(packageVersion ?? '').trim();
  if (normalizedSourceSha === null) {
    return ['source SHA must be a 40-character hex object id'];
  }
  if (normalizedVersion === '') {
    return ['package version is required'];
  }

  const violations = [];
  for (const artifact of artifacts) {
    const filePath = path.join(distDir, artifact.relativePath);
    const expected = buildReleaseArtifactSidecar({
      sourceSha: normalizedSourceSha,
      packageVersion: normalizedVersion,
      platform,
      arch: artifact.arch,
      filePath,
    });
    const sidecarPath = sidecarPathFor(filePath);
    if (!fs.existsSync(sidecarPath)) {
      writeReleaseArtifactSidecar(filePath, expected);
      continue;
    }

    const relativePath = normalizeRelativePath(path.relative(distDir, sidecarPath));
    const parsed = parseReleaseArtifactSidecar(fs.readFileSync(sidecarPath, 'utf8'), relativePath);
    if (!parsed.ok) {
      violations.push(...parsed.violations);
      continue;
    }
    violations.push(...compareReleaseArtifactSidecar(parsed.sidecar, expected, relativePath));
  }

  return violations;
}
