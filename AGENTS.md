# GogChat Agent Guide

**Generated:** 2026-08-01
**Commit:** 077b3ee
**Branch:** deep-perf-enhancements
**Version:** 3.18.2
**Repository:** https://github.com/iWorkforces/GogChat

## Project shape

GogChat is a macOS-first Electron desktop wrapper for Google Chat (`https://mail.google.com/chat/u/0`). It is TypeScript-first, packages dual macOS arches (Apple Silicon `arm64` and Intel `x64`) as **separate** DMGs, and is built with a dual Rsbuild pipeline: ESM main process plus CJS preload because Electron sandboxed preloads cannot load ESM. Fixed bundle id / notarize identity: `com.ocworkforces.gogchat` (`src/shared/appIdentity.ts`, `scripts/app-identity.cjs`, `electron-builder.yml`).

This is **not** a typical Electron app:

- Feature startup is build-time generated from `src/main/initializers/*.spec.ts` into `src/main/generated/featurePlan.ts`.
- Runtime feature execution is handled by `src/main/utils/lifecycle/featureRunner.ts`.
- Multi-account state uses per-account `persist:account-N` session partitions.
- The default backend is one BrowserWindow per account; `app.useWebContentsView` switches to a WebContentsView host backend (opt-in; no default flip without measured evidence).
- Security, IPC, preload, and URL validation are layered and intentionally strict.
- Custom certificate pinning was **removed**; Chromium is the sole TLS trust authority (security phase must not install `certificate-error` listeners).
- Unauthenticated CI startup metrics use a versioned export contract; document load and account readiness are **not** first paint or first interaction.

## Commands

Use `bun` only.

```bash
bun install
bun run build:dev
bun run build:prod
bun run typecheck
bun run test
bun run test:run
bun run test:coverage
bun run lint:all
bun run lint:all:fix
bun run check:doc-claims
bun run start
bun run build:mac
bun run build:mac:x64
bun run package:mac:arm64
bun run package:mac:x64
bun run package:mac:release
bun run package:mac:artifacts
bun run package:win:x64
bun run package:win:arm64
bun run package:win:artifacts
bun run package:win:signing-policy
```

Runtime/toolchain constraints:

- Node `>=24.16.0 <25.0.0`; Bun `>=1.3.0`; package manager pin `bun@1.3.14`.
- Electron `^43.2.0`.
- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUncheckedSideEffectImports`, `noUnusedLocals`, and `noUnusedParameters`.
- Prettier: 100 columns, single quotes, semicolons, trailing commas ES5, LF.

## Packaging guidance

Production releases package **two** macOS DMGs (`arm64` and `x64`) plus guarded Windows NSIS installers. Public product is macOS-first. Do not claim Windows is supported, released, ready, or available until clean packaged smoke evidence exists on Windows x64 and real Windows arm64. Prefer real Intel hardware smoke before marketing full Intel runtime support.

### macOS

- `bun run package:mac:arm64` and `bun run package:mac:x64` are the arch-pinned release package commands (shared helper `scripts/package-mac-arch.sh`). `package:mac:release` is an arm64 alias for local/backward-compatible use.
- macOS DMG names: `${productName}-${version}-arm64.dmg` and `${productName}-${version}-x64.dmg`. Use `x64`, not `amd64`. Do not ship a universal binary unless a separate plan approves it.
- **Do not** list both arches under `mac.target.arch` in `electron-builder.yml`. When both are listed, electron-builder builds every listed arch even if the CLI only passes `--arm64` or `--x64`. Pin arch only via CLI flags.
- Preserve `build-macOS-dmg.sh` as a macOS-specific DMG path; it accepts `--arch arm64|x64` (default `arm64`).
- Release CI builds macOS on `macos-latest` with an arm64/x64 matrix (x64 is cross-packaged via electron-builder). Per-leg verify: `verify-macos-package-artifacts` and, when signed, `verify-mac-release-signing`.
- Signing preflight: `scripts/mac-release-signing.js` (complete `MAC_CSC_*` pair or both absent; notarization required when signing).

### Windows (guarded preparation)

- `bun run package:win:x64` and `bun run package:win:arm64` are guarded Windows package commands for native Windows CI packaging.
- Windows setup artifacts must stay as separate NSIS installers: `${productName}-${version}-windows-x64-setup.exe` and `${productName}-${version}-windows-arm64-setup.exe`.
- Release CI packages Windows x64 on `windows-latest` with AMD64 proof and arm64 on `windows-11-arm` with ARM64 proof.
- Windows release publication requires Authenticode via `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` or explicit owner opt-in through `bun run package:win:signing-policy`.
- The Windows electron-builder overlay registers only `gogchat`; the base macOS config may still include HTTPS protocol handling.

### Aggregate publish gate

- `scripts/verify-release-artifacts.js` requires **both** macOS DMG arches **and** both Windows installers before the single publish job.

## Where to look

| Task                           | Start here                                                                      | Notes                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| App entry                      | `src/main/index.ts`                                                             | Thin orchestrator only. Do not add feature logic here.                        |
| App-ready sequence             | `src/main/initializers/registerAppReady.ts`                                     | Owns `app.whenReady()` work.                                                  |
| Feature specs                  | `src/main/initializers/{security,ui,deferred}.spec.ts`                          | Declarative `FeatureSpec[]`; edit these to add/reorder features.              |
| Feature codegen                | `scripts/featurePlanPlugin.js`                                                  | Parses specs and topo-sorts dependency batches at build time.                 |
| Runtime feature runner         | `src/main/utils/lifecycle/featureRunner.ts`                                     | Runs security/critical/ui/deferred phases.                                    |
| Shared feature context         | `src/main/utils/lifecycle/featureContextStore.ts`                               | Stores `mainWindow` and account manager after bootstrap.                      |
| Shutdown                       | `src/main/initializers/registerShutdown.ts`                                     | Async cleanup before `app.exit()`.                                            |
| BrowserWindow accounts         | `src/main/utils/account/accountWindowManager.ts`                                | Default multi-account backend.                                                |
| WebContentsView accounts       | `src/main/utils/account/accountViewManager.ts`                                  | Opt-in backend behind `app.useWebContentsView`.                               |
| Account contract               | `src/shared/types/window.ts`                                                    | `IAccountWindowManager` boundary.                                             |
| WC-first navigation            | `src/main/utils/account/accountNavigation.ts`                                   | `loadAccountURL` / `getAccountURL` / `sendToAccount` (never WCV host loadURL). |
| Shared account webPreferences  | `src/main/utils/account/accountWebPreferences.ts`                               | `createAccountWebPreferences` for `windowWrapper` + WCV views.                |
| Multi-account WC hooks         | `src/main/utils/account/accountWebContentsHooks.ts`                             | Create/destroy notify; `externalLinks` installs per-account guards.           |
| App / notarize identity        | `src/shared/appIdentity.ts` + `scripts/app-identity.cjs`                        | Fixed `com.ocworkforces.gogchat`; keep lockstep with electron-builder.        |
| IPC helpers                    | `src/main/utils/ipc/`                                                           | Rate limit, validate, dedup/fast-path, catch.                                 |
| IPC channel names              | `src/shared/constants.ts`                                                       | Never hardcode channel strings.                                               |
| Preload bridge                 | `src/preload/index.ts` + `src/shared/types/bridge.ts`                           | Sandboxed CJS preload. No raw `ipcRenderer` exposure.                         |
| Web notification bridge        | `src/preload/notificationBridge.ts` + `src/main/features/handleNotification.ts` | Page `Notification` calls become validated native OS notifications.           |
| Native notification show       | `src/main/utils/platform/nativeNotification.ts`                                 | Tag de-dupe, auto-dismiss, subtitle/groupId, bridge vs unread-delta sources.  |
| Notification click focus       | `src/main/utils/platform/notificationFocus.ts`                                  | Route click → `IAccountWindowManager.focusAccount` (BW + WCV).                |
| Notification permission        | `src/main/utils/security/notificationAccess.ts`                                 | First-run dialog + silent OS probe on `ready-to-show`; Settings helpers.      |
| Account notification identity  | `src/main/utils/platform/accountNotificationIdentity.ts` + `accountLabelStore`  | Subtitle/groupId/tag namespace; Preferences → Account Labels.                  |
| URL validation                 | `src/shared/urlValidators.ts`                                                   | Navigation, external links, deep links, auth detection, notification icons.   |
| Config                         | `src/shared/types/config.ts` + `src/main/utils/config/configSchema.ts` + `src/main/config.ts` | Update shared types, schema/defaults, and accessors together.          |
| Secure flags                   | `src/main/utils/security/secureFlags.ts`                                        | SafeStorage-backed kill switches; not electron-store config.                  |
| Error types                    | `src/shared/types/errors.ts` + `src/main/utils/lifecycle/errors.ts`             | Prefer typed errors and `{ cause }`.                                          |
| Historical webview constraints | `docs/windowWrapper-history.md`                                                 | Historical notes; current factory uses `webSecurity: true` + targeted CSP fixes. |
| Perf types / units / schema    | `src/main/utils/lifecycle/performanceTypes.ts`                                  | Schema version, MB memory, required markers.                                  |
| Perf final export              | `src/main/utils/lifecycle/performanceFinalizer.ts`                              | One-shot after deferred + document load + renderer sample.                    |
| Perf monitor / sampling        | `src/main/utils/lifecycle/performanceMonitor.ts`                                | Markers, memory, account renderer sampling.                                   |
| Headless CI harness            | `scripts/headless-startup.js`                                                   | Multi-run, schema validation, refuses incomplete medians.                     |
| Perf budget gate               | `scripts/check-perf-budget.js`                                                  | Gated missing = FAIL; memory in MB; baseline schema check.                    |
| Package dependency closure     | `scripts/verify-packaged-dependency-closure.js`                                 | Prove runtime vs build-only before package pruning.                           |
| macOS arch package helper      | `scripts/package-mac-arch.sh`                                                   | Single-arch release package + signing preflight.                              |
| macOS DMG arch verify          | `scripts/verify-macos-package-artifacts.js`                                     | Require arm64/x64 DMG basenames; forbid amd64/universal.                      |
| macOS trust verify             | `scripts/verify-mac-release-signing.js`                                         | codesign / spctl / stapler on signed release legs.                            |
| Aggregate release verify       | `scripts/verify-release-artifacts.js`                                           | Both mac DMGs + both Windows setups before publish.                           |
| Account backend benchmark      | `scripts/account-backend-benchmark.js`                                          | BW/WCV matrix contract; no policy winner from harness alone.                  |
| Candidate thresholds           | `scripts/performance-candidate-benchmark.js`                                    | Measure-first; `NO CHANGE` when thresholds unmet.                             |
| Remediation evidence           | `scripts/verify-remediation-evidence.js`                                        | Todo receipts, core vs release-readiness approval.                            |
| Performance claims             | `scripts/verify-performance-claims.js`                                          | Reject unsupported runtime-savings claims.                                    |
| Perf plan                      | `docs/plans/performance-remediation.md`                                         | Phased remediation work plan and guardrails.                                  |
| macOS Intel x64 plan           | `docs/plans/macos-intel-x64-dmg.md`                                             | Dual-arch DMG production plan and acceptance criteria.                        |
| Native notifications plan      | `docs/plans/native-os-notifications.md`                                         | Permission, bridge, multi-account banners, unread-delta fallback.             |
| Deep enhancements plan         | `docs/plans/deep-enhancements.md`                                               | Dual-backend contract, truth/safety, measure handoff, v3.18.2 closeout.       |
| Tests                          | `tests/AGENTS.md`                                                               | Unit/integration/e2e/perf/packaging contract guidance.                        |
| Packaging                      | `mac/AGENTS.md` + `scripts/AGENTS.md`                                           | DMG, signing, notarization, dual-arch, perf gates.                            |
| Icons / resources              | `resources/AGENTS.md`                                                           | Icon variants, generation, extraResources.                                    |

## Architecture invariants

### Startup order

1. **Pre-ready (before any Chromium process):** set V8 heap via `app.commandLine.appendSwitch('js-flags', '--max-old-space-size=…')`. Default **512** MB; override with `GOGCHAT_V8_HEAP_CAP_MB` (clamped 128–4096). Config store cannot be used here (needs SafeStorage / `app.ready`).
2. `perfMonitor.mark('app-start')`.
3. `enforceSingleInstance()` — only the first instance continues startup wiring.
4. `setupDeepLinkListener()` before app ready (macOS may fire `open-url` early).
5. `registerAppReady(...)` owns `app.whenReady()`; `registerShutdownHandler()` registers the async shutdown path.
6. In `registerAppReady.ts` when ready:
   - Centralized error handler.
   - Parallel: global cleanup registration + **security** phase (`reportExceptions`, `mediaPermissions`).
   - Parallel: **critical** phase (`userAgent`) + encrypted config store init.
   - Optional session preconnect for Google Chat/auth/CDN hosts on `persist:account-0` (disabled when `GOGCHAT_DISABLE_PRECONNECT=1`).
   - Create account-0 window, set shared feature context, mark `account-0-ready`.
   - Arm `performanceFinalizer`; on **account-0 WebContents** `did-finish-load` (via `getAccountWebContents(0)`, not WCV host-only) mark `account-0-content-loaded` and `notifyDocumentLoadComplete()`. Hard `did-fail-load` is logged only (non-terminal); capture timeout still invalidates incomplete runs.
   - **UI** phase (`singleInstance` restore + `deepLinkHandler`).
   - `setImmediate`: warm icon tiers + deferred phase (tray/menu/badges/bootstrap/window state/passkeys/notifications/network/external links/close-to-tray/open-at-login/updates/context menu/first launch/app-location/CDP telemetry after `appMenu`). Deferred calls `notifyDeferredPhaseComplete()`; it does **not** own metrics export.

### Feature lifecycle

- Add features under `src/main/features/`.
- Register by editing `src/main/initializers/*.spec.ts` only.
- Do **not** hand-edit `src/main/generated/featurePlan.ts`.
- Do **not** reintroduce runtime feature registration.
- Feature-to-feature imports are forbidden except `menuActionRegistry.ts` as the decoupling point.

### Multi-account

- Always go through `IAccountWindowManager` when possible.
- Use branded helpers: `asAccountIndex()`, `toPartition()`, `asWebContentsId()`.
- Never interrupt Google auth pages with `loadURL`; check `isGoogleAuthUrl()` (prefer `loadAccountURL` / `getAccountURL`).
- BrowserWindow dehydration may destroy windows but must preserve session partitions; **notify WC hooks** on dehydrate/hydrate so multi-account feature guards reinstall.
- WebContentsView parks (hide + throttle); it does not destroy per-account sessions. Three-state: `visible` | `hidden-live` | `dehydrated-parked`; `isDehydrated` only for parked.
- BrowserWindow hydration: the window factory owns the single restored `loadURL`; the manager must not re-dispatch navigation.
- Renderer observability: use `enumerateAccountWebContents()` (both backends). Do not sample host-only WebContents under WebContentsView.
- BrowserWindow remains the default backend; WebContentsView stays opt-in. Do not change backend policy without measured evidence and an explicit decision.
- Prefer `accountNavigation` helpers and `listAccountIndices()` / `isAccountVisible()` / `hasAccount()` (includes dehydrated-parked) over host `webContents` and dense `0..count-1` loops.
- Cross-account Chat opens (`externalLinks`) and deep links must use URL `/u/N/` + WC-first navigation + `focusAccount` — never `hostWindow.loadURL` under WCV.
- WCV: `visible` ⇒ unthrottled (`switchToAccount` / `focusAccount`); parking the frontmost non-0 account promotes a visible fallback (prefer account-0). Memory pressure never dehydrates account-0.
- Background throttling: account-0 keeps `backgroundThrottling: false` for badge/notification reliability; accounts 1+ enable it (and may toggle via `setBackgroundThrottling` on focus/blur).

### Performance metrics

- Memory is always **MB** end-to-end (monitor, export, budget, display). Never mix byte baselines silently.
- Final development/CI export is owned by `performanceFinalizer.ts`: exactly once after deferred complete + `account-0-content-loaded` (or load failure/timeout) + immediate renderer sample.
- Do **not** export metrics early from `runDevPostDeferred()`.
- Do **not** call `account-0-ready`, `did-finish-load`, or `account-0-content-loaded` first paint or first interaction.
- CI is unauthenticated. Authenticated first-interaction evidence belongs to the secured release benchmark (`scripts/release-auth-readiness-benchmark.js`) with isolated credentials.
- Missing gated budget metrics fail CI; warn-only metrics may SKIP/WARN. Incompatible baseline schema/units are rejected; regenerate only with `PERF_UPDATE_BASELINE=1`.
- Do not prune packaged dependencies without `verify-packaged-dependency-closure` proof. Do not claim runtime wins from package bytes alone.

### Security and IPC

- BrowserWindow defaults: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- IPC handlers must rate-limit, validate, handle, and catch. Dedup only where safe.
- Use `IPC_CHANNELS`; never string-literal IPC channel names.
- Google Chat web `Notification` calls are bridged from page world through `src/preload/notificationBridge.ts`; keep raw `ipcRenderer` isolated in preload and validate notification payloads before `NOTIFICATION_SHOW`.
- macOS notification authorization: `windowWrapper` and WCV host call `ensureNotificationPermission({ parentWindow })` on **`ready-to-show`**. When the config flag is false, show a short first-run dialog (Enable / System Settings / Not Now), then a silent probe `Notification`. Persist `app.notificationPermissionRequested` when the user chooses **Enable** or **System Settings** (and also on probe `show`). Do not require probe `show` alone — it often never fires on macOS, which re-prompted every launch. Flag means request path completed, not live grant status. “Not Now” skips for the process session only; probe `failed` clears only the in-flight guard (does not clear a flag already set by Enable). Skip interactive probes in CI. Preferences → Notification Settings… opens System Settings when the user needs to fix grant/deny later.
- Optional unread-delta OS banners (`app.unreadDeltaNotifications`, default false) live in `badgeHelpers` via `nativeNotification.ts`; primary path remains Chat Web Notification bridge. Suppress only when host focused **and** `isAccountVisible(accountIndex)`.
- Multi-account banners always set macOS `subtitle` (`Account N`, 1-based, or `app.accountLabels` custom) and `groupId`; tags are namespaced `a${index}:…` from IPC sender identity only. Dock badge is the sum of per-account unreads capped at `BADGE.DISPLAY_MAX` (99). Labels: Preferences → Account Labels.
- Notification icon URLs must pass `validateNotificationIconURL` (`data:image/*` or allowlisted Google static HTTPS hosts).
- Permission media requests: deny empty or unknown-only `mediaTypes`; require `video` and/or `audio` before TCC. Trust the first present requesting identity (do not rescue untrusted `requestingUrl` via `securityOrigin`); never use `embeddingOrigin` for allow.
- Use `validateExternalURL()` and `shellWrapper.ts`; never call `shell.openExternal()` directly in main.
- TLS trust is Chromium’s; do not reintroduce custom `certificate-error` handlers. SafeStorage-backed secure flags (`secureFlags.ts`) hold kill switches such as `disableCdpTelemetry` (and a residual `disableCertPinning` storage key that no startup path consults after pinning removal).
- Do not wholesale replace Google CSP. Existing COEP/COOP/frame-ancestors stripping is targeted and intentional. Account `webSecurity` is `true` via `createAccountWebPreferences`.

## Type and code conventions

- Use `import type` for type-only imports.
- No barrel/re-export files unless a local legacy exception already exists.
- For casts, use `asType<T>(value)` or branded helpers. Bare `value as T` is only allowed for `as const`, tests, and allowlisted cast utilities.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Never add bare `setTimeout`/`setInterval` in main; use tracked resource helpers.
- Never create feature logic in `src/main/index.ts`.
- Never open external URLs without shared URL validation.

## Working principles

These apply to every change in this repo, whether you implement it yourself or delegate.

### Think before coding

- State assumptions explicitly. If uncertain, ask one precise question instead of guessing.
- If multiple interpretations of the request exist, surface them; do not pick silently.
- If a simpler approach exists than what was described, say so and push back when warranted.
- If something is unclear, stop and name what is confusing. Do not hide confusion behind speculative code.

### Simplicity first

Write the minimum code that solves the stated problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No `flexibility` or `configurability` that was not requested.
- No error handling for scenarios that cannot happen given current contracts.
- If a 200-line solution could be 50 lines, rewrite it. Ask: would a senior engineer call this overcomplicated?

### Surgical changes

Touch only what the request requires. Clean up only the mess your own changes created.

- Do not `improve` adjacent code, comments, or formatting while editing.
- Do not refactor code that is not broken, even if you would write it differently.
- Match the existing style of the file you are editing.
- If you spot unrelated dead code or issues, mention them in the final message as observations; do not delete or fix them.
- Remove imports, variables, and functions that _your_ changes orphaned. Leave pre-existing dead code alone unless asked.
- The test for every changed line: does it trace directly to the user's request?

### Goal-driven execution

Define success criteria up front, then loop until they verify. Strong criteria let you work independently; weak ones ("make it work") force constant clarification.

Transform tasks into verifiable goals:

- `Add validation` -> write tests for invalid inputs, then make them pass.
- `Fix the bug` -> write a test that reproduces it, then make it pass.
- `Refactor X` -> ensure the same tests pass before and after.

For multi-step tasks, state a brief plan with a verification check per step:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

## Current AGENTS hierarchy

Nested guides supplement this root and are intentionally more specific:

- `src/AGENTS.md`
- `src/main/AGENTS.md`
- `src/main/features/AGENTS.md`
- `src/main/initializers/AGENTS.md`
- `src/main/utils/AGENTS.md`
- `src/main/utils/{account,config,ipc,lifecycle,platform,security}/AGENTS.md`
- `src/shared/AGENTS.md`
- `src/shared/types/AGENTS.md`
- `src/preload/AGENTS.md`
- `src/offline/AGENTS.md`
- `scripts/AGENTS.md`
- `tests/AGENTS.md`
- `mac/AGENTS.md`
- `resources/AGENTS.md`

Low-score `docs/` and `.github/workflows/` are covered here plus `scripts/AGENTS.md` and `mac/AGENTS.md`; add local AGENTS files there only if new agent-critical conventions appear. Work plans under `docs/plans/`: performance remediation, macOS Intel x64 DMG, native OS notifications, and **deep enhancements** (`deep-enhancements.md` — mostly implemented @ v3.18.2; Wave 3 matrix/auth/signed smoke still residual).
