# Scripts Guide

**Parent:** `../AGENTS.md`

Scripts drive the dual Rsbuild pipeline, feature-plan generation, packaging, notarization, icon assets, hooks, and performance gates.

## Key scripts

### Build and feature plan

- `build-rsbuild.js` - builds ESM main and CJS preload, copies offline assets, preserves preload `cleanDistPath: false`, records `buildTimeMs` and `lib/chunks/*.js` counts in `.build-history.json`. With `ANALYZE=true`, writes machine-readable stats under the evidence root.
- `featurePlanPlugin.js` - parses initializer specs with the TypeScript compiler API, unwraps `as const satisfies`, topologically batches dependencies, and idempotently writes `src/main/generated/featurePlan.ts`.

### Performance (CI unauthenticated path)

- `headless-startup.js` - launches Electron with a temp userData dir, waits for versioned `performance-metrics.json`, validates schema/completeness per run, refuses medians from incomplete data. Supports `GOGCHAT_PERF_RUNS`.
- `check-perf-budget.js` - gated budgets fail on absence or exceedance; warn-only may SKIP/WARN. Memory is MB (not bytes). Renamed metrics: `nativeWindowReady`, `contentDocumentLoaded`. Baseline updates only with `PERF_UPDATE_BASELINE=1` and compatible schema/units.
- `account-backend-benchmark.js` - BrowserWindow / WebContentsView matrix contract (1/2/4 accounts, lifecycle states). Does **not** select a backend policy or declare a resource winner.
- `performance-candidate-benchmark.js` - threshold-gated candidate decisions (unread, cdp, timers, split-chunks, preconnect). Product changes only when 20-pair / 10% median / 5% p95 rules pass; otherwise `NO CHANGE`.
- `release-auth-readiness-benchmark.js` - secured authenticated first-interaction path. Without credentials records `[blocked: credentials unavailable]` (conditional core remediation only, never release-readiness approval).

### Packaging and release

- `verify-packaged-dependency-closure.js` - derives runtime externals from emitted main/preload imports + Rsbuild string externals; classifies packages (including `@rspack`, `@ast-grep`, `@rslib`); compares to packaged fixture/artifact. Run **before** removing payload.
- `notarize.cjs` - uses notarytool with `APPLE_ID`, `APPLE_APP_PASSWORD`, and `APPLE_TEAM_ID`.
- `after-pack.cjs` and `remove-locales.js` - strip unused binaries/locales during packaging.
- `verify-windows-package-artifacts.js` - checks guarded Windows NSIS setup names, required x64/arm64 outputs, and forbidden package types.
- `verify-windows-signing-policy.js` - blocks Windows release publication unless `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` exists or the owner explicitly allows unsigned Windows assets.
- `verify-release-artifacts.js` - verifies the aggregated macOS DMG plus guarded Windows x64/arm64 setup artifacts before the single publish job.

### Evidence and claims

- `verify-remediation-evidence.js` - validates Todo evidence receipts and distinguishes core-remediation vs release-readiness approval.
- `verify-performance-claims.js` - rejects unsupported runtime-savings claims (package bytes ≠ startup wins).
- `hooks/pre-push` - blocks pushes on lint/check failures.

## Build invariants

- Do not convert the preload build to ESM.
- Do not remove `cleanDistPath: false`; otherwise one Rsbuild pass can delete the other output.
- Do not modify offline asset output paths unless `src/offline/AGENTS.md` contracts are updated too.
- Do not replace the feature-plan plugin with runtime registration.
- Count emitted async chunks as `lib/chunks/*.js` (not the stale `*.chunk.js` suffix).
- Pass real wall-clock `buildTimeMs` into build history; do not leave it absent in production builds.
- Build-only packages (`@rslib`, `@rspack`, `@ast-grep`) must not enter runtime dependencies or the packaged app without closure proof.

## Feature-plan plugin rules

- It intentionally ignores implementation `init`/`cleanup` bodies and reads declarative spec metadata.
- Dependency sorting is greedy by batch; preserve deterministic output.
- Export pure helpers such as `buildPlanFromSources` for tests.

## Performance scripts

- Headless startup uses env such as `NODE_ENV=development`, `GOGCHAT_EXPORT_METRICS=1`, `GOGCHAT_AUTO_QUIT_AFTER_MS=12000` (capture timeout), and `CI=1`.
- CI may set `HEADLESS_TIMEOUT_MS=60000` and `GOGCHAT_PERF_RUNS=5`.
- Metrics are produced by the main-process finalizer after document load + deferred + renderer sample — not by early deferred-phase export.
- Schema version and `units.memory: "MB"` / `units.time: "ms"` are required; incomplete or invalid runs must not feed medians or gated PASS.
- Gated vs warn-only budget behavior must stay explicit. Missing gated metrics → exit 1. IPC latency remains warn-only until a real producer and baseline exist.
- Do not represent `account-0-ready` or `account-0-content-loaded` as first paint or first interaction in script messages or claims.
- Evidence root convention: `.omo/evidence/performance-remediation/task-<N>-*.{json,md,log}`.

## Packaging

- macOS DMG/package behavior is also documented in `mac/AGENTS.md`; `build-macOS-dmg.sh` remains mac-specific.
- `package:mac:release` is the current macOS release package command.
- `package:win:x64`, `package:win:arm64`, `package:win:artifacts`, and `package:win:signing-policy` cover Windows release-engineering preparation only, not a public support claim.
- Windows setup artifacts must stay as separate NSIS installers named `${productName}-${version}-windows-x64-setup.exe` and `${productName}-${version}-windows-arm64-setup.exe`.
- Native Windows CI packaging runs x64 on `windows-latest` with AMD64 proof and arm64 on `windows-11-arm` with ARM64 proof.
- `electron-builder.yml` excludes proven build-only namespaces (`@rslib`, `@rspack`, `@ast-grep`); keep that aligned with the closure report.
- Never call packaging scripts without building first.
- Never remove a dependency from the package without a green closure report and disposable package smoke.
- Do not log secrets from signing/notarization environment variables.
- Missing signing/auth credentials → explicit `[blocked: credentials unavailable]`, not silent success.
