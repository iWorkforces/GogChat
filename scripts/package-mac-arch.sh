#!/usr/bin/env bash
# Package a single-architecture macOS DMG for release.
# Usage: bash scripts/package-mac-arch.sh <arm64|x64>
set -euo pipefail

ARCH="${1:-}"
if [[ "${ARCH}" != "arm64" && "${ARCH}" != "x64" ]]; then
  echo "Usage: $0 <arm64|x64>" >&2
  exit 2
fi

export BUILD_ENV="${BUILD_ENV:-production}"

bun run build:prod
bun scripts/mac-release-signing.js --release

if [[ -n "${MAC_CSC_LINK:-}" ]]; then
  env -u MAC_CSC_LINK -u MAC_CSC_KEY_PASSWORD \
    BUILD_ENV="${BUILD_ENV}" \
    CSC_LINK="${MAC_CSC_LINK}" \
    CSC_KEY_PASSWORD="${MAC_CSC_KEY_PASSWORD}" \
    electron-builder --config electron-builder.sign.yml --mac --"${ARCH}" --publish never
else
  env -u MAC_CSC_LINK -u MAC_CSC_KEY_PASSWORD \
    -u CSC_LINK -u CSC_KEY_PASSWORD -u CSC_NAME -u CSC_KEYCHAIN \
    -u CSC_INSTALLER_LINK -u CSC_INSTALLER_KEY_PASSWORD \
    -u APPLE_ID -u APPLE_TEAM_ID -u APPLE_APP_PASSWORD \
    BUILD_ENV="${BUILD_ENV}" \
    CSC_IDENTITY_AUTO_DISCOVERY=false \
    electron-builder --config electron-builder.sign.yml --mac --"${ARCH}" --publish never
fi
