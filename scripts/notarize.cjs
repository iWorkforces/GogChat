/**
 * notarize.cjs — Apple notarization for macOS builds
 *
 * This hook runs after signing the app. It submits the app to Apple
 * for notarization, which is required for distribution outside the App Store.
 *
 * Requires environment variables:
 * - APPLE_ID: Your Apple ID email
 * - APPLE_TEAM_ID: Your Apple Developer Team ID
 * - APPLE_APP_PASSWORD: App-specific password for your Apple ID
 *
 * bundleId is the fixed app identity from scripts/app-identity.cjs
 * (same as src/shared/appIdentity.ts / electron-builder.yml appId).
 * Never derive it from productFilename.
 */
const { notarize } = require('@electron/notarize');
const { NOTARIZE_BUNDLE_ID } = require('./app-identity.cjs');

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appleId = process.env['APPLE_ID'];
  const appleTeamId = process.env['APPLE_TEAM_ID'];
  const appleAppPassword = process.env['APPLE_APP_PASSWORD'];

  if (!appleId || !appleTeamId || !appleAppPassword) {
    console.warn(
      '[notarize] Skipping: APPLE_ID, APPLE_TEAM_ID, or APPLE_APP_PASSWORD not set'
    );
    return;
  }

  console.log(`[notarize] Notarizing ${appName} (${NOTARIZE_BUNDLE_ID})...`);

  await notarize({
    bundleId: NOTARIZE_BUNDLE_ID,
    tool: 'notarytool',
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword: appleAppPassword,
    teamId: appleTeamId,
  });
};
