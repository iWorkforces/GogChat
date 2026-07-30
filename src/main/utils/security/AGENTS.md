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

- `permissionHandler.ts` allowlists only expected permissions such as notifications, mediaKeySystem, and geolocation.
- `mediaAccess.ts` deduplicates macOS TCC prompts and returns false in CI/headless contexts.

## Certificate pinning gotchas

- Pinning covers Google/gstatic/googleapis/googleusercontent domains.
- Validation cache keys must include both hostname and fingerprint.
- Certificate pinning and related kill switches must remain intact when changing performance or packaging behavior.
- Kill switches (`disableCertPinning`, `disableCdpTelemetry`) default to safe false behavior on read/decrypt errors.

## Anti-patterns

- No unvalidated URL handoff to Electron shell APIs.
- No config-store security flags.
- No direct reads of secure-flags or encryption-key files; always go through `secureFlags.ts` / `encryptionKey.ts`.
- No broad CSP rewrite to “make Chat work”.
- No new permission without a narrow host/use-case explanation and tests.
