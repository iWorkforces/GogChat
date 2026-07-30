# Platform Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns platform integration: tray, dock/taskbar badges, app menu, help menu actions, icon cache, and window defaults.

## Conventions

- Public support remains macOS on Apple Silicon. Guarded Windows release-engineering/runtime preparation may live here when capability-gated and explicitly not documented as public support.
- Tray/badge coupling is one-way through `trayIconState.setTrayUnread()`.
- Badge image composition belongs in `badgeHelpers.ts` using `nativeImage` primitives.
- `helpMenuBuilder.ts` consumes feature actions through `features/menuActionRegistry.ts`; it should not import feature modules directly.
- `windowDefaults.ts` centralizes BrowserWindow defaults used by account managers.

## Icon cache

`iconCache.ts` intentionally warms assets in tiers:

1. INITIAL: immediate startup-critical icons (critical path via `cacheWarmer.warmInitialIcons`).
2. SOON_DEFERRED: short-delay warmup after critical path (`warmSoonDeferredIcons` on `setImmediate`).
3. IDLE / ADDITIONAL: later idle warmup (`cacheWarmer` ADDITIONAL set; disjoint from INITIAL and SOON_DEFERRED).

Do not move all icon work into startup; it affects app-ready latency. Keep the triple-set partition disjoint (no overlap between INITIAL, SOON_DEFERRED, and ADDITIONAL).

## Anti-patterns

- No direct feature imports from menu/platform utilities except the menu action registry.
- No platform checks that imply public Windows/Linux support; Windows branches must be capability-gated preparation with tests and guarded docs.
- No badge or tray state writes from unrelated modules; route through platform helpers.
