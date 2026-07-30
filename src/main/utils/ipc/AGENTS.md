# IPC Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns the main-side IPC safety pipeline.

## Pipeline

Every handler should follow:

1. Rate limit.
2. Validate payload.
3. Deduplicate only if safe.
4. Handle.
5. Catch/log typed failures.

Prefer the current factory helpers in this directory over ad-hoc `ipcMain.handle` or `ipcMain.on` calls.

## Components

- `defineIPC.ts` / `ipcHelper.ts` - canonical handler wrappers.
- `rateLimiter.ts` - per-channel token bucket with 1s windows and stale cleanup.
- `ipcDeduplicator.ts` - short promise sharing, default 100ms.
- `ipcDeduplicationPatterns.ts` - key functions for safe dedup cases.
- `ipcFastPath.ts` - sync one-way hot `send` channels only; never for `invoke`.
- `ipcCommonValidators.ts` - reusable payload validation.
- `benignLogFilter.ts` - suppresses expected noisy renderer/subframe errors.

## Latency sampling

- IPC latency samples (when recorded) are optional export fields and remain **warn-only** in the perf budget until a real producer and baseline exist.
- Do not make IPC latency a gated CI metric without that baseline.

## Channel contract

- Channel names live in `src/shared/constants.ts` under `IPC_CHANNELS`.
- Payload/response types live in `src/shared/types/ipc.ts` and related domain types.
- Preload exposes narrow methods from `src/shared/types/bridge.ts`.
- Never hardcode a channel string.

## Existing channel groups

- Renderer to main: unread count, favicon, notification show/click, online check, passkey auth failure.
- Main to renderer: search shortcut and online status.

## Anti-patterns

- No raw `ipcMain` registrations without validation and catch handling.
- No dedup for mutating or non-idempotent operations.
- No raw `ipcRenderer` exposure from preload.
