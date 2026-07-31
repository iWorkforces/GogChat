# Account Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns multi-account window/view backends and per-account session partition behavior. Account partitions and hydration rules are arch-independent (same on arm64 and x64 packages).

## Backends

- `accountWindowManager.ts` is the default BrowserWindow-per-account backend. `getAccountWindowManager(factory)` routes to `getAccountViewManager` when `app.useWebContentsView === true`.
- `accountViewManager.ts` is the opt-in WebContentsView host backend.
- Both implement `IAccountWindowManager` from `src/shared/types/window.ts`.
- `focusAccount(accountIndex)` brings that account’s UI forward (BW: show/focus window; WCV: switch visible view + focus host). Used by notification click routing.
- WCV host `ready-to-show` must call `ensureNotificationPermission({ parentWindow })` (same first-run dialog + probe as `windowWrapper`).
- Shared routing/registry/bootstrap helpers live in `accountRouter.ts`, `accountWindowRegistry.ts`, `bootstrapTracker.ts`, `bootstrapWatcher.ts`, `accountSessionMaintenance.ts`, `cacheWarmer.ts`, `deepLinkUtils.ts`, **`accountNavigation.ts`** (WebContents-first load/getURL/send), **`accountWebPreferences.ts`** (`createAccountWebPreferences` shared by `windowWrapper` and WCV views — do not duplicate security prefs), and **`accountWebContentsHooks.ts`** (KD13: managers notify create/destroy; features such as `externalLinks` subscribe and install per-account WC guards — never attach only to account-0 host).
- `listAccountIndices()` is sparse-safe (sorted, includes live + dehydrated-parked). `hasAccount()` is true for live **and** dehydrated-parked. `isAccountVisible()` is frontmost UI only. Do not loop `0..getAccountCount()-1` for live accounts (`closeToTray`, shutdown diagnostics use `listAccountIndices`).
- BrowserWindow `dehydrateAccount` / `hydrateAccount` must notify hooks (destroy then create) so multi-account feature guards reinstall after restore. WCV `switchToAccount` / `focusAccount` unthrottle the frontmost view; parking the frontmost promotes a fallback (prefer account-0).
- `destroyAccountWindowManager()` runs `destroyAll` once, then `resetAccountViewManagerSingleton()` so WCV is not double-destroyed and the next `getAccountViewManager()` is fresh.
- Background throttling: account-0 stays unthrottled for badge/notification reliability; accounts 1+ enable Chromium background throttling (window factory + focus/blur toggles). Preserve that split when changing activity listeners.
- Do **not** change the default backend or WebContentsView hide/throttle/destroy semantics without controlled multi-account evidence and an explicit policy decision.

## Session contract

- Use branded helpers: `asAccountIndex()`, `toPartition()`, and `asWebContentsId()`.
- Account partitions are `persist:account-N`; do not switch to in-memory partitions.
- Never interrupt Google auth pages with `loadURL`; check `isGoogleAuthUrl()` first.
- Preserve account 0 and bootstrap accounts during dehydration.

## Hydration / navigation ownership

- Live `windowWrapper` factory calls `loadURL(url)` on create. That factory is the **sole** restored-navigation owner for BrowserWindow hydration.
- `hydrateAccount` must pass the snapshot URL into the factory and restore bounds/maximized state only — it must **not** call a second `loadURL`.
- Snapshot data is factory input and presentation state, not a second navigation path.
- Do not add fallback navigation paths or change WebContentsView hydration in the same change as BrowserWindow double-nav fixes unless the plan requires it.

## Renderer enumeration

- `enumerateAccountWebContents()` is required on both backends for performance sampling and diagnostics.
- BrowserWindow: each live account window's `webContents` (skip destroyed/dehydrated).
- WebContentsView: every live **child view** `webContents`, never host-only sampling that would hide per-account renderers.
- Entries include `accountIndex`, `webContentsId`, `osProcessId`, `backend`, and the live `webContents` reference.

## Dehydration differences

- BrowserWindow dehydration may destroy a window, but must preserve the partition/session.
- WebContentsView uses a **three-state** model: `visible` | `hidden-live` | `dehydrated-parked`.
  - Switch-away → `hidden-live` (`isDehydrated === false`).
  - `dehydrateAccount` → `dehydrated-parked` (hide + throttle; session preserved).
  - `visible` ⇒ unthrottled; park sets throttle true; `focusAccount` / `hydrateAccount` clear throttle via switch.
  - `isDehydrated` is **only** true for `dehydrated-parked`, never for mere switch-away.
  - Account 0 and bootstrap accounts are never parked on WCV.
  - Parking a frontmost non-0 account promotes a visible fallback (prefer account-0).
- Memory-pressure dehydration **never** targets account-0 (BW pressure path aligned with AGENTS).
- Keep backend-specific behavior behind the shared manager contract whenever possible.
- Router hydration hooks must hydrate only when `isDehydrated===true`, not when merely non-visible.

## Deferred phase / metrics hook

- `registerAppReady` schedules `warmInitialIcons` + `warmSoonDeferredIcons` + `runDeferredPhase` on `setImmediate` after the UI phase (icons are off the critical path; account-0 window icon loads on demand in `windowWrapper`).
- `cacheWarmer.runDeferredPhase` runs deferred features, logs the perf summary, optional dev config profiling (`runDevPostDeferred`), then `notifyDeferredPhaseComplete()`.
- Metrics JSON export is **not** owned here; see `performanceFinalizer.ts`.

## Change checklist

- If behavior is user-visible, update both backends or document why one is intentionally different.
- Keep bootstrap promotion compatible with `src/main/initializers/registerAppReady.ts` and lifecycle context storage.
- Add/update tests around auth pages, partition persistence, active account switching, dehydration, single hydration navigation, and `enumerateAccountWebContents`.
- Do not add Google Chat URL assumptions here; use validators from `src/shared/urlValidators.ts`.
