# Platform Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns platform integration: tray, dock/taskbar badges, native notifications presentation, account notification identity/labels, app menu helpers, help menu actions, icon cache, and window defaults.

## Conventions

- Public product remains macOS with dual packaging arches (`arm64` and `x64` separate DMGs). Guarded Windows release-engineering/runtime preparation may live here when capability-gated and explicitly not documented as public support.
- Tray/badge coupling is one-way through `trayIconState.setTrayUnread()`.
- Badge image composition belongs in `badgeHelpers.ts` using `nativeImage` primitives. Dock badge sum is capped at `BADGE.DISPLAY_MAX` (99).
- `nativeNotification.ts` owns Electron `Notification` show, tag de-dupe, auto-dismiss, subtitle/groupId options, and bridge vs unread-delta source marking.
- `notificationFocus.ts` resolves click focus via IPC sender → `IAccountWindowManager.focusAccount` (BW + WCV).
- Unread-delta OS banners in `badgeHelpers` suppress only when the host/window is focused **and** `manager.isAccountVisible(accountIndex)` (WCV: hidden-live secondary must still notify while another account is frontmost).
- `accountNotificationIdentity.ts` builds account-aware title/body/tag/subtitle/groupId; identity always comes from the IPC sender (or badge account index), never from payload free text alone.
- `accountLabelStore.ts` / `accountLabelDialog.ts` persist optional custom labels (`app.accountLabels`) for notification subtitles (Preferences → Account Labels). Store helpers are config readers/writers, not process singletons with destroyers.
- `helpMenuBuilder.ts` consumes feature actions through `features/menuActionRegistry.ts`; it should not import feature modules directly.
- Window defaults live in `windowUtils.ts` (`getWindowDefaults`) used by account managers and `windowWrapper`.
- Icon assets are shared across mac packaging arches; see `resources/AGENTS.md`.

## Icon cache

`iconCache.ts` intentionally warms assets in tiers. Account-0 window icon (`resources/icons/normal/256.png`) loads on demand in `windowWrapper`; bulk warm runs after the UI phase on `setImmediate` (same path as deferred features):

1. INITIAL: first warm set via `cacheWarmer.warmInitialIcons` (not on the pre-window critical path).
2. SOON_DEFERRED: short-delay follow-up (`warmSoonDeferredIcons` on `setImmediate` inside the warmer).
3. IDLE / ADDITIONAL: later idle warmup (`cacheWarmer` ADDITIONAL set; disjoint from INITIAL and SOON_DEFERRED).

Do not move icon warming back onto the pre-window critical path; it affects app-ready latency. Keep the triple-set partition disjoint (no overlap between INITIAL, SOON_DEFERRED, and ADDITIONAL).

## Anti-patterns

- No direct feature imports from menu/platform utilities except the menu action registry.
- No platform checks that imply public Windows/Linux support; Windows branches must be capability-gated preparation with tests and guarded docs.
- No badge or tray state writes from unrelated modules; route through platform helpers.
- No macOS notification **permission** probe/dialog logic here — that lives in `utils/security/notificationAccess.ts`.
