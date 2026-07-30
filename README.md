# GogChat

GogChat is an unofficial macOS desktop wrapper for Google Chat, built with Electron and TypeScript. It loads `https://mail.google.com/chat/u/0` in isolated Electron sessions, adds native desktop integrations, and keeps the main-process startup path small through build-time feature planning.

> **Platform:** macOS — production packages both Apple Silicon (`arm64`) and Intel (`x64`) DMGs. Primary development and CI runners target Apple Silicon.

## Features

### Desktop integration

- System tray icon with close-to-tray behavior
- Native OS notifications (Google Chat web notifications bridged to macOS banners; grant notification permission when prompted, and enable desktop notifications in Chat settings)
- Multi-account banners always show an account subtitle (`Account 1`, `Account 2`, …, or a custom label) and group per account; click opens the matching account
- Preferences → Account Labels to set names like Work / Personal for notification subtitles
- Optional fallback: Preferences → Notify on Unread Badge Increase (off by default) shows a generic banner when that account’s unread count rises while unfocused
- Dock badge shows total unreads across accounts (capped at 99)
- Preferences → Notification Settings… opens macOS Notifications for GogChat
- Application menu and search shortcut integration
- Auto-launch at login
- Window state persistence
- Context menu support
- Deep-link handling and single-instance enforcement
- Update notifications

### Multi-account runtime

- Per-account `persist:account-N` Electron session partitions for cookie isolation
- Multi-account windows managed by `accountWindowManager`
- Bootstrap login window promotion after authentication
- Opt-in `WebContentsView` account backend behind the `app.useWebContentsView` config flag
- Idle account session maintenance for cache cleanup

### Security

- `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`
- Certificate pinning for Google domains, with a safeStorage-backed kill switch
- AES-256-GCM encrypted `electron-store` configuration
- macOS safeStorage / Keychain support for security-sensitive flags and encryption-key migration
- URL whitelist validation for navigation and external links
- IPC channel constants, validators, rate limiting, and structured error handling
- Content Security Policy header handling for embedded Google Chat pages

### Performance and observability

- Rsbuild/Rspack bundling with a single main-process entry and lazy deferred chunks
- Non-blocking deferred feature phase after the first window is ready
- Icon cache warmup and tiered icon loading
- DNS/TCP/TLS preconnect for Google Chat-related hosts
- Renderer V8 heap cap via `GOGCHAT_V8_HEAP_CAP_MB` (default: 512 MB)
- Local-only CDP RUM telemetry, killable via secure flag
- CI performance budget gate using headless startup metrics

## Architecture

GogChat is not structured like a default Electron starter app. The app uses a dual-build pipeline and declarative feature lifecycle.

```text
src/
├── main/              # Electron main process
│   ├── features/      # Feature modules
│   ├── initializers/  # App lifecycle + declarative feature specs
│   ├── generated/     # Build-generated feature plan; do not edit by hand
│   └── utils/         # Window/session/config/IPC/performance utilities
├── preload/           # Sandbox-compatible CommonJS preload scripts
├── shared/            # Cross-process constants, validators, and types
└── offline/           # Offline fallback assets copied into lib/offline
```

### Feature lifecycle

Feature registration is declarative:

1. Feature specs live in `src/main/initializers/{security,ui,deferred}.spec.ts`.
2. `scripts/featurePlanPlugin.js` parses those specs during the build.
3. The plugin topologically sorts dependencies into batches and emits `src/main/generated/featurePlan.ts`.
4. `src/main/utils/lifecycle/featureRunner.ts` walks the generated plan at runtime.

New features should be added as feature modules under `src/main/features/` and declared in the appropriate spec file. Do not register features in `src/main/index.ts`, and do not hand-edit generated files.

### Build system

`scripts/build-rsbuild.js` runs two Rsbuild passes:

1. **Main process:** ESM, `electron-main` target, single entry at `src/main/index.ts`.
2. **Preload scripts:** CommonJS, `electron-renderer` target, one entry per `src/preload/**/*.ts` file.

The preload build must remain CommonJS because Electron sandboxed preload scripts cannot load ESM. The preload pass also keeps `cleanDistPath: false` so it does not wipe the main-process output.

## Development

### Prerequisites

- macOS (Apple Silicon preferred for local development; Intel packaging supported)
- Node.js `>=24.16.0 <25.0.0`
- Bun `>=1.3.13` (repository package manager: `bun@1.3.14`)

### Setup

```bash
bun install
bun run hooks:install
```

### Common commands

```bash
# Build development output
bun run build:dev

# Build production output
bun run build:prod

# Watch development build
bun run build:watch

# Build production output and launch Electron
bun run start

# Type-check the project
bun run typecheck

# Run Vitest
bun run test

# Run Vitest once
bun run test:run

# Run coverage
bun run test:coverage

# Run ESLint + Prettier checks
bun run lint:all

# Auto-fix lint/format issues
bun run lint:all:fix

# Build an arm64 macOS DMG (default)
bun run build:mac

# Build an Intel x64 macOS DMG
bun run build:mac:x64

# Arch-pinned macOS release packages (no publish side effect)
bun run package:mac:arm64
bun run package:mac:x64
```

## Testing and quality gates

- Unit tests are run with Vitest.
- Playwright is available for Electron-oriented tests.
- `bun run typecheck` runs `tsc -b`.
- `bun run lint:all` runs the combined ESLint and Prettier checks.
- `bun run check:doc-claims` validates documented claims that are covered by repository checks.
- CI also checks circular dependencies with `madge` and runs the performance budget gate from `scripts/check-perf-budget.js` against `performance-metrics.json` produced by `scripts/headless-startup.js`.

## Packaging and releases

```bash
# Production DMGs, macOS-specific (arm64 default; pass --arch or use aliases)
bun run build:mac
bun run build:mac:x64

# Development DMG, macOS-specific
bun run build:mac:dev

# Arch-pinned macOS release package flows, no publish side effect
bun run package:mac:arm64
bun run package:mac:x64
bun run package:mac:artifacts

# Windows release-engineering preparation only, not a public support claim
bun run package:win:x64
bun run package:win:arm64
bun run package:win:artifacts
bun run package:win:signing-policy
```

Release automation runs on GitHub Actions for `main` and `v*` tags. The split workflow prepares the tag, packages **both** macOS DMGs (`arm64` and `x64`) and native Windows CI installers, verifies aggregated artifacts, and uses one `publish-release` job for release upload.

macOS release assets are separate DMGs named `${productName}-${version}-arm64.dmg` and `${productName}-${version}-x64.dmg`. The public product remains a macOS desktop app; Windows release engineering/preparation is guarded and is not a public support claim. Support or publication claims for Windows require clean packaged smoke evidence on Windows x64 and real Windows arm64 before any user-facing wording changes.

Windows preparation uses separate NSIS installers named `${productName}-${version}-windows-x64-setup.exe` and `${productName}-${version}-windows-arm64-setup.exe`. Use `x64` in user-facing architecture labels, not `amd64`.

macOS CI packaging uses `macos-latest` with an arm64/x64 matrix (x64 is cross-packaged via electron-builder). Native Windows CI packaging uses `windows-latest` for x64 with an AMD64 runner proof and `windows-11-arm` for arm64 with an ARM64 runner proof. Windows release publication requires a Windows Authenticode signing route through `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` or explicit owner opt-in for unsigned Windows assets through the existing signing policy gate.

The Windows electron-builder overlay registers only the `gogchat` protocol. The base macOS config may still include HTTPS protocol handling for the macOS app.

Notarization is handled by the electron-builder hooks when Apple credentials are available through the release environment.

## Project conventions

- Use Bun for dependency and script execution.
- Keep preload output CommonJS and sandbox-compatible.
- Add lifecycle features through `initializers/*.spec.ts`, not `index.ts`.
- Use shared IPC constants from `src/shared/constants.ts`.
- Validate and rate-limit IPC handlers.
- Use `configGet` / `configSet` for encrypted config access.
- Store security-sensitive kill switches in `secureFlags.ts`, not regular config.
- Import type-only symbols with `import type`.
- Avoid barrel files and direct feature-to-feature imports.

## Tech stack

| Layer           | Technology           |
| --------------- | -------------------- |
| Runtime         | Electron 42          |
| Language        | TypeScript 6         |
| Package manager | Bun 1.3              |
| Build           | Rsbuild / Rspack     |
| Tests           | Vitest 4, Playwright |
| Packaging       | electron-builder     |

## License

MIT
