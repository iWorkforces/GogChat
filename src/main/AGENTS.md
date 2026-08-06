# Main Process Guide

**Parent:** `../AGENTS.md`

`src/main` is the Electron main process: startup orchestration, feature execution, BrowserWindow/WebContentsView account backends, app-level security, IPC handlers, and macOS integration. Arch-specific packaging (arm64/x64 DMGs) is not owned here; see `mac/AGENTS.md` and `scripts/AGENTS.md`. Product version and dual-backend multi-account contracts are summarized in root `AGENTS.md` (v3.19.0).

## Entry and startup

- `index.ts` must stay thin. It wires the top-level sequence only: V8 heap cap (`GOGCHAT_V8_HEAP_CAP_MB`, default 512), `app-start` mark, single-instance lock, deep-link listener, `registerAppReady`, shutdown handler.
- `initializers/registerAppReady.ts` owns `app.whenReady()` work.
- Startup order (do not invent a pre-ready certificate-pinning step — custom pinning was removed):
  1. Pre-ready V8 heap + single-instance + deep links.
  2. Ready: error handler → security phase (`reportExceptions`, `mediaPermissions` fire-and-forget TCC) ∥ global cleanups → critical (`userAgent`) ∥ store init → optional Google preconnect (`GOGCHAT_DISABLE_PRECONNECT=1` kills it) → account-0 bootstrap → arm finalizer / document-load markers → UI phase → `setImmediate` deferred (icon warm + deferred features; `cdpTelemetry` after `appMenu`).
- After account-0 window creation, `registerAppReady` arms `performanceFinalizer` and marks `account-0-content-loaded` on **account-0 WebContents** `did-finish-load` via `getAccountWebContents(0)` (not WCV host-only; document load, not first paint/interaction). Hard `did-fail-load` is logged only; finalizer timeout still invalidates incomplete captures.
- Feature specs live in `initializers/{security,ui,deferred}.spec.ts`; generated plan lives in `generated/featurePlan.ts` and must not be hand-edited.
- Window factory (`windowWrapper.ts`) uses shared `createAccountWebPreferences`: `contextIsolation` / `sandbox` / `nodeIntegration: false` / `webSecurity: true`; account-0 disables background throttling for badge/notification reliability; accounts 1+ enable it.

## Module map

| Area | Path | Local guide |
| --- | --- | --- |
| Feature modules | `features/` | `features/AGENTS.md` |
| Startup/shutdown/specs | `initializers/` | `initializers/AGENTS.md` |
| Account backends | `utils/account/` | `utils/account/AGENTS.md` |
| Lifecycle/resource cleanup | `utils/lifecycle/` | `utils/lifecycle/AGENTS.md` |
| IPC helpers | `utils/ipc/` | `utils/ipc/AGENTS.md` |
| Security utilities | `utils/security/` | `utils/security/AGENTS.md` |
| Platform/menu/badges | `utils/platform/` | `utils/platform/AGENTS.md` |
| Config cache/schema access | `utils/config/` | `utils/config/AGENTS.md` |

## Main-process rules

- BrowserWindow/webPreferences defaults must remain `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Do not import from `src/preload`; communicate through typed shared contracts and IPC.
- Do not call `shell.openExternal()` directly. Use `validateExternalURL()` and `utils/security/shellWrapper.ts`.
- Never log credentials, OAuth tokens, cookies, or full Google auth URLs; strip or validate first.
- Do not add raw timers/listeners in main. Use tracked helpers from `utils/lifecycle/resourceCleanup.ts`.
- macOS notification permission lives in `utils/security/notificationAccess.ts`; `windowWrapper` and WCV host call `ensureNotificationPermission({ parentWindow })` on `ready-to-show` (first-run in-app dialog, then silent OS probe). Persist `app.notificationPermissionRequested` when the user chooses Enable / System Settings (and on probe `show`); do not rely on probe `show` alone. Flag means request path completed, not live OS grant. “Not Now” skips for the process session only. Probe `failed` releases the in-flight guard only. Skip interactive probes in CI. Prefer Preferences → Notification Settings… when the user needs System Settings after a prior grant/deny.
- Keep feature-to-feature imports out of `features/`, except the existing `menuActionRegistry.ts` decoupling point.
- Keep typed errors and `{ cause }`; use shared `ErrorCode` when crossing module boundaries.

## Common workflows

### Add or reorder startup behavior

1. Implement the behavior in `features/` or a focused utility module.
2. Add a `FeatureSpec` to exactly one initializer spec.
3. Declare `dependencies` instead of relying on array position.
4. Run `bun run build:dev` or `bun run build:prod` to regenerate `generated/featurePlan.ts`.

### Add IPC

1. Add/extend channel constants in `src/shared/constants.ts`.
2. Add shared payload/response types and validators.
3. Register the main handler through `utils/ipc/` helpers.
4. Expose only a narrow preload bridge method; never expose raw `ipcRenderer`.

### Touch account windows

- Prefer the `IAccountWindowManager` contract from `src/shared/types/window.ts`.
- Update both `accountWindowManager.ts` and `accountViewManager.ts` unless the behavior is backend-specific.
- Preserve `persist:account-N` partitions and Google auth page handling.
- Use `accountNavigation` (`loadAccountURL` / `getAccountURL` / `sendToAccount`) and never navigate the WCV host shell.
- Multi-account feature attach (e.g. externalLinks) goes through `accountWebContentsHooks` — managers must notify create/destroy on live WC paths including BW dehydrate/hydrate.
- BrowserWindow hydration: factory owns the single restored `loadURL`; manager must not double-navigate.
- Observability: implement/use `enumerateAccountWebContents()`; do not sample host-only under WebContentsView.
- Sparse iteration: `listAccountIndices()` / `hasAccount()` (includes dehydrated-parked) / `isAccountVisible()` — not dense `0..count-1`.
- BrowserWindow remains the default backend; WebContentsView stays opt-in (`app.useWebContentsView`) until measured policy evidence exists.
- Keep account-0 unthrottled for badge/notification reliability when changing focus/blur or factory `backgroundThrottling` defaults. WCV frontmost is unthrottled via `switchToAccount`.

### Touch performance export

- Final metrics export is owned by `utils/lifecycle/performanceFinalizer.ts`, not deferred-phase side effects.
- Memory unit is MB; schema/version lives in `performanceTypes.ts` and must match scripts.
- Do not call document load or account-0-ready first paint or first interaction.

## Tests to consider

- Main utility/feature changes: colocated `*.test.ts` or `tests/unit/features`.
- Account/window behavior: integration or e2e tests with helpers from `tests/helpers/electron-test.ts`.
- Startup/performance-sensitive changes: `bun run build:prod`, `node scripts/headless-startup.js`, `node scripts/check-perf-budget.js`, and related script unit tests under `scripts/*.test.js`.
