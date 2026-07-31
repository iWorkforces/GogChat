# windowWrapper.ts — Commit History Investigation

**File**: `src/main/windowWrapper.ts`
**Current size**: ~71 lines (down from 344 before extractions)
**Investigation date**: 2026-04-21
**Total commits touching this file**: 31

## Executive Summary

windowWrapper.ts is the BrowserWindow factory for GogChat. Its history reveals 4 major themes:

1. **CSP/Security tug-of-war** (7 commits) — Google Chat requires specific CSP relaxations that conflict with security best practices
2. **Sub-frame load failure suppression** (5 commits) — Google Chat's embedded frames trigger benign CSP violations that must be filtered
3. **Multi-account session isolation** (1 commit) — Added per-account partition support
4. **Progressive extraction** (2 commits) — Event logging and health monitoring extracted to focused modules

## Current code (authoritative)

**As of the product tree today** (`src/main/windowWrapper.ts`):

| Preference | Value |
| --- | --- |
| `webSecurity` | **`true`** |
| `contextIsolation` | `true` |
| `sandbox` | `true` |
| `nodeIntegration` | `false` |

Do **not** treat the historical `webSecurity: false` narrative below as the current product setting. If you change `webSecurity`, re-test Google Meet, Huddles, and embedded media on a signed build.

## Critical Findings for Future Refactoring

### ⚠️ webSecurity has flipped both ways historically — current is true
- **Commit `49501cc`**: Set `webSecurity: false` for "Google Chat compatibility"
- **Commit `60bdff9`**: Set `webSecurity: true` as a security fix
- **Current product value is `webSecurity: true`** in `windowWrapper.ts` (and WCV child views). Older notes that said “current is false” are stale. **Do NOT flip this flag without testing Google Meet, Huddles, and embedded media.**

### ⚠️ Custom CSP Was Removed Because It Broke Google Chat
- **Commit `ad0c937`**: Added auth page CSP bypass (accounts.google.com)
- **Commit `be06076`**: **Ripped out entire custom CSP**. The nonce-based CSP caused `'unsafe-inline'` to be silently ignored per CSP3 spec, blocking all Google Chat inline scripts and freezing the loading screen.
- **Current approach**: Only strips COEP/COOP headers and frame-ancestors for specific benign hosts. Does NOT replace Google's own CSP.
- **Lesson**: Never wholesale-replace Google's CSP. Their inline scripts require `'unsafe-inline'` to function.

### ⚠️ Sub-frame Failures Are Expected and Must Be Suppressed
- **Commit `0f29049`**: Added `BENIGN_CSP_BLOCKED_HOSTS` (accounts.google.com, ogs.google.com) and filtering functions
- **Commit `ad9e93a`**: Added frame-ancestors stripping from CSP for benign hosts + X-Frame-Options removal + process warning suppression
- **Commit `ebc0e0b`**: Updated console-message handler to typed Event API, added more benign patterns (deprecated API warnings, browser console warnings)
- **Root cause**: accounts.google.com and ogs.google.com embed in chat.google.com via iframes. Their CSP `frame-ancestors` directive blocks this embedding, causing ERR_BLOCKED_BY_RESPONSE. The fix strips frame-ancestors from CSP for these hosts only.
- **Do NOT remove the benign filtering** — it prevents log flooding from expected behavior.

## Chronological Commit Table

| # | SHA (short) | Date | Category | What Changed | Why |
|---|---|---|---|---|---|
| 1 | `6358574` | 2025-10-07 | initial | Initial Google Chat wrapper | Allow full Google functionalities |
| 2 | `03f5174` | 2025-10-07 | initial | Security improvements | Performance and security baseline |
| 3 | `b3cd719` | 2025-10-07 | cleanup | Code simplification | Simplify code explanation |
| 4 | `2638975` | 2025-10-07 | fix | Import path fix | Fix import JS path |
| 5 | `6de1f6e` | 2025-10-07 | feature | Caching optimization | Caching optimization part 1 |
| 6 | `486e985` | 2025-10-08 | cleanup | Linting pass | Code style cleanup |
| 7 | `f418c83` | 2025-10-08 | cleanup | Linting pass 2 | Code style cleanup |
| 8 | `100ecea` | 2025-10-08 | feature | Message analytics | Analytics integration |
| 9 | `4120801` | 2025-10-09 | migration | ESM migration | Migrated from CJS to ESM |
| 10 | `423408f` | 2025-10-09 | release | Version bump | v3.1.7 |
| 11 | `0fa260f` | 2025-10-09 | feature | Dynamic imports | Code splitting |
| 12 | `ad0c937` | 2025-10-11 | **security** | Auth page CSP bypass | Google Sign-In has its own CSP; custom CSP breaks auth flow |
| 13 | `49501cc` | 2025-11-16 | **compatibility** | `webSecurity: false` | Required for Google Chat cross-origin resource loading on ARM64 |
| 14 | `be06076` | 2026-02-22 | **critical-fix** | Removed entire custom CSP, replaced with COEP/COOP stripping only | Nonce-based CSP caused `unsafe-inline` to be ignored per CSP3 spec, freezing Google Chat loading screen. Removed 95 lines of CSP code. |
| 15 | `1d88b17` | 2026-02-23 | cleanup | Stricter TS options | Added strict compiler options to tsconfig.json |
| 16 | `390585f` | 2026-02-23 | feature | Performance improvements | Startup/latency optimizations |
| 17 | `0f29049` | 2026-03-06 | **critical-fix** | Added `BENIGN_CSP_BLOCKED_HOSTS` + benign message/subframe filtering | Sub-frames from accounts.google.com and ogs.google.com fail with ERR_BLOCKED_BY_RESPONSE due to frame-ancestors CSP. These are expected and must be suppressed to prevent log flooding. |
| 18 | `ebc0e0b` | 2026-03-06 | **security** | Updated console-message to typed Event API, added more benign patterns | Deprecated API warnings, browser console warnings, ALLOW-FROM X-Frame-Options noise |
| 19 | `eece8ff` | 2026-03-12 | feature | GogChat branding | App name change |
| 20 | `3d49f51` | 2026-03-15 | feature | Notification permission | Ask for notification permission |
| 21 | `ad9e93a` | 2026-03-19 | **security** | Frame-ancestors CSP stripping for benign hosts + process warning suppression | accounts.google.com frame-ancestors blocks embedding in chat.google.com. Strips frame-ancestors from CSP + X-Frame-Options + Node.js process warnings. |
| 22 | `0effa94` | 2026-03-20 | **fix** | Update message handling | Fix update new messages issue |
| 23 | `ce4b494` | 2026-03-20 | **multi-account** | Added `partition` parameter to function signature | Multi-account session isolation via per-account `persist:account-N` session partitions |
| 24 | `60bdff9` | 2026-03-20 | **security** | `webSecurity: true` | Enabled webSecurity for security hardening (current product still uses `true`) |
| 25 | `e1f7c01` | 2026-04-01 | test | Test additions | Added 190 unit tests (file touched for imports/types) |
| 26 | `4274f54` | 2026-04-01 | cleanup | Feature wiring cleanup | Reduce log noise, clarify feature wiring |
| 27 | `699795c` | 2026-04-01 | feature | Async processing | Async processing improvements |
| 28 | `a02a216` | 2026-04-08 | feature | Media permissions | Camera/mic for Google Meet/Huddles |
| 29 | `4b81372` | 2026-04-09 | **refactor** | Decompose monolithic modules | Extracted focused utilities |
| 30 | `7b63e1e` | 2026-04-09 | **refactor** | Extracted `windowEventLogger` + `windowHealthMonitor` | Event logging and health monitoring extracted to dedicated modules. Reduced windowWrapper by 65 lines. |
| 31 | `6cb6234` | 2026-04-18 | **refactor** | Modularity improvements | Moved to externalized utility imports (windowDefaults, cspHeaderHandler, benignLogFilter) |

## Key Architectural Decisions Preserved in This File

1. **COEP/COOP stripping** — Required for Google Chat's cross-origin embedding. Never remove.
2. **frame-ancestors CSP stripping for benign hosts** — Required to prevent ERR_BLOCKED_BY_RESPONSE for Google auth sub-frames.
3. **Benign log filtering** — Prevents log flooding from expected CSP violations. The filtering logic lives in `benignLogFilter.ts`.
4. **partition parameter** — Required for multi-account session isolation. Passed from `accountWindowManager.ts`.
5. **Event logging + health monitoring** — Extracted to `windowEventLogger.ts` and `windowHealthMonitor.ts`. These provide diagnostic data for debugging load failures.

## Recommended Characterization Tests

Based on this investigation, the following test cases should be written before any refactoring:

### Security Tests
1. **webSecurity is true** — Assert `webPreferences.webSecurity === true` in created window config (matches product)
2. **COEP/COOP headers are stripped for Google domains** — Mock `onHeadersReceived`, verify headers removed for `*.google.com`, `*.gstatic.com`, etc.
3. **COEP/COOP headers are NOT stripped for non-Google domains** — Verify headers preserved for `evil.com`
4. **frame-ancestors stripped from CSP for benign hosts** — Verify `accounts.google.com` CSP frame-ancestors removed
5. **frame-ancestors NOT stripped for non-benign hosts** — Verify `chat.google.com` CSP frame-ancestors preserved
6. **X-Frame-Options removed for benign hosts** — Verify deleted for `ogs.google.com`

### Multi-Account Tests
7. **partition parameter passed to BrowserWindow** — `windowWrapper(url, 'persist:account-1')` → config has `partition: 'persist:account-1'`
8. **undefined partition = no partition** — `windowWrapper(url)` → config has no partition key
9. **Different partitions create isolated sessions** — Two windows with different partitions don't share cookies

### Benign Log Filter Tests (in benignLogFilter.ts)
10. **ERR_BLOCKED_BY_RESPONSE for accounts.google.com suppressed** — `isBenignSubframeLoadFailure(-27, 'https://accounts.google.com/...', false)` returns true
11. **Main frame failures NOT suppressed** — `isBenignSubframeLoadFailure(-27, 'https://accounts.google.com/...', true)` returns false
12. **Non-benign host failures NOT suppressed** — `isBenignSubframeLoadFailure(-27, 'https://evil.com/...', false)` returns false
13. **CSP frame-ancestors violation for benign host suppressed** — `isBenignRendererConsoleMessage("Framing 'https://accounts.google.com/' violates...", ...)` returns true
14. **Process warning for benign URL failure suppressed** — `isBenignElectronUrlWarning("Failed to load URL: https://ogs.google.com/... ERR_BLOCKED_BY_RESPONSE")` returns true

### Event Logging Tests (in windowEventLogger.ts)
15. **show/hide/focus/blur/minimize/restore events logged** — Verify log.info called with correct format

### Health Monitoring Tests (in windowHealthMonitor.ts)
16. **render-process-gone logged as error** — Verify reason and exitCode in log output
17. **unresponsive logged as warning** — Verify log.warn called
18. **responsive logged as info** — Verify log.info called
