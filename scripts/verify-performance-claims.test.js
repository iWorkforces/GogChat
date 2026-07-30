import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  scanClaims,
  validateCandidateClaims,
  FORBIDDEN_CLAIM_PATTERNS,
} from './verify-performance-claims.js';

describe('verify-performance-claims', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-claims-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('detects forbidden overclaim phrases', () => {
    fs.writeFileSync(
      path.join(tmp, 'notes.md'),
      'We got 40% faster startup by pruning packages.\n'
    );
    const findings = scanClaims(tmp);
    expect(findings.length).toBeGreaterThan(0);
  });

  it('accepts clean documentation', () => {
    fs.writeFileSync(
      path.join(tmp, 'notes.md'),
      'Package inventory is smaller after excluding build-only tools. No runtime claim.\n'
    );
    const findings = scanClaims(tmp);
    expect(findings).toEqual([]);
  });

  it('flags CHANGE candidate without benchmark receipt', () => {
    fs.writeFileSync(
      path.join(tmp, 'task-9-unread.json'),
      JSON.stringify({ decision: 'CHANGE', candidate: 'unread' })
    );
    const r = validateCandidateClaims(tmp);
    expect(r.ok).toBe(false);
  });

  it('allows NO CHANGE candidate receipts', () => {
    fs.writeFileSync(
      path.join(tmp, 'task-9-cdp.json'),
      JSON.stringify({ decision: 'NO CHANGE', candidate: 'cdp' })
    );
    const r = validateCandidateClaims(tmp);
    expect(r.ok).toBe(true);
  });

  it('exports forbidden patterns', () => {
    expect(FORBIDDEN_CLAIM_PATTERNS.length).toBeGreaterThan(0);
  });
});
