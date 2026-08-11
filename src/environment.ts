import { app } from 'electron';
import urls from './urls.js';

// Note: don't try to load this file in renderer process

/**
 * Playwright/Electron fixtures may point account-0 at a local harness.
 * Production (`TESTING` unset) always uses the Chat URL. Only `file:` and
 * loopback `http:` overrides are accepted so a leaked env cannot retarget prod.
 */
export function resolveAppUrl(
  env: NodeJS.ProcessEnv = process.env,
  fallback: string = urls.appUrl
): string {
  if (env['TESTING'] !== 'true') {
    return fallback;
  }
  const raw = env['GOGCHAT_TEST_APP_URL']?.trim();
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'file:') {
      return raw;
    }
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    ) {
      return raw;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export default Object.freeze(
  Object.assign(
    {
      isDev: !app.isPackaged,
    },
    urls,
    { appUrl: resolveAppUrl() }
  )
);
