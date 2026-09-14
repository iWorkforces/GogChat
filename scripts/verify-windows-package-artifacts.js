#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { syncAcceptedArtifactSidecars } from './release-artifact-sidecar.js';

export const WINDOWS_INSTALLER_ARCHES = ['x64', 'arm64'];
const FORBIDDEN_WINDOWS_ARCH_LABELS = ['amd64', 'ia32', 'universal'];

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  return [
    'Usage: bun scripts/verify-windows-package-artifacts.js [--dist <dir>] [--manifest] [--require-arch <x64|arm64>] [--source-sha <sha>] [--package-version <version>]',
    '',
    'Lists generated Windows NSIS installer artifacts without publishing or mutating releases.',
    'When --source-sha and --package-version are provided, writes or validates one',
    'versioned JSON sidecar per accepted installer after filename and architecture checks.',
  ].join('\n');
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function detectWindowsInstallerArch(fileName) {
  const baseName = path.basename(fileName);
  for (const arch of WINDOWS_INSTALLER_ARCHES) {
    const artifactPattern = new RegExp(`^.+-windows-${arch}-setup\\.exe$`, 'i');
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

export function findWindowsInstallers(distDir) {
  return listFiles(distDir)
    .map((filePath) => {
      const arch = detectWindowsInstallerArch(filePath);
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
    installers: findWindowsInstallers(distDir),
  };
}

function parseArgs(argv) {
  const parsed = {
    distDir: 'dist',
    help: false,
    manifest: false,
    requiredArches: [],
    sourceSha: null,
    packageVersion: null,
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
      if (!WINDOWS_INSTALLER_ARCHES.includes(value)) {
        throw new UsageError('--require-arch must be x64 or arm64');
      }
      parsed.requiredArches.push(value);
      index += 1;
    } else if (arg === '--source-sha') {
      const value = argv[index + 1];
      if (!value) {
        throw new UsageError('--source-sha requires a 40-character hex object id');
      }
      parsed.sourceSha = value;
      index += 1;
    } else if (arg === '--package-version') {
      const value = argv[index + 1];
      if (!value) {
        throw new UsageError('--package-version requires a version string');
      }
      parsed.packageVersion = value;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }

  if ((parsed.sourceSha === null) !== (parsed.packageVersion === null) && parsed.help === false) {
    throw new UsageError('--source-sha and --package-version must be provided together');
  }

  return parsed;
}

export function verifyRequiredArches(installers, requiredArches) {
  const availableArches = new Set(installers.map((installer) => installer.arch));
  return requiredArches.filter((arch) => !availableArches.has(arch));
}

function hasPackageToken(fileName, token) {
  return new RegExp(`(^|[-_.])${token}($|[-_.])`, 'i').test(fileName);
}

function isWindowsPackageArtifact(relativePath) {
  return /\.(exe|msi|msix|zip)$/i.test(relativePath) || /\.exe\.blockmap$/i.test(relativePath);
}

function isForbiddenWindowsPackageType(relativePath) {
  return (
    /\.(msi|msix|zip)$/i.test(relativePath) ||
    hasPackageToken(path.basename(relativePath), 'portable')
  );
}

export function findWindowsPackageArtifactViolations(distDir, requiredArches) {
  const installers = findWindowsInstallers(distDir);
  const installerPathsByArch = new Map(WINDOWS_INSTALLER_ARCHES.map((arch) => [arch, []]));
  for (const installer of installers) {
    installerPathsByArch.get(installer.arch).push(installer.relativePath);
  }

  const violations = verifyRequiredArches(installers, requiredArches).map(
    (arch) => `Missing required Windows installer arch: ${arch}`
  );

  for (const arch of WINDOWS_INSTALLER_ARCHES) {
    const installerPaths = installerPathsByArch.get(arch);
    if (installerPaths.length > 1) {
      violations.push(
        `Duplicate Windows installer outputs for ${arch}: ${installerPaths.join(', ')}`
      );
    }
  }

  const artifactPaths = listFiles(distDir)
    .map((filePath) => normalizeRelativePath(path.relative(distDir, filePath)))
    .filter(isWindowsPackageArtifact)
    .sort((left, right) => left.localeCompare(right));

  for (const label of FORBIDDEN_WINDOWS_ARCH_LABELS) {
    for (const artifactPath of artifactPaths) {
      if (hasPackageToken(path.basename(artifactPath), label)) {
        violations.push(`Forbidden Windows artifact arch label "${label}" in ${artifactPath}`);
      }
    }
  }

  for (const artifactPath of artifactPaths) {
    if (isForbiddenWindowsPackageType(artifactPath)) {
      violations.push(`Forbidden Windows package artifact type in ${artifactPath}`);
    }
  }

  return violations;
}

function printInstallerList(installers) {
  if (installers.length === 0) {
    console.log('No Windows installer artifacts found.');
    return;
  }

  for (const installer of installers) {
    console.log(`${installer.arch}\t${installer.sizeBytes}\t${installer.relativePath}`);
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
  const violations = findWindowsPackageArtifactViolations(distDir, parsed.requiredArches);

  if (parsed.manifest) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    printInstallerList(manifest.installers);
  }

  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exit(1);
  }

  if (parsed.sourceSha !== null && parsed.packageVersion !== null) {
    const sidecarViolations = syncAcceptedArtifactSidecars({
      distDir,
      artifacts: manifest.installers,
      platform: 'windows',
      sourceSha: parsed.sourceSha,
      packageVersion: parsed.packageVersion,
    });
    if (sidecarViolations.length > 0) {
      console.error(sidecarViolations.join('\n'));
      process.exit(1);
    }
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
