# Lifecycle Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns runtime lifecycle mechanics: feature execution, shared feature context, cleanup tracking, errors, performance monitors, and global cleanup registration.

## Core files

- `featureRunner.ts` runs generated phase batches.
- `featureConfigTypes.ts` defines feature init/cleanup contracts.
- `featureContextStore.ts` stores account manager/window context after bootstrap.
- `resourceCleanup.ts` owns tracked timers/listeners/cleanup tasks.
- `src/main/initializers/registerGlobalCleanups.ts` lazily imports cleanup owners with `Promise.all` to avoid startup cycles.
- `performanceTypes.ts` - shared schema version, MB/ms units, required startup markers, snapshot types.
- `performanceMonitor.ts` - markers, main-heap snapshots, renderer/GPU/utility sampling, IPC/memory latency rings.
- `performanceExport.ts` - versioned JSON export with capture completeness metadata.
- `performanceFinalizer.ts` - one-shot final export after deferred + document load + renderer sample.
- `errors.ts` maps lifecycle failures to typed app errors.
- `cleanupTypes.ts` exists to break import cycles; keep it lightweight.

## Performance contract

### Units and schema

- Memory is always **MB**; time is always **ms**. Embed `units` on every export.
- `PERF_EXPORT_SCHEMA_VERSION` must stay in lockstep with `scripts/headless-startup.js` and `scripts/check-perf-budget.js`. Packaging arch (arm64 vs x64) does not change the schema.
- Required unauthenticated markers include `app-start`, `app-ready`, `account-0-ready`, `account-0-content-loaded`, `features-loaded`, `all-features-loaded`.
- `account-0-ready` is native window readiness only. `account-0-content-loaded` is document load (`did-finish-load`). Neither is first paint nor first interaction.

### Final export ownership

- Development/CI export is owned by `performanceFinalizer.ts`, armed from `registerAppReady.ts`.
- Export runs exactly once when deferred phase has signaled complete **and** account-0 document load has completed (or failed/timed out), after an immediate `sampleAllRenderers`.
- `cacheWarmer.runDevPostDeferred()` may profile config; it must **not** write metrics JSON.
- Load failure or capture timeout produces `capture.complete=false` / `valid=false`, not a silent incomplete median.
- Use `getPerformanceMonitor()` inside the finalizer (not a stale module-level singleton after destroy).

### Renderer sampling

- Prefer `IAccountWindowManager.enumerateAccountWebContents()` for account ↔ PID mapping so WebContentsView child views are observed (not host-only).
- Include process identity helpers (`pid`, `creationTime`, optional `webContentsId` / `backend`) to reduce PID reuse ambiguity.
- On platforms without private memory, set `private: null` and `privateSource: 'unavailable'`. Never present unavailable private memory as measured zero.

### Buffers

- Latency/renderer rings stay FIFO-capped. Do not grow unbounded arrays.

## Cleanup contract

- Use tracked helpers for main-process timers/listeners: `createTrackedInterval`, `createTrackedTimeout`, `addTrackedListener`, `registerCleanupTask`, `registerGlobalCleanupCallback`.
- Cleanup must be idempotent and tolerate partially initialized modules.
- Shutdown order is owned by `src/main/initializers/registerShutdown.ts`.

## Feature runner rules

- Consume `src/main/generated/featurePlan.ts`; do not infer ordering at runtime.
- Preserve phase boundaries and dependency-batch semantics.
- Propagate useful typed errors with `{ cause }` rather than swallowing failures.

## Anti-patterns

- No bare timers in main-process lifecycle code.
- No direct account/window creation here.
- No edits to generated feature plans.
- No unbounded performance arrays or always-on metrics exports in packaged production.
- No early metrics export before document-load + renderer sample.
- No claiming paint/interaction readiness from account-ready or did-finish-load alone.
