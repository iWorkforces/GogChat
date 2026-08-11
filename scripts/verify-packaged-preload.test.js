import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectRequiredSpecifiers, verifyPackagedPreload } from './verify-packaged-preload.js';

const temps = [];

function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-preload-'));
  temps.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('verify-packaged-preload', () => {
  it('fails when the preload entry is missing', () => {
    const root = makeTree({ 'readme.txt': 'no preload' });
    const result = verifyPackagedPreload(root);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing lib\/preload\/index\.js/);
  });

  it('fails when a required CommonJS chunk is missing', () => {
    const root = makeTree({
      'lib/preload/index.js': "require('./chunk-a.js');\nmodule.exports = {};\n",
    });
    const result = verifyPackagedPreload(root);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('./chunk-a.js');
  });

  it('passes when the entry and required chunks exist', () => {
    const root = makeTree({
      'lib/preload/index.js': "require('./chunk-a.js');\nmodule.exports = {};\n",
      'lib/preload/chunk-a.js': 'module.exports = {};\n',
    });
    const result = verifyPackagedPreload(root);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('collects only relative require specifiers', () => {
    const specs = collectRequiredSpecifiers(
      "require('electron'); require('./local.js'); require('../shared.js');"
    );
    expect(specs).toEqual(['./local.js', '../shared.js']);
  });
});
