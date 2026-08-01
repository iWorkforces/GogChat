/**
 * App identity constants for packaging / notarization (CJS).
 *
 * Keep in lockstep with `src/shared/appIdentity.ts` (`APP_IDENTITY.appId`).
 * Do not derive bundle IDs from productFilename — that caused the
 * `com.ocworkforcess.*` typo and case/name drift.
 */
'use strict';

/** @type {string} macOS / Electron appId — must match electron-builder.yml appId */
const APP_ID = 'com.ocworkforces.gogchat';

/** @type {string} Product display name */
const PRODUCT_NAME = 'GogChat';

module.exports = {
  APP_ID,
  PRODUCT_NAME,
  /** Alias used by notarize for clarity */
  NOTARIZE_BUNDLE_ID: APP_ID,
};
