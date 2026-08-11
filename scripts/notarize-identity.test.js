/**
 * Contract tests: notarize bundleId matches app identity (no productFilename derivation).
 */
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const ROOT = join(import.meta.dirname, '..');
const EXPECTED_APP_ID = 'com.ocworkforces.gogchat';

describe('notarize identity (KD7)', () => {
  it('exports APP_ID / NOTARIZE_BUNDLE_ID matching appIdentity', () => {
    const identity = require('./app-identity.cjs');
    expect(identity.APP_ID).toBe(EXPECTED_APP_ID);
    expect(identity.NOTARIZE_BUNDLE_ID).toBe(EXPECTED_APP_ID);
    expect(identity.PRODUCT_NAME).toBe('GogChat');
  });

  it('matches src/shared/appIdentity.ts appId', () => {
    const ts = readFileSync(join(ROOT, 'src/shared/appIdentity.ts'), 'utf8');
    expect(ts).toContain(`appId: '${EXPECTED_APP_ID}'`);
  });

  it('matches electron-builder.yml appId', () => {
    const yml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8');
    expect(yml).toMatch(new RegExp(`^appId:\\s*${EXPECTED_APP_ID}\\s*$`, 'm'));
  });

  it('notarize.cjs uses NOTARIZE_BUNDLE_ID and does not derive from productFilename', () => {
    const src = readFileSync(join(ROOT, 'scripts/notarize.cjs'), 'utf8');
    expect(src).toContain("require('./app-identity.cjs')");
    expect(src).toContain('bundleId: NOTARIZE_BUNDLE_ID');
    expect(src).not.toContain('ocworkforcess');
    expect(src).not.toMatch(/bundleId:\s*`com\.ocworkforces\.\$\{/);
    expect(src).not.toMatch(/bundleId:\s*`com\.ocworkforcess/);
    expect(src).toContain('APPLE_APP_PASSWORD');
  });
});
