# Source Guide

**Parent:** `../AGENTS.md`

`src` contains the Electron main process, sandboxed preload bridge, shared contracts, and static offline fallback assets. There is **no** `src/renderer` — the UI is remote Google Chat plus `offline/` and sandboxed About/Update dialogs. Packaging and dual-arch DMG work live outside `src/` (`mac/AGENTS.md`, `scripts/AGENTS.md`). Product version, dual-backend multi-account rules, and security invariants live in root `AGENTS.md` (v3.19.0).

## Route source work

- Main-process startup, features, utilities, account windows, security, or IPC handlers: `main/AGENTS.md`.
- Cross-process constants, validators, app identity, and types: `shared/AGENTS.md`.
- Sandboxed bridge or page-observation code: `preload/AGENTS.md` (includes offline recovery bridge in `preload/offline.ts` and `notificationBridge.ts`).
- Static network-loss fallback assets: `offline/AGENTS.md` (DOM-only retry UI; no Electron APIs).
- Multi-account backends / navigation / hooks / webPreferences: `main/utils/account/AGENTS.md`.
- Performance monitors / final export: `main/utils/lifecycle/AGENTS.md`.
- OS notification permission: `main/utils/security/AGENTS.md`; presentation/labels/focus/unread-delta: `main/utils/platform/AGENTS.md`.

## Process boundaries

- `main/` owns Electron APIs, application lifecycle, windows, and IPC handlers.
- `preload/` is a sandboxed CommonJS bridge between Google Chat pages and main.
- `shared/` is dependency-light code used by both main and preload. It must not depend on Electron or either process directory.
- `offline/` is a static fallback page, not a normal renderer application. It has no preload or IPC; it coordinates with preload only via DOM events (`app:checkIfOnline` / `app:onlineCheckFailed`).

## Root modules

- `environment.ts` is main-process only because it imports Electron. Do not load it in a renderer.
- `urls.ts` is the shared frozen definition object for application and logout URLs.

## Import rules

- TypeScript uses NodeNext-style `.js` import specifiers, including imports that resolve to TypeScript source files.
- Do not import directly between `src/main` and `src/preload`; use typed shared contracts, constants, and IPC instead.
