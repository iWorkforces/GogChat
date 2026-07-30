# Security Utilities Guide

**Parent:** `../AGENTS.md`

This directory contains main-process security wrappers and kill-switch storage. It supplements feature-level certificate pinning and shared URL validation.

## Core rules

- Certificate pinning setup is in `src/main/features/certificatePinning.ts` and runs before network use.
- Secure kill switches live in `secureFlags.ts` using SafeStorage at `<userData>/secure-flags.enc`; they are not electron-store config.
- `encryptionKey.ts` must be used only after `app.whenReady()`.
- External navigation must pass through `src/shared/urlValidators.ts` and `shellWrapper.ts`.
- Main code must never call `shell.openExternal()` directly.

## CSP and webview constraints

- `cspHeaderHandler.ts` performs targeted COEP/COOP stripping for Google domains.
- It strips `frame-ancestors`/XFO only for benign hosts such as `accounts.google.com` and `ogs.google.com`.
- Do not wholesale replace Google CSP.
- `docs/windowWrapper-history.md` explains why `webSecurity:false` and CSP exceptions exist; read it before changing webview/network rules.

## Permissions and media

- `permissionHandler.ts` allowlists only expected Chromium permissions such as notifications, mediaKeySystem, and geolocation (web permission layer — separate from OS notification authorization).
- `mediaAccess.ts` deduplicates macOS TCC camera/mic prompts via `systemPreferences` and returns false in CI/headless contexts.
- `notificationAccess.ts` owns **macOS OS-level** notification authorization (Electron has no `getNotificationAccessStatus` API):
  - Call `ensureNotificationPermission({ parentWindow })` from `windowWrapper` / WCV host on **`ready-to-show`**.
  - First-run short dialog when config flag is false and a parent window is provided: **Enable** / **System Settings** / **Not Now**.
  - Then silent probe `Notification` (triggers `requestAuthorization` when still undetermined).
  - Persist `app.notificationPermissionRequested` only after probe `show`.
  - Log every `ensure →` result (`unsupported` | `skipped-ci` | `already-requested` | `prompt-declined` | `scheduled` | `failed-to-schedule`).
  - Session “Not Now”, process de-dupe, CI skip; Preferences → Notification Settings… via `showNotificationSettingsDialog` / `openNotificationSystemSettings`.
  - Flag means “request path completed,” not live grant status.

## Certificate pinning gotchas

- Pinning covers Google/gstatic/googleapis/googleusercontent domains.
- Validation cache keys must include both hostname and fingerprint.
- Certificate pinning and related kill switches must remain intact when changing performance or packaging behavior (including dual-arch macOS DMG work).
- Kill switches (`disableCertPinning`, `disableCdpTelemetry`) default to safe false behavior on read/decrypt errors.

## Anti-patterns

- No unvalidated URL handoff to Electron shell APIs.
- No config-store security flags.
- No direct reads of secure-flags or encryption-key files; always go through `secureFlags.ts` / `encryptionKey.ts`.
- No broad CSP rewrite to “make Chat work”.
- No new permission without a narrow host/use-case explanation and tests.
