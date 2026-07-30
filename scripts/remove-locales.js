#!/usr/bin/env node

/**
 * Remove unused Electron locales to reduce package size
 * Keeps only en-US locale, removes all others (100+ languages)
 * Expected savings: 15-25MB
 * Supports macOS arm64 and x64 unpack directories.
 * Prefer scripts/after-pack.cjs for release packaging; this is a standalone helper.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments: platform [arch]
const [, , platform, archArg] = process.argv;
const arch = archArg ?? 'arm64';

if (!platform) {
  console.error('Usage: node remove-locales.js <platform> [arch]');
  console.error('Example: node remove-locales.js mac arm64');
  console.error('Example: node remove-locales.js mac x64');
  process.exit(1);
}

if (arch !== 'arm64' && arch !== 'x64') {
  console.error(`Invalid arch: ${arch} (expected arm64 or x64)`);
  process.exit(1);
}

// macOS locales to keep (.lproj directories)
const KEEP_LPROJ = ['en.lproj', 'en-US.lproj', 'en_US.lproj'];

// Get the locales directory path for macOS (arm64 or x64)
function getLocalesPath(platformName, targetArch) {
  const distDir = path.join(__dirname, '..', 'dist');

  if (platformName === 'mac' || platformName === 'darwin') {
    const appPath = path.join(distDir, `GogChat-darwin-${targetArch}`, 'GogChat.app');
    // On macOS, locale files are in .lproj directories in Resources
    return {
      path: path.join(
        appPath,
        'Contents',
        'Frameworks',
        'Electron Framework.framework',
        'Versions',
        'A',
        'Resources'
      ),
      isMacOS: true,
    };
  }

  throw new Error(`Unsupported platform: ${platformName}. This script only supports macOS.`);
}

// Helper function to get directory size
function getDirectorySize(dirPath) {
  let totalSize = 0;

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        scanDir(filePath);
      } else {
        totalSize += stats.size;
      }
    }
  }

  scanDir(dirPath);
  return totalSize;
}

// Main function
function removeUnusedLocales() {
  const localesInfo = getLocalesPath(platform, arch);
  const localesPath = localesInfo.path;

  console.log(`[Locale Cleanup] Platform: ${platform}, Arch: ${arch}`);
  console.log(`[Locale Cleanup] Locales path: ${localesPath}`);

  if (!fs.existsSync(localesPath)) {
    console.error(`[Locale Cleanup] ERROR: Locales directory not found: ${localesPath}`);
    console.error('[Locale Cleanup] Make sure packaging completed successfully');
    process.exit(1);
  }

  // Read all files/directories in locales path
  const items = fs.readdirSync(localesPath);

  let totalSize = 0;
  let removedSize = 0;
  let removedCount = 0;
  let keptCount = 0;

  items.forEach((item) => {
    const itemPath = path.join(localesPath, item);
    const stats = fs.statSync(itemPath);

    // macOS uses .lproj directories
    if (item.endsWith('.lproj')) {
      const itemSize = stats.isDirectory() ? getDirectorySize(itemPath) : stats.size;
      totalSize += itemSize;

      if (!KEEP_LPROJ.includes(item)) {
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
          removedSize += itemSize;
          removedCount++;
          console.log(`[Locale Cleanup] Removed: ${item} (${(itemSize / 1024).toFixed(1)} KB)`);
        } catch (error) {
          console.error(`[Locale Cleanup] Failed to remove ${item}: ${error.message}`);
        }
      } else {
        keptCount++;
        console.log(`[Locale Cleanup] Kept: ${item} (${(itemSize / 1024).toFixed(1)} KB)`);
      }
    }
  });

  // Print summary
  console.log('\n[Locale Cleanup] ========== SUMMARY ==========');
  console.log(`[Locale Cleanup] Total locales: ${removedCount + keptCount}`);
  console.log(`[Locale Cleanup] Removed: ${removedCount} locales`);
  console.log(`[Locale Cleanup] Kept: ${keptCount} locales`);
  console.log(`[Locale Cleanup] Space saved: ${(removedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[Locale Cleanup] Original size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `[Locale Cleanup] Final size: ${((totalSize - removedSize) / 1024 / 1024).toFixed(2)} MB`
  );
  console.log('[Locale Cleanup] =============================\n');
}

// Run the cleanup
try {
  removeUnusedLocales();
  console.log('[Locale Cleanup] ✅ Locale cleanup completed successfully');
} catch (error) {
  console.error(`[Locale Cleanup] ❌ Error: ${error.message}`);
  process.exit(1);
}
