# Config Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns typed electron-store access and read-through caching for app config.

## Boundaries

- Shared config shape lives in `src/shared/types/config.ts`.
- Main-process schema/defaults/accessors live in `src/main/config.ts`.
- Cache helpers here are for normal app config only.
- SafeStorage-backed security flags live in `src/main/utils/security/secureFlags.ts`, not config.

## Cache behavior

- Config cache has no TTL.
- Invalidate on explicit set/delete/clear operations.
- Do not add runtime file watchers for config changes.
- Keep defaults aligned with schema and shared types.

## Change workflow

1. Add the field to shared `AppConfig`.
2. Add validation/defaults in `src/main/config.ts`.
3. Add typed accessor/mutation helpers if needed.
4. Update tests for schema, defaults, and cache invalidation.

## Performance note

Config store init markers (`store-init-start` / `store-init-end`) may feed warn-only budget extractors. Do not gate CI on store init until a stable baseline exists. Optional config profiling remains behind `ENABLE_CONFIG_PROFILING` and must not write startup metrics JSON.

## Anti-patterns

- No security kill switches in config.
- No untyped key access from feature code.
- No implicit config migration hidden in a getter.
