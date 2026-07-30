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

Known dependencies include `badgeIcons -> trayIcon`, `windowState -> singleInstance/deepLinkHandler/bootstrapPromotion`, `appMenu -> openAtLogin/externalLinks`, `externalLinks -> bootstrapPromotion`, and `closeToTray -> trayIcon`.

## Menu actions

- `menuActionRegistry.ts` is the allowed decoupling point between features and menus.
- Features such as `aboutPanel`, `openAtLogin`, `externalLinks`, and `deepLinkHandler` self-register menu actions at module load time.
- Consumers retrieve actions with `getMenuAction()` rather than importing feature modules directly.

## Feature boundaries

- Security features must be ready before network use.
- UI features may assume account bootstrap/context store exists.
- Deferred features must tolerate late execution and app shutdown races.
- Use utility modules for shared mechanics; do not create hidden feature coupling.
- Do not write startup performance JSON from feature code. Metrics finalization lives in `utils/lifecycle/performanceFinalizer.ts`.
- Speculative optimizations (unread, CDP sampling, timers, split chunks, preconnect) stay measure-first: see `scripts/performance-candidate-benchmark.js` and `docs/plans/performance-remediation.md`.

## Gotchas

- `badgeHandlers.ts` lives in `src/main/utils/platform/`, not here.
- Feature config/types live under `src/main/utils/lifecycle/`.
- Google Chat webview constraints are documented in `docs/windowWrapper-history.md`; do not change CSP/webSecurity behavior casually.
