# Preload Guide

**Parent:** `../AGENTS.md`

The preload is sandboxed and built as CommonJS because Electron sandboxed preloads cannot load ESM. It exposes a narrow, validated bridge to Google Chat pages. Packaging arch and account backend (BW vs WCV) do not change the preload CJS contract.

## Build/runtime constraints

- Keep preload output CJS and imports compatible with `.js` paths. Packaging arch (arm64/x64 DMG) does not change the CJS contract.
- Do not remove the preload build `cleanDistPath: false` behavior; main and preload builds share output.
- No Node/config access from preload. Use IPC.
- No raw `ipcRenderer` exposure through `contextBridge`.
- Bare debounce timers are acceptable here; main-process tracked timer helpers are unavailable in the sandbox.
- Do not load feature preloads conditionally as part of offline recovery work; keep the existing import list stable unless a plan explicitly requires it.

## Current entry shape

`src/preload/index.ts` calls explicit installers in order: `installDisableWebAuthn` → `contextBridge.exposeInMainWorld('gogchat')` → `installFaviconChanged` → `installOffline` → `installPasskeyMonitor` → `installSearchShortcut` → `installUnreadCount` → `installNotificationBridge`. Do **not** import `overrideNotifications.ts` from `index.ts`. Do not add bare side-effect imports.

- Isolated-world code cannot see `window.gogchat`. Feature installers may use the bridge when present (unit tests) and must fall back to `ipcRenderer` in production.
- `installDisableWebAuthn` overrides isolated `navigator.credentials` and injects the same override into page world via `webFrame.executeJavaScript` (contextIsolation).
- `searchShortcut.ts` focuses `SELECTORS.SEARCH_INPUT`. Built-CJS proof: `tests/artifact/preload/preload-entry.test.ts` (`--project=preload-artifact`).
- Entire `src/preload/**` is excluded from Vitest coverage in `vitest.config.ts`. Preload tests still exist and must stay green.

## Bridge surface

`GogChatBridgeAPI` exposes send methods for unread count, favicon changes, notification clicks, online checks, and passkey auth failures, plus subscriptions for search shortcut and online status.

- Validate outgoing data before `ipcRenderer.send`.
- Return unsubscribe functions for subscriptions.
- Do not expose generic invoke/send helpers.

## Offline recovery (`offline.ts`)

- Listens for DOM `app:checkIfOnline` and calls `window.gogchat.checkIfOnline()`.
- Subscribes to `onOnlineStatus`:
  - **true** → exactly one `window.location.replace(urls.appUrl)` transition.
  - **false** → dispatch DOM-only `app:onlineCheckFailed` so the offline page restores retry UI. **Do not** `location.reload()`.
- Each check arms a 6,000 ms deadline; timeout dispatches `app:onlineCheckFailed` once. Clear the deadline on response or unload.
- `beforeunload` removes the check listener, cancels the deadline, and unsubscribes from online status.
- Keep the existing narrow bridge surface; never expose raw `ipcRenderer` to the offline page.

## DOM behavior

- DOM observation uses `MutationObserver`.
- `disableWebAuthn.ts` must remain the first feature import in `src/preload/index.ts` so `navigator.credentials` is neutralized before Google scripts. Keep that authored order when adding modules.
- Keep selectors and timing constants in shared constants where practical.

## Notification override

- `notificationBridge.ts` is the context-isolated notification path used by `index.ts`: it installs the page-world `Notification` wrapper with `webFrame.executeJavaScript`, listens for its custom event in isolated preload, validates with `validateNotificationData`, then sends `IPC_CHANNELS.NOTIFICATION_SHOW`.
- Main shows OS banners via `handleNotification` → `nativeNotification`; multi-account identity is resolved from the IPC sender in main, not from preload.
- Do not replace this with script-tag injection; Google CSP is intentionally preserved and inline page injection is fragile.
- `overrideNotifications.ts` is an intentional separate preload with `contextIsolation: false`.
- Do not import it from `index.ts`.
- `newNotify` must remain an ES5-style function, not an arrow, because it emulates the Notification constructor.
- It uses `asUnsafe` only with documented runtime checks and validates notification data before handoff.

## Tests

Keep coverage around `index.test.ts`, `notificationBridge.test.ts`, `offline.test.ts`, unread count, favicon changes, notification overrides, passkey monitoring, and WebAuthn disabling when touching preload behavior. Offline recovery tests must assert zero reloads on false replies and one app-URL replace on true.
