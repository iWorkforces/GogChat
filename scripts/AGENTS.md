# Scripts Guide

**Parent:** `../AGENTS.md`

Scripts drive the dual Rsbuild pipeline, feature-plan generation, packaging, notarization, icon assets, hooks, and performance gates.

## Key scripts

### Build and feature plan

- `build-rsbuild.js` - builds ESM main and CJS preload, copies offline assets, preserves preload `cleanDistPath: false`, records `buildTimeMs` and `lib/chunks/*.js` counts in `.build-history.json`. With `ANALYZE=true`, writes machine-readable stats under the evidence root.
- `featurePlanPlugin.js` / `featureSpecParser.js` - parse initializer specs with the installed TypeScript 6.x compiler API (`createSourceFile`; typecheck still uses `@typescript/native` / TS 7), unwrap `as const satisfies` / parens, fail closed on unsupported array elements, topologically batch dependencies, reject forward-phase deps (`security < critical < ui < deferred`), and write `src/main/generated/featurePlan.ts` only after the full source is built. Unsupported expressions are rejected with file, element index, and property.
- `install-electron-binary.js` - repo-controlled Electron zip extract for macOS CI (ditto); respects `npm_config_arch` and Rosetta detection. Pin target arch when packaging non-host arches.

### Performance (CI unauthenticated path)

- `headless-startup.js` - launches Electron with a temp userData dir, waits for versioned `performance-metrics.json`, validates schema/completeness per run, refuses medians from incomplete data. Supports `GOGCHAT_PERF_RUNS`. Multi-run `rendererSnapshots` are the complete list from the upper-median complete+valid run: unique identity is `(pid, creationTime)` when `creationTime` exists, otherwise PID; candidates are stable-sorted by that count then original index; pick `floor(validRunCount / 2)`. Incomplete runs never supply representative snapshots and still fail aggregate completeness. Do not copy the last run or synthesize snapshot fields.
- `check-perf-budget.js` - gated budgets fail on absence or exceedance; warn-only may SKIP/WARN. Memory is MB (not bytes). `rendererCount` uses the same `(pid, creationTime)` / PID identity on the representative snapshots and cannot false-pass from a final low-count run. Renamed metrics: `nativeWindowReady`, `contentDocumentLoaded`. Baseline updates only with `PERF_UPDATE_BASELINE=1` and compatible schema/units.
- `account-backend-benchmark.js` - BrowserWindow / WebContentsView matrix contract (1/2/4 accounts, lifecycle states). Does **not** select a backend policy or declare a resource winner.
- `performance-candidate-benchmark.js` - threshold-gated candidate decisions (unread, cdp, timers, split-chunks, preconnect). Product changes only when 20-pair / 10% median / 5% p95 rules pass; otherwise `NO CHANGE`.
- `release-auth-readiness-benchmark.js` - secured authenticated first-interaction path. Without credentials records `[blocked: credentials unavailable]` (conditional core remediation only, never release-readiness approval).

### Packaging and release

- `package-mac-arch.sh` - shared arch-pinned macOS release package helper (`arm64` or `x64`): `build:prod`, signing preflight, single-arch electron-builder with `--publish never`.
- `mac-release-signing.js` - release signing/notarization credential pair policy for macOS.
- `verify-mac-release-signing.js` - codesign / spctl / stapler trust checks on a macOS GHA runner for the current job's `dist/`.
- `verify-macos-package-artifacts.js` - checks macOS DMG basenames, required arm64/x64 outputs, duplicates, and forbidden labels (`amd64`, `ia32`, `universal`).
- `verify-packaged-dependency-closure.js` - derives runtime externals from emitted main/preload imports + Rsbuild string externals; classifies packages (including `@rspack`, `@ast-grep`, `@rslib`); compares to packaged fixture/artifact. Run **before** removing payload.
- `verify-packaged-preload.js` - packaged-presence only: `lib/preload/index.js` plus relative CommonJS chunks required by that entry. Does not prove execution (that is Todo 7's built-CJS fixture).
- `app-identity.cjs` - fixed `APP_ID` / `NOTARIZE_BUNDLE_ID` = `com.ocworkforces.gogchat`. Keep lockstep with `src/shared/appIdentity.ts` and `electron-builder.yml` `appId`. Covered by `notarize-identity.test.js` (forbids productFilename-derived / typo bundle ids).
- `notarize.cjs` - uses notarytool with `APPLE_ID`, `APPLE_APP_PASSWORD`, and `APPLE_TEAM_ID`; bundle id from `app-identity.cjs` only.
- `after-pack.cjs` - strip/locale optimizations for darwin **arm64 and x64** (not universal).
- `remove-locales.js` - standalone locale helper; accepts optional arch (`arm64` default, or `x64`). Prefer after-pack for release packaging.
- `verify-windows-package-artifacts.js` - checks guarded Windows NSIS setup names, required x64/arm64 outputs, and forbidden package types.
- `verify-windows-signing-policy.js` - blocks Windows release publication unless `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` exists or the owner explicitly allows unsigned Windows assets.
- `verify-release-artifacts.js` - verifies aggregated **macOS arm64 + x64 DMGs** plus guarded Windows x64/arm64 setups before the single publish job.
- Contract tests: `package-scaffold.test.js`, `playwright-config.test.js` (four isolated Playwright projects, no overlapping `testMatch`), `release-workflow.test.js`, `verify-macos-package-artifacts.test.js`, `verify-release-artifacts.test.js`, `mac-release-signing.test.js`, `verify-mac-release-signing.test.js`, Windows artifact/signing tests.

### Evidence and claims

- `verify-remediation-evidence.js` - validates Todo evidence receipts and distinguishes core-remediation vs release-readiness approval.
- `verify-performance-claims.js` - rejects unsupported runtime-savings claims (package bytes ≠ startup wins).
- `check-doc-claims.js` - audits documented AGENTS claims against source (singleton destroyers, lazy cleanups, branded helpers, feature isolation). Pure config readers (for example `accountLabelStore` get helpers) and pure helpers such as `accountNavigation.getAccountURL` belong on the destroyer allowlist when they are not process singletons. Architecture-scoped only — does not assert version strings or marketing TLS claims.
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

- It intentionally ignores implementation `init`/`cleanup` bodies and reads declarative spec metadata via the TypeScript compiler API.
- Every exported array element must be an object literal with static identifier or string keys. Reject spreads, calls, identifiers, conditionals, holes, computed names, and malformed known metadata.
- Same-phase and earlier-phase dependencies are allowed. Forward-phase dependencies are rejected.
- Build the complete generated source before writing; a parse/plan error must leave any existing output file unchanged.
- Dependency sorting is greedy by batch; preserve deterministic output.
- Export pure helpers such as `buildPlanFromSources` for tests.
- Do not evaluate arbitrary expressions or inspect `init`/`cleanup` bodies.

## Performance scripts

- Headless startup uses env such as `NODE_ENV=development`, `GOGCHAT_EXPORT_METRICS=1`, `GOGCHAT_AUTO_QUIT_AFTER_MS=12000` (capture timeout), and `CI=1`.
- CI may set `HEADLESS_TIMEOUT_MS=60000` and `GOGCHAT_PERF_RUNS=5`.
- Optional product env toggles (not script-only):
  - `GOGCHAT_V8_HEAP_CAP_MB` — renderer V8 heap cap before ready (default 512, clamp 128–4096).
  - `GOGCHAT_DISABLE_PRECONNECT=1` — skip Google domain session preconnect for A/B cold-start measurement.
- Metrics are produced by the main-process finalizer after document load + deferred + renderer sample — not by early deferred-phase export.
- Schema version and `units.memory: "MB"` / `units.time: "ms"` are required; incomplete or invalid runs must not feed medians or gated PASS.
- Multi-run renderer evidence is the upper-median complete run's full `rendererSnapshots` (identity `(pid, creationTime)` else PID; pick `floor(n / 2)` after sorting by count then original index). Never last-run copy, incomplete rows, or synthesized snapshot fields. Budget `rendererCount` uses that same identity.
- Gated vs warn-only budget behavior must stay explicit. Missing gated metrics → exit 1. IPC latency remains warn-only until a real producer and baseline exist.
- Do not represent `account-0-ready` or `account-0-content-loaded` as first paint or first interaction in script messages or claims.
- Evidence roots: `.omo/evidence/performance-remediation/task-<N>-*.{json,md,log}`, `.omo/evidence/macos-intel-x64-dmg/` for dual-arch packaging receipts, `.omo/evidence/deep-enhancements/` for dual-backend/truth/safety closeout, and `.omo/evidence/stability-performance-remediation/` for the active liveness/preload/release plan (often gitignored).
- CDP persistence harness: `scripts/cdp-persistence-benchmark.js` + Electron child `scripts/cdp-persistence-child.js`. It loads the built `lib/chunks/cdpMetrics.js` `recordMetrics` entry into a unique temp `userData`, seeds 1/100/1000-record files, and emits raw samples. Valid evidence requires ≥20 samples per size; receipt-only `NO CHANGE` is rejected. Do not edit `cdpTelemetry.ts` / `cdpMetrics.ts` from this harness.

## Packaging

- macOS DMG/package behavior is also documented in `mac/AGENTS.md`; `build-macOS-dmg.sh` remains mac-specific and accepts `--arch arm64|x64`.
- `package:mac:arm64` and `package:mac:x64` are the arch-pinned macOS release package commands; `package:mac:release` is an arm64 alias. `package:mac:artifacts` requires both DMG arches.
- Production release CI packages both macOS arches on `macos-latest` via a matrix (`package:mac:${{ matrix.arch }}`). x64 is cross-packaged with electron-builder (host may be arm64).
- **Do not** list both arches under `mac.target.arch` in `electron-builder.yml` — that forces multi-arch builds and defeats CLI single-arch pins.
- macOS DMG names: `${productName}-${version}-arm64.dmg` and `${productName}-${version}-x64.dmg`. No `amd64` / `universal` labels.
- Aggregate gate (`verify-release-artifacts`) fails closed if either macOS arch is missing.
- `package:win:x64`, `package:win:arm64`, `package:win:artifacts`, and `package:win:signing-policy` cover Windows release-engineering preparation only, not a public support claim.
- Windows setup artifacts must stay as separate NSIS installers named `${productName}-${version}-windows-x64-setup.exe` and `${productName}-${version}-windows-arm64-setup.exe`.
- Native Windows CI packaging runs x64 on `windows-latest` with AMD64 proof and arm64 on `windows-11-arm` with ARM64 proof.
- `electron-builder.yml` excludes proven build-only namespaces (`@rslib`, `@rspack`, `@ast-grep`); keep that aligned with the closure report.

### Current CI (do not invent extra gates)

- **PR Check** (`.github/workflows/pr-check.yml`): frozen install → Electron binary → literal typecheck → `bun scripts/check-doc-claims.js` → `bash ./scripts/lint.sh` → literal Vitest coverage (no second unit run) → madge → `bun scripts/build-rsbuild.js` → Playwright `e2e`/`integration`/`performance`/`preload-artifact` → five-run headless (`GOGCHAT_PERF_RUNS=5 HEADLESS_TIMEOUT_MS=90000 node scripts/headless-startup.js`) → `node scripts/check-perf-budget.js performance-metrics.json` → always-upload metrics and `coverage-output.txt`. Contract: `scripts/pr-workflow.test.js`.
- **Release** (`.github/workflows/release.yml`): `prepare-release` is read-only exact-SHA eligibility via `scripts/release-eligibility.js`. `inspectRemoteTag` peels annotated tags (`refs/tags/vX^{}`) to the commit SHA and `sanitizeReleaseTagName` rejects anything that is not `v?[A-Za-z0-9][A-Za-z0-9._-]*`. Assert `should_release` for absent/same-SHA (`true`) and wrong-SHA/tag-trigger (`false`). `qualify-release` then runs the PR-check gate set on that SHA. mac arm64/x64 and Windows x64/arm64 package jobs need both prepare and qualify and check out the emitted SHA. Aggregate verify needs all four builds. `create-release-tag` is the sole tag writer (`scripts/release-tag.js`): recheck remote, create if absent, retry if same SHA, fail if wrong SHA, never force-push/delete/move; push `refs/tags/<name>` only. Job concurrency is `create-release-tag-${tag}` with `cancel-in-progress: false`. Publish needs verified assets and the created tag; a publish failure leaves the qualified tag for a later retry. Only create-tag and publish have `contents: write`. Candidate tag is `v3.20.0` from `package.json`. Do not retarget or move the existing remote `v3.19.0` (wrong-SHA vs this branch).
- Typecheck uses `@typescript/native` (TS 7). The `typescript` package on disk is 6.x and is **not** the typecheck binary.

- Never call packaging scripts without building first.
- Never remove a dependency from the package without a green closure report and disposable package smoke.
- Do not log secrets from signing/notarization environment variables.
- Missing signing/auth credentials → explicit `[blocked: credentials unavailable]`, not silent success.
