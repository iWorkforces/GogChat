# Shared Code Guide

**Parent:** `../AGENTS.md`

`src/shared` is the only code shared by main and preload. Keep it dependency-light, deterministic, and free of Electron runtime side effects. Shared contracts do not encode packaging arch (arm64/x64).

## Ownership

- `constants.ts` owns channel names, selectors, timings, icon/badge constants, URL patterns, allowlisted hosts, and deep-link constants.
- `urlValidators.ts` owns parse-once URL validation for navigation, external links, deep links, and Google auth detection.
- `dataValidators.ts` owns non-URL payload validation.
- `typeUtils.ts` owns `assertNever`, `asType<T>()`, and documented unsafe-cast helpers.
- `types/` owns contracts used across process boundaries; see `types/AGENTS.md` (`IAccountWindowManager`, `AccountWebContentsInfo`, bridge API, config, errors, IPC maps).

## IPC/channel workflow

When adding a channel:

1. Add the name to `IPC_CHANNELS` in `constants.ts`.
2. Add payload/response/domain types under `types/`.
3. Add or reuse validators in `dataValidators.ts` / `urlValidators.ts`.
4. Update `IPCChannelPayloadMap` and bridge types.
5. Wire main handler and preload method separately.

## URL rules

- Parse once and pass branded/validated values across boundaries.
- Strip credentials where relevant.
- Keep Google auth detection centralized; account managers rely on it to avoid interrupting auth pages.
- Do not call Electron APIs here.

## Type rules

- Use `as const satisfies` for exported constant maps.
- Prefer branded helpers from `types/branded.ts` over bare casts.
- `asUnsafe<T>(value, reason)` requires a real reason and should stay rare.
- No imports from `src/main` or `src/preload`.

## Anti-patterns

- No runtime Electron logic in shared code.
- No string-literal IPC channels.
- No barrel files.
- No mutable singleton state that differs by process.
