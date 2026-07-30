#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const MACOS_DMG_ARCHES = ['arm64', 'x64'];
const FORBIDDEN_MACOS_ARCH_LABELS = ['amd64', 'ia32', 'universal'];

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  return [
    'Usage: bun scripts/verify-macos-package-artifacts.js [--dist <dir>] [--manifest] [--require-arch <arm64|x64>]',
    '',
    'Lists generated macOS DMG artifacts without publishing or mutating releases.',
  ].join('\n');
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * Detect official macOS DMG arch from artifact basename.
 * Matches electron-builder artifactName: ${productName}-${version}-${arch}.dmg
 * Rejects Windows-style names and forbidden labels by returning null for non-matches.
 */
export function detectMacosDmgArch(fileName) {
  const baseName = path.basename(fileName);
  if (!/\.dmg$/i.test(baseName)) {
    return null;
  }
  // Windows-style or forbidden tokens must never classify as a mac DMG arch.
  for (const label of [...FORBIDDEN_MACOS_ARCH_LABELS, 'windows']) {
    if (hasPackageToken(baseName, label)) {
      return null;
    }
  }
  for (const arch of MACOS_DMG_ARCHES) {
    const artifactPattern = new RegExp(`^.+-${arch}\\.dmg$`, 'i');
    if (artifactPattern.test(baseName)) {
      return arch;
    }
  }
  return null;
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

export function findMacosDmgs(distDir) {
  return listFiles(distDir)
    .map((filePath) => {
      const arch = detectMacosDmgArch(filePath);
      if (arch === null) {
        return null;
      }

      return {
        arch,
        relativePath: normalizeRelativePath(path.relative(distDir, filePath)),
        sizeBytes: fs.statSync(filePath).size,
      };
    })
    .filter((artifact) => artifact !== null)
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function buildManifest(distDir) {
  return {
    dmgs: findMacosDmgs(distDir),
  };
}

function parseArgs(argv) {
  const parsed = {
    distDir: 'dist',
    help: false,
    manifest: false,
    requiredArches: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') {
      const value = argv[index + 1];
      if (!value) {
        throw new UsageError('--dist requires a directory path');
      }
      parsed.distDir = value;
      index += 1;
    } else if (arg === '--manifest') {
      parsed.manifest = true;
    } else if (arg === '--require-arch') {
      const value = argv[index + 1];
      if (!MACOS_DMG_ARCHES.includes(value)) {
        throw new UsageError('--require-arch must be arm64 or x64');
      }
      parsed.requiredArches.push(value);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

export function verifyRequiredArches(dmgs, requiredArches) {
  const availableArches = new Set(dmgs.map((dmg) => dmg.arch));
  return requiredArches.filter((arch) => !availableArches.has(arch));
}

function hasPackageToken(fileName, token) {
  return new RegExp(`(^|[-_.])${token}($|[-_.])`, 'i').test(fileName);
}

function isMacosPackageArtifact(relativePath) {
  return /\.dmg$/i.test(relativePath) || /\.dmg\.blockmap$/i.test(relativePath);
}

export function findMacosPackageArtifactViolations(distDir, requiredArches) {
  const dmgs = findMacosDmgs(distDir);
  const dmgPathsByArch = new Map(MACOS_DMG_ARCHES.map((arch) => [arch, []]));
  for (const dmg of dmgs) {
    dmgPathsByArch.get(dmg.arch).push(dmg.relativePath);
  }

  const violations = verifyRequiredArches(dmgs, requiredArches).map(
    (arch) => `Missing required macOS DMG arch: ${arch}`
  );

  for (const arch of MACOS_DMG_ARCHES) {
    const dmgPaths = dmgPathsByArch.get(arch);
    if (dmgPaths !== undefined && dmgPaths.length > 1) {
      violations.push(`Duplicate macOS DMG outputs for ${arch}: ${dmgPaths.join(', ')}`);
    }
  }

  const artifactPaths = listFiles(distDir)
    .map((filePath) => normalizeRelativePath(path.relative(distDir, filePath)))
    .filter(isMacosPackageArtifact)
    .sort((left, right) => left.localeCompare(right));

  for (const label of FORBIDDEN_MACOS_ARCH_LABELS) {
    for (const artifactPath of artifactPaths) {
      if (hasPackageToken(path.basename(artifactPath), label)) {
        violations.push(`Forbidden macOS artifact arch label "${label}" in ${artifactPath}`);
      }
    }
  }

  return violations;
}

function printDmgList(dmgs) {
  if (dmgs.length === 0) {
    console.log('No macOS DMG artifacts found.');
    return;
  }

  for (const dmg of dmgs) {
    console.log(`${dmg.arch}\t${dmg.sizeBytes}\t${dmg.relativePath}`);
  }
}

function runCli(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    console.log(usage());
    return;
  }

  const distDir = path.resolve(process.cwd(), parsed.distDir);
  const manifest = buildManifest(distDir);
  const violations = findMacosPackageArtifactViolations(distDir, parsed.requiredArches);

  if (parsed.manifest) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    printDmgList(manifest.dmgs);
  }

  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exit(1);
  }
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isCli) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      if (error.message !== usage()) {
        console.error(usage());
      }
      process.exit(2);
    }
    throw error;
  }
}
