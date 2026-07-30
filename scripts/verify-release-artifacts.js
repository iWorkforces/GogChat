#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  findMacosDmgs,
  findMacosPackageArtifactViolations,
  MACOS_DMG_ARCHES,
} from './verify-macos-package-artifacts.js';
import {
  findWindowsInstallers,
  findWindowsPackageArtifactViolations,
} from './verify-windows-package-artifacts.js';

const REQUIRED_MACOS_ARCHES = [...MACOS_DMG_ARCHES];
const REQUIRED_WINDOWS_ARCHES = ['x64', 'arm64'];

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  return [
    'Usage: bun scripts/verify-release-artifacts.js --input <dir> [--output <dir>]',
    '',
    'Verifies aggregated macOS arm64/x64 DMG and Windows x64/arm64 NSIS setup artifacts before release publishing.',
  ].join('\n');
}

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

function findDuplicateArtifactFileNames(inputDir) {
  const fileNames = new Map();
  for (const filePath of listFiles(inputDir)) {
    const fileName = path.basename(filePath);
    const relativePath = normalizeRelativePath(path.relative(inputDir, filePath));
    const paths = fileNames.get(fileName) ?? [];
    paths.push(relativePath);
    fileNames.set(fileName, paths);
  }

  return [...fileNames.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([fileName]) => `Duplicate release artifact filename: ${fileName}`)
    .sort((left, right) => left.localeCompare(right));
}

function splitMissingViolations(violations, platformPrefix) {
  return {
    missing: violations.filter((violation) =>
      violation.startsWith(`Missing required ${platformPrefix}`)
    ),
    remaining: violations.filter(
      (violation) => !violation.startsWith(`Missing required ${platformPrefix}`)
    ),
  };
}

export function findReleaseArtifactViolations(inputDir) {
  const macViolations = splitMissingViolations(
    findMacosPackageArtifactViolations(inputDir, REQUIRED_MACOS_ARCHES),
    'macOS'
  );
  const windowsViolations = splitMissingViolations(
    findWindowsPackageArtifactViolations(inputDir, REQUIRED_WINDOWS_ARCHES),
    'Windows'
  );

  return [
    ...macViolations.missing,
    ...windowsViolations.missing,
    ...findDuplicateArtifactFileNames(inputDir),
    ...macViolations.remaining,
    ...windowsViolations.remaining,
  ];
}

function findVerifiedReleaseArtifacts(inputDir) {
  const dmgArtifacts = findMacosDmgs(inputDir).map((dmg) => dmg.relativePath);
  const windowsArtifacts = findWindowsInstallers(inputDir).map(
    (installer) => installer.relativePath
  );
  return [...dmgArtifacts, ...windowsArtifacts].sort((left, right) => left.localeCompare(right));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function copyVerifiedArtifacts(inputDir, outputDir) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const artifacts = findVerifiedReleaseArtifacts(inputDir);
  const checksumLines = [];
  for (const artifact of artifacts) {
    const sourcePath = path.join(inputDir, artifact);
    const outputFileName = path.basename(artifact);
    const outputPath = path.join(outputDir, outputFileName);
    fs.copyFileSync(sourcePath, outputPath);
    checksumLines.push(`${sha256File(outputPath)}  ${outputFileName}`);
  }
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`);
  return artifacts;
}

function parseArgs(argv) {
  const parsed = {
    help: false,
    inputDir: null,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      const value = argv[index + 1];
      if (!value) {
        throw new UsageError('--input requires a directory path');
      }
      parsed.inputDir = value;
      index += 1;
    } else if (arg === '--output') {
      const value = argv[index + 1];
      if (!value) {
        throw new UsageError('--output requires a directory path');
      }
      parsed.outputDir = value;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function runCli(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    console.log(usage());
    return;
  }
  if (parsed.inputDir === null) {
    throw new UsageError('--input requires a directory path');
  }

  const inputDir = path.resolve(process.cwd(), parsed.inputDir);
  const violations = findReleaseArtifactViolations(inputDir);
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exit(1);
  }

  if (parsed.outputDir !== null) {
    const outputDir = path.resolve(process.cwd(), parsed.outputDir);
    const artifacts = copyVerifiedArtifacts(inputDir, outputDir);
    console.log(`Verified ${artifacts.length} release artifacts into ${outputDir}`);
    return;
  }

  console.log(JSON.stringify({ artifacts: findVerifiedReleaseArtifacts(inputDir) }, null, 2));
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
      console.error(usage());
      process.exit(2);
    }
    throw error;
  }
}
