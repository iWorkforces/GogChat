# Shared Types Guide

**Parent:** `../AGENTS.md`

This directory defines contracts crossing main, preload, tests, and shared validators. Types stay packaging-arch neutral.

## Important files

- `branded.ts` - allowed branded casts and helpers such as `asValidatedURL`, `asAccountIndex`, `toPartition`, and `asWebContentsId`.
- `bridge.ts` - preload-exposed API surface.
- `config.ts` - shared config shape (includes `notificationPermissionRequested`, `unreadDeltaNotifications`, `accountLabels`).
- `domain.ts` - app domain payload types.
- `errors.ts` - typed error codes and app error shapes.
- `ipc.ts` - IPC payload/response maps.
- `window.ts` - `IAccountWindowManager`, `AccountWebContentsInfo`, `AccountBackendKind`, and account window contracts.

## Account window contract notes

- Both backends implement `IAccountWindowManager`, including `enumerateAccountWebContents()`.
- `AccountWebContentsInfo` carries `accountIndex`, `webContentsId`, `osProcessId`, `backend`, and live `webContents`.
- Performance sampling and multi-account diagnostics depend on this enumeration; do not drop it from the interface.
- Backend policy (BrowserWindow default vs WebContentsView opt-in) is not a type-level decision; keep types backend-neutral.

## Rules

- Keep files type-only unless a runtime helper is explicitly needed for branding/validation.
- Use `import type` where possible.
- Do not import from `src/main` or `src/preload`.
- Do not add a barrel export.
- Keep `ErrorCode` exhaustive when adding app error cases.

## Adding a branded type

1. Define the brand here.
2. Add one narrow constructor/helper that validates or documents the boundary.
3. Use the helper at system boundaries; do not scatter bare `value as Brand` casts.

## Adding IPC types

1. Add payload and response types.
2. Extend `IPCChannelPayloadMap` / response maps.
3. Update bridge types in `bridge.ts` if renderer-facing.
4. Keep validators in shared validator files, not in type-only modules.
