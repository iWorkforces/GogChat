# mac Packaging Guide

**Parent:** `../AGENTS.md`

`mac/` contains macOS packaging assets and DMG scripts for an Apple Silicon focused Electron app. Windows release engineering/preparation lives outside this directory and is not a public support claim.

## Commands

```bash
bun run build:mac
bun run build:mac:dev
bun run package
bun run package:mac:release
```

## DMG flow

- `build-macOS-dmg.sh` requires `BUILD_ENV`; package scripts default it to production/dev as appropriate.
- `build-macOS-dmg.sh` is mac-specific. Do not describe it as a Windows or cross-platform package path.
- Build the app before packaging.
- Mount, copy, sign/notarize when configured, detach, then verify artifacts.
- Always force-detach mounted DMGs on failure paths.

## Signing/notarization

- Code signing is optional for local development but required for release quality artifacts.
- Notarization uses script/env plumbing from `scripts/notarize.cjs`.
- Required release env vars include `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_PASSWORD`.
- Never print signing credentials or notarization passwords.

## Asset rules

- Keep DMG background/icons aligned with generated icon assets from `scripts/`.
- Use `resources/AGENTS.md` for icon variant names and generation rules before changing packaged icons.
- Packaging assets include `electron-builder.yml`, `electron-builder.sign.yml`, and `entitlements.mac*.plist`.
- `electron-builder.yml` excludes proven build-only toolchains (`@rslib`, `@rspack`, `@ast-grep`); keep that aligned with `scripts/verify-packaged-dependency-closure.js`.
- Do not edit files inside a mounted DMG as the source of truth.
- Do not add Intel-specific assumptions unless product support changes.
- Do not add Windows support claims here. Windows publication wording requires clean packaged smoke evidence on Windows x64 and real Windows arm64.

## Performance / package size claims

- Smaller package inventory is a delivery-size fact only after closure proof + smoke.
- Do not claim startup improvements from package bytes alone.
- Signed/notarized validation missing credentials → record `[blocked: credentials unavailable]`, never silent release-quality success.

## Anti-patterns

- No packaging without a fresh build.
- No skipping forced detach cleanup.
- No release artifact upload from local scripts unless explicitly requested.
- No removing runtime dependencies without a green packaged-dependency-closure report.
