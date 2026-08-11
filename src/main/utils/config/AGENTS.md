# Config Utilities Guide

**Parent:** `../AGENTS.md`
**Version:** 3.20.0

This directory owns typed electron-store access and read-through caching for app config. Config schema is packaging-arch independent.

## Boundaries

- Shared config shape lives in `src/shared/types/config.ts`.
- Main-process schema and defaults live in `configSchema.ts` (imported by `src/main/config.ts`).
- Encrypted electron-store init and `configGet` / `configSet` accessors live in `src/main/config.ts`.
- Cache helpers here (`configCache.ts`) are for normal app config only.
- SafeStorage-backed security flags live in `src/main/utils/security/secureFlags.ts`, not config.

## Notable keys (`app.*`)

| Key                                                                             | Default                 | Meaning                                                                                                 |
| ------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `notificationPermissionRequested`                                               | `false`                 | First-run request completed (Enable / System Settings, and/or probe `show`); not live OS grant status   |
| `unreadDeltaNotifications`                                                      | `false`                 | Opt-in badge-increase OS banners (Preferences toggle is shipped; default remains false)                 |
| `accountLabels`                                                                 | `{}`                    | Optional per-account subtitle strings for multi-account banners                                         |
| `useWebContentsView`                                                            | `false`                 | Opt-in WebContentsView account backend (BrowserWindow remains default; no flip without matrix evidence) |
| `autoCheckForUpdates` / `autoLaunchAtLogin`                                     | `true`                  | Background update check; open-at-login                                                                  |
| `startHidden` / `hideMenuBar` / `disableSpellChecker` / `suppressPasskeyDialog` | `false`                 | UX flags                                                                                                |
| `memory.dehydrationThresholdMs`                                                 | schema-clamped 60s–600s | BrowserWindow idle dehydrate threshold                                                                  |
| `memory.v8HeapCapMB`                                                            | schema only             | **Not** read at startup. Heap cap is `GOGCHAT_V8_HEAP_CAP_MB` / default 512 before `app.ready`          |
| `memory.diskCacheMaxMB`                                                         | schema only             | Documented, not yet enforced                                                                            |

## Cache behavior

- Config cache has no TTL.
- Invalidate on explicit set/delete/clear operations.
- Do not add runtime file watchers for config changes.
- Keep defaults aligned with schema and shared types.

## Change workflow

1. Add the field to shared `AppConfig` (`src/shared/types/config.ts`).
2. Add schema validation and defaults in `configSchema.ts`.
3. Ensure `src/main/config.ts` still exports typed accessors if needed (usually `configGet`/`configSet` suffice).
4. Update tests for schema, defaults, and cache invalidation.

## Performance note

Config store init markers (`store-init-start` / `store-init-end`) may feed warn-only budget extractors. Do not gate CI on store init until a stable baseline exists. Optional config profiling remains behind `ENABLE_CONFIG_PROFILING` and must not write startup metrics JSON.

## Anti-patterns

- No security kill switches in config.
- No untyped key access from feature code.
- No implicit config migration hidden in a getter.
