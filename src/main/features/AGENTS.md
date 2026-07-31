# Main Features Guide

**Parent:** `../AGENTS.md`

Features are self-contained startup/runtime units registered through initializer specs. This directory holds the feature implementations; startup order lives outside this directory.

## Contract

- Export focused `init`/setup functions consumed by specs in `src/main/initializers/`.
- Keep feature modules independent. Feature-to-feature imports are forbidden except `menuActionRegistry.ts`.
- Do not reintroduce runtime feature registration.
- Do not hand-edit `src/main/generated/featurePlan.ts`.
- Keep feature names aligned with spec IDs and generated plan output.

## Registration workflow

1. Add or update the feature implementation here.
2. Register it in one of:
   - `src/main/initializers/security.spec.ts`
   - `src/main/initializers/ui.spec.ts`
   - `src/main/initializers/deferred.spec.ts`
3. Declare dependencies explicitly with `dependencies`.
4. Run a build to regenerate `src/main/generated/featurePlan.ts`.

Known dependencies (from current specs) include `badgeIcons -> trayIcon`, `windowState -> singleInstance/deepLinkHandler/bootstrapPromotion`, `appMenu -> openAtLogin/externalLinks`, `externalLinks -> bootstrapPromotion`, and `closeToTray -> trayIcon`.

Security phase features (no deps): `reportExceptions`, `mediaPermissions`. Critical: `userAgent`. UI: `singleInstance` (restore handler), `deepLinkHandler`. Deferred also includes `trayIcon`, `bootstrapPromotion`, `openAtLogin`, `appUpdates`, `firstLaunch`, `enforceMacOSAppLocation`, `passkeySupport`, `handleNotification`, `contextMenu`, `inOnline`, `cdpTelemetry` (optional).

`aboutPanel` is **not** a phased `FeatureSpec`; it self-registers a menu action and is invoked from the app menu.

## Menu actions

- `menuActionRegistry.ts` is the allowed decoupling point between features and menus.
- Features such as `aboutPanel`, `openAtLogin`, `externalLinks`, and `deepLinkHandler` self-register menu actions at module load time.
- Consumers retrieve actions with `getMenuAction()` rather than importing feature modules directly.

## Notifications

- `handleNotification.ts` shows Electron (OS) notifications for validated `NOTIFICATION_SHOW` IPC payloads via `nativeNotification.showNativeNotification` (source `bridge`).
- Click focus uses `notificationFocus.focusNotificationSource` → `IAccountWindowManager.focusAccount` when the IPC sender maps to an account (BW + WCV); otherwise `BrowserWindow.fromWebContents` / feature main window.
- Unread-delta opt-in banners live in `badgeHelpers` (source `unread-delta`) and are suppressed for `TIMING.NOTIFICATION_BRIDGE_COOLDOWN_MS` after a bridge show.
- Permission request UX lives in `utils/security/notificationAccess.ts`. Call sites: `windowWrapper` and WCV host on **`ready-to-show`** with `{ parentWindow }` (first-run Enable / System Settings / Not Now dialog, then silent OS probe).
- Preferences menu (`appMenu.ts`): **Notification Settings…**, **Notify on Unread Badge Increase**, and **Account Labels** (custom notification subtitles).

## Feature boundaries

- Security features must be ready before network use.
- UI features may assume account bootstrap/context store exists.
- Deferred features must tolerate late execution and app shutdown races.
- Use utility modules for shared mechanics; do not create hidden feature coupling.
- Do not write startup performance JSON from feature code. Metrics finalization lives in `utils/lifecycle/performanceFinalizer.ts`.
- Speculative optimizations (unread, CDP sampling, timers, split chunks, preconnect) stay measure-first: see `scripts/performance-candidate-benchmark.js` and `docs/plans/performance-remediation.md`.

## Gotchas

- Badge IPC/dock logic lives in `src/main/utils/platform/badgeHelpers.ts` (`setupBadgeHandlers`); `badgeIcon.ts` is only the thin feature lifecycle wrapper.
- Feature config/types live under `src/main/utils/lifecycle/` (`featureConfigTypes.ts`, not an `initializerTypes` module).
- Custom certificate pinning feature modules are gone; do not re-add a security-phase cert pin feature without an explicit security plan. Chromium remains the trust authority.
- Google Chat webview/CSP history is documented in `docs/windowWrapper-history.md`; current `windowWrapper` uses `webSecurity: true` — do not change CSP/webSecurity behavior casually.
