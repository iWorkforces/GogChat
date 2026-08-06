# mac Packaging Guide

**Parent:** `../AGENTS.md`

`mac/` contains macOS packaging assets and DMG scripts for dual-arch Electron packaging (Apple Silicon `arm64` and Intel `x64`) as **separate** DMGs. Product version for artifact names comes from root `package.json` (currently **3.19.0**). Bundle id / notarize identity is fixed `com.ocworkforces.gogchat` (`scripts/app-identity.cjs` / `electron-builder.yml`). Windows release engineering/preparation lives outside this directory and is not a public support claim.

## Commands

```bash
bun run build:mac
bun run build:mac:dev
bun run build:mac:arm64
bun run build:mac:x64
bun run package
bun run package:mac:arm64
bun run package:mac:x64
bun run package:mac:release
bun run package:mac:artifacts
```

## DMG flow

- `build-macOS-dmg.sh` requires `--environment`; package scripts default `BUILD_ENV` to production/dev as appropriate.
- `build-macOS-dmg.sh` accepts `--arch arm64|x64` (default `arm64`). Production CI packages both arches as separate DMGs in a matrix.
- `build-macOS-dmg.sh` is mac-specific. Do not describe it as a Windows or cross-platform package path.
- Arch-pinned release packaging uses `scripts/package-mac-arch.sh` via `package:mac:arm64` / `package:mac:x64`.
- `package:mac:release` is an arm64 alias for local/backward-compatible use only; release CI must not treat it as dual-arch.
- Artifact names: `${productName}-${version}-arm64.dmg` and `${productName}-${version}-x64.dmg`.
- Build the app before packaging (the arch package helper already runs `build:prod`).
- Mount, copy, sign/notarize when configured, detach, then verify artifacts.
- Always force-detach mounted DMGs on failure paths.

## electron-builder arch pinning

- Supported packaging arches are arm64 and x64.
- **Do not** list both arches under `mac.target.arch` in `electron-builder.yml`. electron-builder then builds every listed arch even when the CLI only passes `--arm64` or `--x64`.
- Always pin exactly one arch on the CLI (`--arm64` or `--x64`) for release and matrix jobs.
- Do not introduce a universal binary unless a separate, explicit plan approves it.
- Forbidden artifact labels: `amd64`, `ia32`, `universal`.

## Signing/notarization

- Code signing is optional for local development but required for release-quality artifacts when credentials are configured.
- Release preflight: `scripts/mac-release-signing.js --release` — complete `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` pair, or both omitted (unsigned). Partial pairs fail closed.
- When signing is configured, notarization requires `APPLE_ID`, `APPLE_TEAM_ID`, and `APPLE_APP_PASSWORD` (`scripts/notarize.cjs`).
- Signed CI legs run `scripts/verify-mac-release-signing.js` (codesign / spctl / stapler) on that job's single-arch `dist/`.
- Never print signing credentials or notarization passwords.
- Missing credentials → explicit `[blocked: credentials unavailable]` for release-quality claims, never silent success.

## Asset rules

- Keep DMG background/icons aligned with generated icon assets from `scripts/`.
- Use `resources/AGENTS.md` for icon variant names and generation rules before changing packaged icons.
- Packaging assets include `electron-builder.yml`, `electron-builder.sign.yml`, and `entitlements.mac*.plist`.
- `electron-builder.yml` excludes proven build-only toolchains (`@rslib`, `@rspack`, `@ast-grep`); keep that aligned with `scripts/verify-packaged-dependency-closure.js`.
- Both arches share the same `resources/icons/normal/mac.icns` and entitlements.
- Do not edit files inside a mounted DMG as the source of truth.
- Do not claim full Intel runtime support in user-facing docs without packaged smoke on real Intel hardware (or an explicit owner waiver).
- Do not add Windows support claims here. Windows publication wording requires clean packaged smoke evidence on Windows x64 and real Windows arm64.

## Performance / package size claims

- Smaller package inventory is a delivery-size fact only after closure proof + smoke.
- Do not claim startup improvements from package bytes alone.
- Per-arch post-pack optimizations run in `scripts/after-pack.cjs` for darwin arm64 and x64.

## Anti-patterns

- No packaging without a fresh build.
- No multi-arch electron-builder target lists that defeat CLI single-arch pins.
- No skipping forced detach cleanup.
- No release artifact upload from local scripts unless explicitly requested.
- No removing runtime dependencies without a green packaged-dependency-closure report.
