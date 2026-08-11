# Tests Guide

**Parent:** `../AGENTS.md`

Tests cover unit, integration, e2e, performance, and packaging-contract behavior for an Electron app. Use `bun` commands only.

## Commands

```bash
bun run test
bun run test:run
bun run test:coverage
bun run typecheck
bun run build:prod
bun run check:doc-claims
```

## Test tiers

- Unit: Vitest, colocated `*.test.ts` and `scripts/**/*.test.js` (included by `vitest.config.ts`).
- Integration/e2e/performance: Playwright/Electron helpers under `tests/`. `*.spec.ts` under `initializers/` are **feature-plan input**, not tests.
- Playwright config: `testDir: './tests'`, `workers: 1`, timeout 60000 (e2e project 120000 for cold macos CI document load), retries 0, four isolated projects — `e2e`, `integration`, `performance`, `preload-artifact`. Contract: `scripts/playwright-config.test.js`. `preload-artifact` executes `tests/artifact/preload/preload-entry.test.ts` against built `lib/preload/index.js`.
- Coverage thresholds in `vitest.config.ts`: statements 94, branches 92, functions 94, lines 94. Include is `src/**/*.ts` only.
- Coverage includes remediates seams: `src/preload/**` (except `overrideNotifications.ts`), `registerAppReady.ts`, `inOnline.ts`, `appUpdates.ts`, and `defineIPC.ts`. CDP product files and `src/main/generated/**` stay excluded. Thresholds remain 94/92/94/94. Todo 18 closed remaining branch gaps with colocated happy/failure tests only (no production or threshold edits).
- Evidence classes (source-unit, built-CJS execution, packaged-presence, packaged-runtime, headless, workflow) are defined in root `AGENTS.md`. Do not substitute one for another.

## Electron test helpers

- Import fixtures from `tests/helpers/electron-test.ts`, not directly from `@playwright/test`.
- Use `tests/mocks/electron.ts` for Electron mocks.
- Reset with `electronMock.reset()` and `vi.clearAllMocks()` between cases.
- Keep `tests/polyfill-crypto.cjs` loaded for crypto-dependent unit tests.
- Electron 43 evaluate is ESM: do not call `require()` or `import()` inside `electronApp.evaluate`. Use `BrowserWindow` APIs, `evaluateWithRequire` (binds CJS `require` via `process.getBuiltinModule`), or `TESTING` hooks such as `__gogchatGetAccountWindowManager`. `Page.isVisible()` needs a selector — use `isMainWindowVisible()` for a snapshot or `waitForMainWindowVisible()` until native `show`. Skip authenticated Chat UI when no session exists. Accept `workspace.google.com` as a Chat landing URL. Do not wait on unbounded `networkidle` (Chat keeps sockets open) — use `waitForLoadStateBounded`. Do not assert exact `setSize` pixels on macOS CI; product mins are 480×570. Unauthenticated CI may land on `accounts.google.com` (`isGoogleSurfaceUrl`).
- `GOGCHAT_TEST_HANG_SHUTDOWN` is opt-in via `test.use({ extraElectronEnv: { GOGCHAT_TEST_HANG_SHUTDOWN: 'feature' } })`. The default Electron fixture strips that env so other integration files cannot inherit a hung shutdown.
- Do not leave `expect(true).toBe(true)` or “window still exists” as the only assertion when the case claims to exercise IPC or the account manager.

## What to test

- Startup/spec changes: generated feature plan and phase ordering. App-ready orchestration: `src/main/initializers/registerAppReady.test.ts` (preconnect before account-0, account WC load markers, UI before deferred).
- IPC changes: validation, rate limiting, dedup behavior, success and failure paths.
- Account changes: partition persistence, auth-page protection, switching, dehydration, single hydration navigation, `enumerateAccountWebContents` (both backends), sparse `listAccountIndices` / `hasAccount` (includes dehydrated), WCV three-state, hooks re-fire on BW dehydrate→hydrate, WC-first `loadAccountURL` (never WCV host loadURL).
- Preload/offline changes: false online replies produce zero reloads; true reply produces one app-URL replace; bridge cleanup on unload.
- Security changes: URL validation (including `validateNotificationIconURL`), shell wrapper usage, CSP exceptions, media TCC, empty/unknown-only `mediaTypes` deny, requesting-origin trust (no embeddingOrigin allow), notification permission (`notificationAccess` first-run dialog + probe, CI skip, flag only on `show`), and no custom `certificate-error` listeners after security phase init.
- Notification presentation: `nativeNotification`, `notificationFocus`, `accountNotificationIdentity`, `accountLabelStore`, bridge vs unread-delta sources, multi-account subtitle/tag namespacing, unread-delta suppress only when host focused **and** `isAccountVisible`.
- Manual update checks: `src/main/features/appUpdates.test.ts` covers the pure stable-release parser, 10s hung-fetch abort, gate release, and draft/prerelease rejection. Surface: `tests/integration/manual-update.test.ts` launches Electron itself (temp `user-data-dir`) so `electronApp.evaluate` can replace main-process `globalThis.fetch` with a local fixture, import `lib/chunks/appUpdates.js`, invoke the manual path, and inspect the real update-window lifecycle with no public GitHub access. Close the app and remove that temp userData in `finally`.
- Timing tests in `configProfiler.test.ts` and `performanceMonitor.test.ts` must stay on mocked clocks; do not reintroduce `Date.now()` busy-waits or `<N ms` wall-clock assertions.
- Performance contract changes (TDD preferred):
  - Finalizer: no early export; complete+valid only with required markers + renderer samples.
  - Headless aggregation: invalid runs retained as failures; no medians from incomplete sets.
  - Budget gate: missing gated metric → FAIL; warn-only → SKIP/WARN; MB formatted once.
  - Package closure: missing runtime external fails fixture; build-only packages classified.
  - Candidate thresholds: incomplete evidence → `NO CHANGE` with no product diff.
  - Claim validators: overclaim fixtures must reject.
- Packaging / release contract changes (TDD preferred):
  - `package-scaffold.test.js` — arch-pinned mac scripts, signing helper, Windows NSIS names, no `amd64`.
  - `release-workflow.test.js` — mac arm64/x64 matrix, Windows matrix, single publish job, no write tokens on build legs.
  - `verify-macos-package-artifacts.test.js` — require arm64+x64 DMGs; forbid bad labels/duplicates.
  - `verify-release-artifacts.test.js` — aggregate requires both mac DMGs + both Windows setups.
  - mac signing policy / trust verifier tests when changing credential or stapler gates.

## Live harnesses (not Vitest)

```bash
bun run build:prod
GOGCHAT_PERF_RUNS=5 HEADLESS_TIMEOUT_MS=60000 node scripts/headless-startup.js
node scripts/check-perf-budget.js performance-metrics.json
bun scripts/verify-packaged-dependency-closure.js
bun scripts/account-backend-benchmark.js --verify-contract
bun scripts/release-auth-readiness-benchmark.js --record-blocked
# Local dual-arch package smoke (unsigned when credentials absent):
bun run package:mac:x64
bun run package:mac:arm64
bun run package:mac:artifacts
```

CI remains unauthenticated. Authenticated first-interaction is credential-isolated; without credentials expect `[blocked: credentials unavailable]`.

PR Check runs frozen install → Electron binary → literal typecheck / doc-claims / `scripts/lint.sh` / Vitest coverage / madge / production build / Playwright `e2e` `integration` `performance` `preload-artifact` / five-run headless / budget, then always-uploads metrics and coverage logs. Default `bun run test` is still Vitest only. Electron Playwright cases need a production build first and import from `tests/helpers/electron-test.ts`.

## Anti-patterns

- Do not delete failing tests to pass.
- Do not bypass app helpers with raw Playwright fixtures in Electron tests.
- Do not hardcode generated feature-plan output when a spec-level assertion works.
- Do not make e2e tests order-dependent; workers are one today but tests should remain isolated.
- Do not invent measured medians or claim backend winners without valid benchmark cells.
- Do not treat package-byte reductions as startup improvements in assertions or fixtures.
- Do not accept a single macOS DMG as a complete release set after dual-arch packaging landed.
