# Platform Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns platform integration: tray, dock/taskbar badges, native notifications presentation, account notification identity/labels, app menu helpers, help menu actions, icon cache, and window defaults.

## Conventions

- Public product remains macOS with dual packaging arches (`arm64` and `x64` separate DMGs). Guarded Windows release-engineering/runtime preparation may live here when capability-gated and explicitly not documented as public support.
- Tray/badge coupling is one-way through `trayIconState.setTrayUnread()`.
- Badge image composition belongs in `badgeHelpers.ts` using `nativeImage` primitives. Dock badge sum is capped at `BADGE.DISPLAY_MAX` (99).
- `nativeNotification.ts` owns Electron `Notification` show, tag de-dupe, auto-dismiss, subtitle/groupId options, and bridge vs unread-delta source marking.
- `notificationFocus.ts` resolves click focus via IPC sender → `IAccountWindowManager.focusAccount` (BW + WCV).
- `accountNotificationIdentity.ts` builds account-aware title/body/tag/subtitle/groupId; identity always comes from the IPC sender (or badge account index), never from payload free text alone.
- `accountLabelStore.ts` / `accountLabelDialog.ts` persist optional custom labels (`app.accountLabels`) for notification subtitles (Preferences → Account Labels). Store helpers are config readers/writers, not process singletons with destroyers.
- `helpMenuBuilder.ts` consumes feature actions through `features/menuActionRegistry.ts`; it should not import feature modules directly.
- Window defaults live in `windowUtils.ts` (`getWindowDefaults`) used by account managers and `windowWrapper`.
- Icon assets are shared across mac packaging arches; see `resources/AGENTS.md`.

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
- No macOS notification **permission** probe/dialog logic here — that lives in `utils/security/notificationAccess.ts`.
