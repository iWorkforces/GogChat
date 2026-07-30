import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildComplianceReport,
  classifyStatus,
  scanEvidence,
  REQUIRED_TODO_RECEIPTS,
} from './verify-remediation-evidence.js';

describe('verify-remediation-evidence', () => {
  let tmp;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-evidence-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('classifies credential blocked status', () => {
    expect(classifyStatus('[blocked: credentials unavailable]')).toBe('blocked-credentials');
    expect(classifyStatus('pass')).toBe('pass');
    expect(classifyStatus('NO CHANGE')).toBe('no-change');
  });

  it('fails compliance when receipts are missing', () => {
    const report = buildComplianceReport(tmp);
    expect(report.ok).toBe(false);
    expect(report.todos.every((t) => t.status === 'fail')).toBe(true);
  });

  it('passes when every required todo has a receipt file', () => {
    for (const task of REQUIRED_TODO_RECEIPTS) {
      fs.writeFileSync(
        path.join(tmp, `${task}-receipt.json`),
        JSON.stringify({ status: 'pass', ok: true })
      );
    }
    // Also drop a credential-blocked release marker
    fs.writeFileSync(
      path.join(tmp, 'task-8-auth.json'),
      JSON.stringify({ status: '[blocked: credentials unavailable]' })
    );
    const report = buildComplianceReport(tmp);
    expect(report.ok).toBe(true);
    expect(report.todos.every((t) => t.status === 'pass' || t.status === 'blocked')).toBe(true);
  });

  it('scanEvidence groups by task id', () => {
    fs.writeFileSync(path.join(tmp, 'task-1-valid-run.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'task-5-closure.json'), '{}');
    const { byTask } = scanEvidence(tmp);
    expect(byTask['task-1']).toBeDefined();
    expect(byTask['task-5']).toBeDefined();
  });
});
