import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const REQUIRED_PROJECTS = ['e2e', 'integration', 'performance', 'preload-artifact'];

function collectFiles(rootDir, matchers) {
  const patterns = Array.isArray(matchers) ? matchers : [matchers];
  const collected = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(rootDir, full).split(path.sep).join('/');
      if (patterns.some((pattern) => minimatch(rel, pattern))) {
        collected.push(path.normalize(full));
      }
    }
  }

  walk(rootDir);
  return collected.sort();
}

function minimatch(relPath, pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  if (normalized === '**/*.test.ts') {
    return relPath.endsWith('.test.ts');
  }
  if (normalized.endsWith('/**/*.test.ts')) {
    const prefix = normalized.slice(0, -'/**/*.test.ts'.length);
    return relPath.startsWith(`${prefix}/`) && relPath.endsWith('.test.ts');
  }
  if (normalized.endsWith('/*.test.ts')) {
    const prefix = normalized.slice(0, -'/*.test.ts'.length);
    const dir = path.posix.dirname(relPath);
    return dir === prefix && relPath.endsWith('.test.ts');
  }
  return relPath === normalized;
}

async function loadPlaywrightConfig() {
  const mod = await import(path.join(PROJECT_ROOT, 'playwright.config.ts'));
  return mod.default;
}

describe('playwright project topology', () => {
  it('exports the required isolated projects and shared runner defaults', async () => {
    const config = await loadPlaywrightConfig();
    const testDir = path.resolve(PROJECT_ROOT, config.testDir ?? '.');

    expect(path.basename(testDir)).toBe('tests');
    expect(config.workers).toBe(1);
    expect(config.timeout).toBe(60000);
    expect(config.retries).toBe(0);
    expect(config.reporter).toBe('list');
    expect(config.use?.headless).toBe(true);

    const projects = config.projects ?? [];
    const names = projects.map((project) => project.name);
    expect(names).toEqual(REQUIRED_PROJECTS);

    for (const project of projects) {
      expect(project.timeout === undefined || project.timeout >= 60000).toBe(true);
    }
  });

  it('rejects overlapping normalized test paths and unknown project names', async () => {
    const config = await loadPlaywrightConfig();
    const testDir = path.resolve(PROJECT_ROOT, config.testDir ?? '.');
    const projects = config.projects ?? [];
    const names = projects.map((project) => project.name);

    for (const name of names) {
      expect(REQUIRED_PROJECTS).toContain(name);
    }

    const ownership = new Map();
    for (const project of projects) {
      const match = project.testMatch ?? config.testMatch ?? '**/*.test.ts';
      const files = collectFiles(testDir, match);
      for (const file of files) {
        if (ownership.has(file)) {
          throw new Error(
            `duplicate project ownership for ${path.relative(PROJECT_ROOT, file)}: ${ownership.get(file)} and ${project.name}`
          );
        }
        ownership.set(file, project.name);
      }
    }

    const expected = {
      e2e: path.join(testDir, 'e2e/user-workflows.test.ts'),
      integration: [
        path.join(testDir, 'integration/app-launch.test.ts'),
        path.join(testDir, 'integration/bounded-shutdown.test.ts'),
        path.join(testDir, 'integration/ipc-communication.test.ts'),
        path.join(testDir, 'integration/manual-update.test.ts'),
        path.join(testDir, 'integration/multi-account.test.ts'),
      ],
      performance: path.join(testDir, 'performance/performance-regression.test.ts'),
      preloadArtifact: path.join(testDir, 'artifact/preload/preload-entry.test.ts'),
    };

    expect(ownership.get(path.normalize(expected.e2e))).toBe('e2e');
    for (const file of expected.integration) {
      expect(ownership.get(path.normalize(file))).toBe('integration');
    }
    expect(ownership.get(path.normalize(expected.performance))).toBe('performance');
    expect(ownership.get(path.normalize(expected.preloadArtifact))).toBe('preload-artifact');
  });
});
