# Main Initializers Guide

**Parent:** `../AGENTS.md`

This directory is the canonical home for app startup/shutdown sequencing and build-time feature specs. Packaging arches do not change initializer contracts.

## Files

- `registerAppReady.ts` - owns `app.whenReady()` sequencing (phases, store, account-0, finalizer arming, deferred schedule).
- `registerShutdown.ts` - async shutdown path before `app.exit()`.
- `registerGlobalCleanups.ts` - lazy `require()` of cleanup owners (avoid startup import cycles).
- `singletonDestroyers.ts` / `shutdownDiagnostics.ts` - ordered teardown helpers used by shutdown.
- `security.spec.ts`, `ui.spec.ts`, `deferred.spec.ts` - declarative startup plan input (`FeatureSpec` from `utils/lifecycle/featureConfigTypes.ts`).

## Feature plan contract

- Specs use `as const satisfies readonly FeatureSpec[]`.
- Edit specs, not `src/main/generated/featurePlan.ts`.
- Build-time parsing happens in `scripts/featurePlanPlugin.js`.
- Runtime execution happens in `src/main/utils/lifecycle/featureRunner.ts`.
- Shared feature runtime state is in `src/main/utils/lifecycle/featureContextStore.ts`.
- Use `dependencies` for ordering. Avoid relying on lexical or array position.

## Startup phases

1. Security before network.
2. Critical before account bootstrap completes.
3. UI after account manager/window state exists.
4. Deferred after first-window work.

Keep the phase boundary meaningful. If a feature can wait, keep it deferred.

## Performance finalizer arming

In `registerAppReady.ts`, after account-0 window construction:

1. Call `armPerformanceFinalizer({ getAccountManager })`.
2. Mark `account-0-ready` for native window readiness only.
3. On main-frame `did-finish-load`, mark `account-0-content-loaded` and `notifyDocumentLoadComplete()`.
4. On main-frame hard `did-fail-load` (not ERR_ABORTED): **log only**. Intermediate Google auth redirects often surface as fail-load events; do not treat them as terminal. Incomplete captures still fail via finalizer timeout / missing required markers. `notifyDocumentLoadFailed` exists on the finalizer for tests or explicit callers but is not wired from production `registerAppReady` today.

Before account-0 creation, optional session preconnect warms Google Chat/auth/CDN hosts unless `GOGCHAT_DISABLE_PRECONNECT=1`.

Deferred phase (via `cacheWarmer.runDeferredPhase`) calls `notifyDeferredPhaseComplete()` after features load. Final metrics export is not owned by deferred-only paths. Icon warming (`warmInitialIcons` / `warmSoonDeferredIcons`) runs on the same `setImmediate` path as deferred — not on the critical path before first window.

## Shutdown

Shutdown order is intentional:

1. `cleanupAll(ctx)` in reverse initialization order.
2. Destroy account window manager.
3. Run shutdown diagnostics.
4. Destroy singleton utilities.
5. `app.exit()`.

Never introduce a second shutdown owner or call `app.quit()` from cleanup code.

## Anti-patterns

- No runtime feature registration manager.
- No hand-edits to generated feature plans.
- No direct BrowserWindow/account logic inside specs.
- No bare timers in initializer code; use lifecycle tracked resources.
