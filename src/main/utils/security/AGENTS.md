# Security Utilities Guide

**Parent:** `../AGENTS.md`

This directory contains main-process security wrappers and SafeStorage-backed kill-switch storage. It supplements shared URL validation, Chromium permission handlers, and targeted CSP header fixes. There is **no** custom certificate-pinning feature module anymore.

## Core rules

- TLS trust is Chromium’s. Do not reintroduce `app`/`session` `certificate-error` handlers without an explicit security plan. The security-phase unit test asserts zero `certificate-error` listeners after security features init.
- Secure kill switches live in `secureFlags.ts` using SafeStorage at `<userData>/secure-flags.enc`; they are not electron-store config.
- Active product kill switch: `disableCdpTelemetry` (consulted by CDP telemetry). Residual storage key `disableCertPinning` remains in the encrypted blob API for compatibility/tests but **no startup path reads it** after pinning removal.
- `encryptionKey.ts` must be used only after `app.whenReady()`.
- External navigation must pass through `src/shared/urlValidators.ts` and `shellWrapper.ts`.
- Main code must never call `shell.openExternal()` directly.

## CSP and webview constraints

- `cspHeaderHandler.ts` performs targeted COEP/COOP stripping for Google domains.
- It strips `frame-ancestors`/XFO only for benign hosts such as `accounts.google.com` and `ogs.google.com`.
- Do not wholesale replace Google CSP.
- Current `windowWrapper` uses `webSecurity: true`. Historical rationale for older webview exceptions lives in `docs/windowWrapper-history.md` — read it before changing webview/network rules.

## Permissions and media

- `permissionHandler.ts` allowlists only expected Chromium permissions such as notifications, mediaKeySystem, and geolocation (web permission layer — separate from OS notification authorization).
- `mediaAccess.ts` deduplicates macOS TCC camera/mic prompts via `systemPreferences` and returns false in CI/headless contexts. Security-phase `mediaPermissions` schedules proactive TCC checks fire-and-forget (does not block window creation).
- `notificationAccess.ts` owns **macOS OS-level** notification authorization (Electron has no `getNotificationAccessStatus` API):
  - Call `ensureNotificationPermission({ parentWindow })` from `windowWrapper` / WCV host on **`ready-to-show`**.
  - First-run short dialog when config flag is false and a parent window is provided: **Enable** / **System Settings** / **Not Now**.
  - Then silent probe `Notification` (triggers `requestAuthorization` when still undetermined).
  - Persist `app.notificationPermissionRequested` only after probe `show`.
  - Log every `ensure →` result (`unsupported` | `skipped-ci` | `already-requested` | `prompt-declined` | `scheduled` | `failed-to-schedule`).
  - Session “Not Now”, process de-dupe, CI skip; Preferences → Notification Settings… via `showNotificationSettingsDialog` / `openNotificationSystemSettings`.
  - Flag means “request path completed,” not live grant status.

## Secure flags gotchas

- Kill-switch reads default to safe `false` on missing file, decrypt failure, or unavailable SafeStorage.
- Do not move kill switches into electron-store (no MAC on that path).
- Dual-arch packaging and performance work must not reintroduce silent TLS MITM bypasses.

## Anti-patterns

- No unvalidated URL handoff to Electron shell APIs.
- No config-store security flags.
- No direct reads of secure-flags or encryption-key files; always go through `secureFlags.ts` / `encryptionKey.ts`.
- No broad CSP rewrite to “make Chat work”.
- No new permission without a narrow host/use-case explanation and tests.
- No custom certificate-pinning feature without an explicit security plan and tests that document trust behavior.
