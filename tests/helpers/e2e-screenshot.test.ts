import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { E2E_SCREENSHOT_TIMEOUT_MS, isCiScreenshotDisabled, takeScreenshot } from './electron-test';

const E2E_WORKFLOW = path.resolve(import.meta.dirname, '../e2e/user-workflows.test.ts');

describe('e2e screenshot and auth skip helpers', () => {
  const previousCi = process.env.CI;
  const previousGha = process.env.GITHUB_ACTIONS;

  afterEach(() => {
    restoreEnv('CI', previousCi);
    restoreEnv('GITHUB_ACTIONS', previousGha);
    vi.restoreAllMocks();
  });

  it('disables capture on CI or GitHub Actions and keeps it on locally', () => {
    expect(isCiScreenshotDisabled({ CI: 'true' })).toBe(true);
    expect(isCiScreenshotDisabled({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(isCiScreenshotDisabled({ CI: '', GITHUB_ACTIONS: '' })).toBe(false);
    expect(isCiScreenshotDisabled({})).toBe(false);
    expect(E2E_SCREENSHOT_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it('no-ops page.screenshot on CI and still creates the local screenshot dir', async () => {
    process.env.CI = 'true';
    delete process.env.GITHUB_ACTIONS;
    const screenshot = vi.fn();
    const buffer = await takeScreenshot({ screenshot } as never, 'ci-noop');
    expect(screenshot).not.toHaveBeenCalled();
    expect(buffer.equals(Buffer.alloc(0))).toBe(true);
    expect(fs.existsSync(path.resolve(import.meta.dirname, '../screenshots'))).toBe(true);
  });

  it('takes a viewport screenshot with a 5s timeout when not in CI', async () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    const png = Buffer.from('png');
    const screenshot = vi.fn().mockResolvedValue(png);
    const buffer = await takeScreenshot({ screenshot } as never, 'local-viewport');
    expect(buffer).toBe(png);
    expect(screenshot).toHaveBeenCalledTimes(1);
    const options = screenshot.mock.calls[0]?.[0] as {
      fullPage?: boolean;
      timeout?: number;
      path?: string;
    };
    expect(options.fullPage).toBe(false);
    expect(options.timeout).toBeLessThanOrEqual(5000);
    expect(options.path).toMatch(/local-viewport\.png$/);
  });

  it('skips signed-in e2e flows on CI and unless a conversation list exists', () => {
    const source = fs.readFileSync(E2E_WORKFLOW, 'utf8');
    expect(source).not.toMatch(/locator\('\[[^\]]*role="main"[^\]]*\]'\)\.count\(\)/);
    expect(source).not.toMatch(/locator\('\[[^\]]*role="navigation"[^\]]*\]'\)\.count\(\)/);
    expect(source).toContain('locator(\'[role="listitem"]\').count()');
    expect(source).toContain("process.env['CI'] || process.env['GITHUB_ACTIONS']");
    expect(source).toContain(
      "test.skip(conversationCount === 0, 'unauthenticated CI has no Google session')"
    );
    expect(source).toContain('window.setSize(1024, 768)');
    expect(source).not.toContain('toBeLessThanOrEqual(80)');
  });

  it('does not pin exact window sizes or unbounded networkidle on CI Electron suites', () => {
    const integrationLaunch = fs.readFileSync(
      path.resolve(import.meta.dirname, '../integration/app-launch.test.ts'),
      'utf8'
    );
    const multiAccount = fs.readFileSync(
      path.resolve(import.meta.dirname, '../integration/multi-account.test.ts'),
      'utf8'
    );
    const performance = fs.readFileSync(
      path.resolve(import.meta.dirname, '../performance/performance-regression.test.ts'),
      'utf8'
    );
    expect(integrationLaunch).not.toMatch(/waitForLoadState\(\s*'networkidle'\s*\)/);
    expect(integrationLaunch).toContain('isGoogleSurfaceUrl');
    expect(multiAccount).not.toContain('toBe(800)');
    expect(multiAccount).not.toContain('toBe(600)');
    expect(performance).not.toMatch(/waitForLoadState\(\s*'networkidle'\s*\)/);
    expect(performance).toContain('waitForLoadStateBounded');
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
