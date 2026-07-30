import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectEmittedChunks, trackBuildHistory } from './build-rsbuild.js';

describe('collectEmittedChunks', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-chunks-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('counts lib/chunks/*.js and ignores stale *.chunk.js suffix requirement', () => {
    const chunksDir = path.join(tmpRoot, 'chunks');
    fs.mkdirSync(chunksDir, { recursive: true });
    fs.writeFileSync(path.join(chunksDir, 'featureRunner.js'), 'export default 1;');
    fs.writeFileSync(path.join(chunksDir, 'menu.js'), 'export default 2;');
    fs.writeFileSync(path.join(chunksDir, 'notes.txt'), 'not a chunk');

    const chunks = collectEmittedChunks(tmpRoot);
    expect(chunks.map((c) => c.path).sort()).toEqual(['chunks/featureRunner.js', 'chunks/menu.js']);
  });

  it('returns empty when chunks dir is absent', () => {
    expect(collectEmittedChunks(tmpRoot)).toEqual([]);
  });
});

describe('trackBuildHistory', () => {
  let tmpRoot;
  let originalCwd;
  let historyPath;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-build-hist-'));
    originalCwd = process.cwd();
    // trackBuildHistory writes to ../.build-history.json relative to scripts/
    // We invoke it against a fake lib dir and spy via a temp history by
    // writing into repo .build-history is undesirable; instead we only assert
    // return value / side effects on the lib tree and that buildTimeMs is accepted.
    const libDir = path.join(tmpRoot, 'lib');
    fs.mkdirSync(path.join(libDir, 'main'), { recursive: true });
    fs.mkdirSync(path.join(libDir, 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(libDir, 'main', 'index.js'), 'export {};');
    fs.writeFileSync(path.join(libDir, 'chunks', 'a.js'), 'export {};');
    historyPath = path.join(process.cwd(), '.build-history.json');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('records buildTimeMs and chunkCount matching lib/chunks/*.js', () => {
    const libDir = path.join(tmpRoot, 'lib');
    // Backup existing history if present
    let backup = null;
    if (fs.existsSync(historyPath)) {
      backup = fs.readFileSync(historyPath, 'utf8');
    }
    try {
      trackBuildHistory(libDir, { buildTimeMs: 1234 });
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      const last = history[history.length - 1];
      expect(last.buildTimeMs).toBe(1234);
      expect(last.chunkCount).toBe(1);
      expect(last.chunks).toEqual([{ name: 'a', size: expect.any(Number) }]);
    } finally {
      if (backup != null) {
        fs.writeFileSync(historyPath, backup);
      } else if (fs.existsSync(historyPath)) {
        // Remove only the entry we added if history was created by us
        try {
          const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
          if (history.length === 1 && history[0].buildTimeMs === 1234) {
            fs.rmSync(historyPath, { force: true });
          } else {
            history.pop();
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
          }
        } catch {
          /* leave history as-is on parse error */
        }
      }
    }
  });
});
