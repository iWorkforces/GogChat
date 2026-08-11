#!/usr/bin/env node

/**
 * Disposable Electron child for CDP persistence samples.
 * Usage: electron scripts/cdp-persistence-child.js <userDataDir> <samplesPerSize>
 */

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  SIZES,
  environmentMetadata,
  loadBuiltRecordMetrics,
  measureOneAppend,
} from './cdp-persistence-benchmark.js';

const userDataDir = process.argv[2];
const samplesPerSize = Number(process.argv[3] ?? 1);

if (!userDataDir) {
  console.error('usage: electron scripts/cdp-persistence-child.js <userDataDir> <samplesPerSize>');
  app.exit(2);
}

app.setPath('userData', userDataDir);

app
  .whenReady()
  .then(async () => {
    const recordMetrics = await loadBuiltRecordMetrics(app);
    const cells = {};
    for (const size of SIZES) {
      const samples = [];
      for (let index = 0; index < samplesPerSize; index += 1) {
        const accountIndex = size * 10 + index;
        samples.push(
          await measureOneAppend({
            userDataDir,
            accountIndex,
            seededCount: size,
            recordMetrics,
          })
        );
      }
      cells[size] = { size, samples };
    }
    const evidence = {
      environment: { ...environmentMetadata(), electron: process.versions.electron },
      cells,
    };
    const out = path.join(userDataDir, 'cdp-raw.json');
    fs.writeFileSync(out, JSON.stringify(evidence));
    process.stdout.write(`${out}\n`);
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
