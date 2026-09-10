# Offline Page Guide

**Parent:** `../AGENTS.md`

`src/offline` is a static fallback page for network loss. It is not a normal renderer app. Account backend choice does not affect this page.

## Constraints

- No preload and no IPC (and no Electron APIs).
- Communicate retry intent with DOM events such as `window.dispatchEvent(new Event('app:checkIfOnline'))`.
- Preload answers false online checks with `app:onlineCheckFailed`; this page re-enables the retry control without reloading the document.
- Keep the script self-contained/IIFE-friendly.
- `setInterval` is intentionally untracked here because this is not main-process code.
- `MAX_AUTO_ATTEMPT_COUNT` (100) caps automatic retries on a 60s `setInterval`; do not add infinite retry loops. The script is an IIFE and must not import `src/shared`.

## Recovery UX contract

- Click / auto-check → disable button, show "Checking...", dispatch `app:checkIfOnline`.
- Failed check (false from main via preload) → listen for `app:onlineCheckFailed`, restore enabled Retry state. **Zero** `location.reload()` and **zero** app-URL navigation.
- Successful check is handled in preload (`location.replace(appUrl)`); this page does not navigate itself on success.
- Do not reload the offline document after a false reply; retain the fallback document through failed recovery checks.

## Build contract

- `copyOfflineAssets` in `scripts/build-rsbuild.js` copies `index.html` + `index.css` only to `lib/offline`. `src/offline/index.ts` is **not** a current Rsbuild entry, so the retry IIFE may not ship until that file is added as an entry.
- `src/offline/index.html` still references `../../lib/offline/index.js`. That path is the tree's intended script hook; do not invent a build-entry or copy-step fix here — document the contract vs tree only.
- Do not change output paths without updating `scripts/build-rsbuild.js` and packaging checks. Copied assets ship the same way in both macOS packaging arches.

## Anti-patterns

- No Electron API assumptions.
- No direct Google Chat logic beyond explaining/offering retry.
- No shared mutable state with main/preload.
- No `window.location.reload()` on failed connectivity checks.
