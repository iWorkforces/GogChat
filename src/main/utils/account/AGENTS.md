# Account Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns multi-account window/view backends and per-account session partition behavior.

## Backends

- `accountWindowManager.ts` is the default BrowserWindow-per-account backend.
- `accountViewManager.ts` is the opt-in WebContentsView host backend selected by `app.useWebContentsView`.
- Both implement `IAccountWindowManager` from `src/shared/types/window.ts`.
- Shared routing/registry/bootstrap helpers live in `accountRouter.ts`, `accountWindowRegistry.ts`, `bootstrapTracker.ts`, `bootstrapWatcher.ts`, `accountSessionMaintenance.ts`, `cacheWarmer.ts`, and `deepLinkUtils.ts`.
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
- WebContentsView dehydration hides/throttles the view; it does not destroy per-account sessions.
- Keep backend-specific behavior behind the shared manager contract whenever possible.

## Deferred phase / metrics hook

- `cacheWarmer.runDeferredPhase` runs deferred features, logs the perf summary, optional dev config profiling, then `notifyDeferredPhaseComplete()`.
- Metrics JSON export is **not** owned here; see `performanceFinalizer.ts`.

## Change checklist

- If behavior is user-visible, update both backends or document why one is intentionally different.
- Keep bootstrap promotion compatible with `src/main/initializers/registerAppReady.ts` and lifecycle context storage.
- Add/update tests around auth pages, partition persistence, active account switching, dehydration, single hydration navigation, and `enumerateAccountWebContents`.
- Do not add Google Chat URL assumptions here; use validators from `src/shared/urlValidators.ts`.
