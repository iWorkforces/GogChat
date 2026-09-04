# Repository Context

## Scope and Method

FACT: This dossier reconciles five read-only perspectives: architecture and dependency boundaries, product and runtime behavior, quality, security, and performance, build and delivery, and developer and real-project use. It is based on current repository evidence and distinguishes confirmed source behavior from interpretation and missing runtime proof.

FACT: The repository contains 397 tracked files. Top-level tracked-file counts are `.github` 2, `.mnemonics` 3, `docs` 8, `mac` 1, `resources` 28, `scripts` 60, `src` 249, `tests` 17, and other root or configuration files 29. Repository inventory and build metadata are covered by C01, C15 through C19, and C21.

FACT: `package.json` is the current package and toolchain source of truth: version `3.20.6`, package manager `bun@1.4.0`, Electron `^44.0.0`, Node `>=24.16.0 <25.0.0`, and Bun `>=1.3.0` (`package.json`).

INFERENCE: The codebase is intentionally structured around explicit boundaries. Main-process orchestration, feature registration, account management, platform integration, IPC, preload, shared contracts, offline behavior, test tiers, and release scripts are separated rather than concentrated in a single application entry point.

UNRESOLVED: This dossier does not establish behavior that requires authenticated Google Chat access, a live operating-system permission prompt, a signed packaged build on Intel macOS, or native Windows runtime execution.

## Repository Map

FACT: The application source is primarily under `src/`, with main-process code in `src/main/`, preload code in `src/preload/`, shared contracts in `src/shared/`, and a DOM-only offline surface in `src/offline/` (C02 through C13).

FACT: The Electron entry point is `src/main/index.ts`. It handles startup wiring and delegates ready-state initialization and shutdown to dedicated initializers (`src/main/index.ts`, `src/main/initializers/registerAppReady.ts`, `src/main/initializers/registerShutdown.ts`).

FACT: Feature declarations are separated into `src/main/initializers/security.spec.ts`, `critical.spec.ts`, `ui.spec.ts`, and `deferred.spec.ts`. The generated plan is `src/main/generated/featurePlan.ts`, which must not be edited by hand (`src/main/initializers/*.spec.ts`, `src/main/generated/featurePlan.ts`).

FACT: Multi-account behavior is concentrated under `src/main/utils/account/`. The public manager contract is `IAccountWindowManager` in `src/shared/types/window.ts`, and the repository graph identifies 36 callers of that contract (`src/shared/types/window.ts`, `IAccountWindowManager`).

FACT: IPC helpers are under `src/main/utils/ipc/`, shared IPC constants, types, and validators are under `src/shared/`, and the renderer-facing bridge is under `src/preload/` (`src/main/utils/ipc/defineIPC.ts`, `src/shared/`, `src/preload/index.ts`).

FACT: Platform features, notifications, permission handling, lifecycle code, security utilities, configuration, and performance measurement are organized under `src/main/utils/{platform,security,lifecycle,config}/` and feature modules under `src/main/features/` (C03, C06, C08 through C10).

FACT: Tests are grouped into unit-oriented Vitest coverage and Playwright projects for e2e, integration, performance, and preload-artifact behavior (`tests/`, `playwright.config.ts`, C14).

FACT: Build, package, verification, performance, and release helpers live under `scripts/`; GitHub workflow definitions live under `.github/`; platform package material is represented by the repository root configuration and the docs-only `mac/` directory (C15 through C17).

FACT: `resources/` contains packaged resource material and tracked icons. Generated tracked plan and icon assets should be assessed through their source and generation provenance rather than treated as independent handwritten source truth (C18, C21).

## Architecture and Key Flows

FACT: `src/main/index.ts` sets the pre-ready V8 heap configuration, marks application start, enforces single-instance behavior, registers deep-link handling, and delegates ready-state and shutdown work (`src/main/index.ts`).

FACT: `registerAppReady()` runs global cleanup registration and security features, starts critical features alongside encrypted configuration initialization, optionally preconnects, creates account 0, sets shared feature context, arms performance finalization and load markers, runs UI features, then schedules deferred features (`src/main/initializers/registerAppReady.ts`, `registerAppReady`).

FACT: `registerShutdownHandler()` runs ordered bounded cleanup and calls `app.exit()` once. Shutdown allows 2 seconds per stage and 8 seconds overall (`src/main/initializers/registerShutdown.ts`, `registerShutdownHandler`).

FACT: Feature planning starts with declarative specs. `scripts/featurePlanPlugin.js` and `scripts/featureSpecParser.js` parse the specs, reject unsupported syntax and forward-phase dependencies, and only write a generated plan after complete generation (`scripts/featurePlanPlugin.js`, `scripts/featureSpecParser.js`).

FACT: Runtime feature execution belongs to `src/main/utils/lifecycle/featureRunner.ts`. This preserves the distinction between static planning and execution (`src/main/utils/lifecycle/featureRunner.ts`, `runFeaturePhase`).

FACT: The default account backend is `accountWindowManager.ts`, which manages BrowserWindow instances. `accountViewManager.ts` provides an opt-in WebContentsView backend behind `app.useWebContentsView` (`src/main/utils/account/accountWindowManager.ts`, `src/main/utils/account/accountViewManager.ts`).

FACT: Account navigation targets each account's WebContents rather than the WebContentsView host. The navigation helpers are in `src/main/utils/account/accountNavigation.ts` (`loadAccountURL`, `getAccountURL`, `sendToAccount`).

FACT: BrowserWindow hydration leaves snapshot URL loading to the window factory. The account manager may route a requested URL after hydration, subject to Google authentication safety (`src/main/utils/account/accountWindowManager.ts`, `src/main/utils/account/accountRouter.ts`, `applyRequestedUrlAfterHydrate`).

FACT: The WebContentsView backend uses `visible`, `hidden-live`, and `dehydrated-parked` account states. Account 0 receives special protection, and sparse account indexes are preserved rather than assumed to form a dense sequence (`src/main/utils/account/accountViewManager.ts`, `src/main/utils/account/accountWindowManager.ts`).

FACT: Account partitions use `persist:account-N`. Persistence writes are serialized by `accountWindowsStore.ts`, and account hooks backfill and dispose through `accountWebContentsHooks.ts` (`src/main/utils/account/accountWindowsStore.ts`, `src/main/utils/account/accountWebContentsHooks.ts`).

FACT: `defineIPC()` expresses an IPC handler shape that combines rate limiting, validation, optional safe deduplication, handler execution, and error capture (`src/main/utils/ipc/defineIPC.ts`, `defineIPC`).

FACT: The preload remains a narrow sandboxed CJS bridge. The application uses a CJS preload build with `cleanDistPath: false`, while the main process is emitted as ESM (`src/preload/index.ts`, `rsbuild.preload.config.ts`, `rsbuild.config.ts`).

FACT: Offline behavior is DOM-only. A failed retry or timeout restores the offline UI without reload, while a successful retry performs one preload-owned replacement (`src/offline/`, `src/preload/`).

## Product and Runtime Behavior

FACT: The application is an Electron desktop wrapper around Google Chat with multi-account isolation and account-aware navigation. The account manager contract is shared across BrowserWindow and WebContentsView implementations (`src/shared/types/window.ts`, `IAccountWindowManager`; `src/main/utils/account/`).

FACT: Account navigation preserves Google authentication safety. Account-specific URL loading goes through account WebContents and should not use host-window navigation as a substitute (`src/main/utils/account/accountNavigation.ts`, `loadAccountURL`).

FACT: Native notification identity is derived from the sender and account rather than supplied by an arbitrary renderer payload. Notification clicks focus the relevant account (`src/main/utils/platform/accountNotificationIdentity.ts`, `src/main/utils/platform/notificationFocus.ts`, `src/main/features/handleNotification.ts`).

FACT: Permission acquisition is shared between the two account-window backends. Both `src/main/windowWrapper.ts` and `src/main/utils/account/accountViewManager.ts` install `installPermissionHandlers()` from the shared permission module (`src/main/utils/security/permissionHandler.ts`, `installPermissionHandlers`).

FACT: `src/main/utils/security/permissionHandler.ts` owns shared permission handlers. `src/main/utils/security/mediaAccess.ts` owns macOS TCC access and per-media in-flight deduplication (`installPermissionHandlers`, `checkAndRequestMediaAccess`).

FACT: Current Electron 44 declarations describe permission request details with `requestingUrl: string` and media details with `securityOrigin?: string`. Those declarations are contract evidence, not proof that malformed native metadata cannot occur at runtime.

FACT: The shared permission-handler code accepts `unknown` in `readOriginDetails()` and uses an unchecked cast. Identity handling can call `.trim()` on unchecked values, media handling treats `details.mediaTypes` as a string array before array operations, the request handler starts an async IIFE without a terminal catch, and the synchronous check path can throw on malformed boundary data (`src/main/utils/security/permissionHandler.ts`, `readOriginDetails`, `installPermissionRequestHandler`, `installPermissionCheckHandler`).

INFERENCE: The permission-handler observations identify a boundary-hardening opportunity. They do not establish exploitability, user impact, or an Electron runtime path that supplies malformed metadata.

FACT: Main-process defaults include context isolation, sandboxing, `webSecurity: true`, and `nodeIntegration: false`. URL validation is centralized, external opening goes through a shell wrapper, and Chromium remains the TLS trust authority with no custom `certificate-error` handler (`src/main/utils/security/`, `src/shared/urlValidators.ts`, `src/main/utils/platform/shellWrapper.ts`).

FACT: Main-process timers and listeners are expected to use tracked resources rather than unbounded ad hoc process resources (`src/main/utils/lifecycle/`, `src/main/utils/security/`).

## Quality, Security, and Performance

FACT: The coverage floors are statements 94%, branches 92%, functions 94%, and lines 94% (`vitest.config.ts`, `coverage.thresholds`).

FACT: The test model includes source-unit tests, Playwright e2e tests, integration tests, performance tests, preload-artifact tests, workflow tests, package verification, and headless performance checks (`tests/`, `playwright.config.ts`, `scripts/`, C14 through C16).

FACT: Source-unit evidence proves behavior against source modules. Built-CJS evidence proves that emitted preload artifacts execute. Packaged-presence evidence proves required package contents. Packaged-runtime evidence proves a packaged application runs on a real architecture. Headless-performance evidence measures unauthenticated startup behavior. Workflow evidence proves CI and release graph behavior. These classes are separate and one cannot replace another.

FACT: `performanceFinalizer.ts` owns final performance export. It waits for deferred completion, account-0 content load or a terminal capture condition, and a renderer sample (`src/main/utils/lifecycle/performanceFinalizer.ts`).

FACT: Account readiness and document load are not first paint or first interaction. Headless CI runs unauthenticated, so it does not prove authenticated interaction performance (`src/main/utils/lifecycle/performanceFinalizer.ts`, `scripts/headless-startup.js`).

FACT: Memory measurements use MB and time measurements use ms across the performance contract (`src/main/utils/lifecycle/performanceTypes.ts`, `src/main/utils/lifecycle/performanceMonitor.ts`).

FACT: Package byte reductions do not prove runtime savings. Runtime performance claims require matching runtime evidence rather than package-size evidence alone (`scripts/verify-packaged-dependency-closure.js`, `scripts/verify-performance-claims.js`).

FACT: Both account backends have strong unit-suite coverage. Some integration, e2e, and performance checks are shallow or environment-dependent, so their absence of failure should not be treated as complete runtime proof (`src/main/windowWrapper.test.ts`, `src/main/utils/account/accountViewManager.test.ts`, `tests/`).

UNRESOLVED: Authenticated Google Chat flows, live notification permission behavior, signed macOS Intel packaged runtime, native Windows x64 packaged runtime, and native Windows arm64 packaged runtime lack confirmed evidence in this analysis.

## Build, Test, Packaging, and Release

FACT: The repository uses Bun commands, including `bun run typecheck`, `bun run lint:all`, `bun run check:doc-claims`, `bun run test:coverage`, and `bun run build:prod` (`package.json`, `scripts`).

FACT: The dual Rsbuild pipeline produces an ESM main-process build and a CJS preload build, and it copies offline resources into the build output (`rsbuild.config.ts`, `rsbuild.preload.config.ts`, `src/preload/index.ts`, `src/offline/`).

FACT: Current Electron 44 package metadata shows no npm `postinstall`. A frozen Bun install alone therefore does not prove that a ready Electron binary exists or that a cross-architecture Electron binary is usable.

FACT: macOS packaging produces separate arm64 and x64 DMGs. The architecture names are distinct package outputs, not a universal binary claim (`electron-builder.yml`, `scripts/package-mac-arch.sh`, `scripts/verify-macos-package-artifacts.js`).

FACT: Windows packaging is guarded preparation. The repository contains Windows package commands and verification policy, but this does not establish public Windows support or packaged runtime proof on x64 or arm64 (`package.json`, `electron-builder.windows.yml`, `scripts/verify-windows-package-artifacts.js`).

FACT: Release qualification checks exact source identity before build matrices. Artifact aggregation precedes the sole tag-writing step and publication (`.github/workflows/`, `scripts/release-workflow.test.js`).

FACT: Package presence checks and artifact checks do not prove packaged runtime behavior. A DMG or installer can contain expected files without proving that the installed application launches and functions on its target architecture (`scripts/verify-macos-package-artifacts.js`, release verification scripts under `scripts/`).

INFERENCE: The release pipeline is designed to prevent release publication from an unqualified source revision and to separate per-platform artifact construction from final publication.

UNRESOLVED: The evidence does not prove a signed Intel macOS runtime, a native Windows x64 runtime, or a native Windows arm64 runtime.

## Developer Experience and Real-Project Use

FACT: The codebase provides identifiable implementation seams. Feature work belongs in feature modules and declarative initializer specs. Runtime execution belongs in the lifecycle runner. Account behavior belongs behind `IAccountWindowManager`, and IPC behavior belongs behind shared channels, validators, and `defineIPC()` (`src/main/features/`, `src/main/initializers/*.spec.ts`, `src/main/utils/lifecycle/featureRunner.ts`, `src/shared/types/window.ts`, `src/main/utils/ipc/defineIPC.ts`).

FACT: Configuration has a shared type and schema path rather than only main-process ad hoc values (`src/shared/types/config.ts`, `src/main/utils/config/configSchema.ts`, `src/main/config.ts`).

FACT: The shared layer carries IPC channel names, bridge types, URL validation, configuration contracts, and account manager types. This reduces duplication between preload, main, and account implementations (`src/shared/`, `src/preload/index.ts`, `src/main/utils/ipc/`).

FACT: The offline surface stays separate from privileged Electron APIs. Its retry behavior is coordinated with preload ownership rather than direct DOM-to-main access (`src/offline/`, `src/preload/`).

FACT: Root and nested `AGENTS.md` guidance still names version 3.20.0 and Electron 43.x, while `README.md` names Bun 1.3.14 and Electron 42. `package.json` is the current source of truth for version and toolchain declarations (`AGENTS.md`, nested `AGENTS.md` files, `README.md`, `package.json`).

FACT: `playwright.config.ts` still describes the preload-artifact project as empty even though a preload-artifact test exists (`playwright.config.ts`, `tests/preload-artifact/preload.spec.ts`).

INFERENCE: The project gives developers clear implementation boundaries, but documentation drift can mislead a contributor who treats guidance or the README as current dependency truth.

UNRESOLVED: The evidence does not show whether documentation checks reject every stale version reference, only that `bun run check:doc-claims` exists and some drift remains.

## Constraints, Risks, and Opportunities

FACT: Feature registration is build-time generated. Contributors should change declarative feature specs rather than editing `src/main/generated/featurePlan.ts` (`src/main/initializers/*.spec.ts`, `scripts/featurePlanPlugin.js`, `src/main/generated/featurePlan.ts`).

FACT: Multi-account changes must preserve `persist:account-N`, sparse account semantics, account-0 protections, create and destroy hooks, BrowserWindow hydration ownership, and auth-safe WebContents navigation (`src/main/utils/account/`, `src/shared/types/window.ts`).

FACT: Security changes must preserve sandboxing, context isolation, disabled Node integration, shared URL validation, shell-wrapper external opening, and Chromium-managed TLS trust (`src/main/utils/security/`, `src/shared/urlValidators.ts`, `src/main/utils/platform/shellWrapper.ts`).

FACT: Performance changes must keep memory in MB, time in ms, and final export ownership in `performanceFinalizer.ts`. They must not relabel account readiness or document load as paint or interaction (`src/main/utils/lifecycle/performanceTypes.ts`, `src/main/utils/lifecycle/performanceFinalizer.ts`).

FACT: Release and package changes must keep macOS arm64 and x64 artifacts separate and must not claim Windows support or Intel packaged runtime evidence that is not present (`electron-builder.yml`, `scripts/`, `.github/workflows/`).

INFERENCE: The shared permission-handler boundary is a focused candidate for a coding task because it has a defined owner, known installers, adjacent media-access ownership, and observable malformed-input assumptions. The supplied evidence does not support an exploit claim.

INFERENCE: Documentation alignment is a separate maintenance opportunity because the current package metadata, agent guidance, README, and Playwright comment do not agree. It should remain separate from a security-boundary change unless a task explicitly joins them.

UNRESOLVED: A challenge based on permission handling needs source-level regression tests that define expected behavior for malformed boundary metadata without assuming undocumented Electron runtime behavior.

UNRESOLVED: A challenge based on runtime packaging or notification permission behavior requires suitable macOS and Windows environments, signing conditions where applicable, and live operating-system evidence.

## Coverage Ledger

FACT: C01, root metadata and build configuration. `package.json` is source of truth for version `3.20.6`, package manager `bun@1.4.0`, Electron `^44.0.0`, Node `>=24.16.0 <25.0.0`, Bun `>=1.3.0`, and commands. Root build and test configurations are the source for the dual Rsbuild layout, CJS preload setting, and coverage floors.

FACT: C02, main entry, window, and config entry. `src/main/index.ts`, `src/main/windowWrapper.ts`, account window creation code, and `src/main/config.ts` establish the startup handoff, window boundary, and configuration entry points.

FACT: C03, features. `src/main/features/` contains product feature implementations, including notification-related feature handling.

FACT: C04, initializers and feature specs. `src/main/initializers/registerAppReady.ts`, `registerShutdown.ts`, and the phase spec files establish startup, bounded shutdown, and declarative feature registration.

FACT: C05, account utilities. `src/main/utils/account/` contains both account backends, navigation, WebContents hooks, and serialized account persistence.

FACT: C06, configuration. `src/shared/types/config.ts`, `src/main/utils/config/configSchema.ts`, and `src/main/config.ts` provide the shared type, schema, and main-process configuration surface.

FACT: C07, IPC. `src/main/utils/ipc/defineIPC.ts` and shared IPC contracts establish rate limiting, validation, optional safe deduplication, handler execution, and error handling shape.

FACT: C08, lifecycle and performance. `src/main/utils/lifecycle/featureRunner.ts`, `performanceFinalizer.ts`, `performanceTypes.ts`, and related monitor code establish feature execution and performance semantics.

FACT: C09, platform. `src/main/utils/platform/` covers native notification identity, notification focusing, and controlled external URL opening.

FACT: C10, security. `src/main/utils/security/permissionHandler.ts` owns shared permission handlers, `mediaAccess.ts` owns TCC and media deduplication, and adjacent security modules establish platform defaults and tracked resources.

FACT: C11, preload. `src/preload/` is the narrow sandboxed CJS renderer bridge and owns the successful offline replacement path.

FACT: C12, shared types and contracts. `src/shared/` provides account manager types, IPC names, bridge types, URL validators, and configuration contracts used across process boundaries.

FACT: C13, offline. `src/offline/` is DOM-only and restores UI after retry failure or timeout without page reload.

FACT: C14, test tiers. `tests/`, adjacent `*.test.ts` files, and `playwright.config.ts` cover unit, e2e, integration, performance, and preload-artifact tiers. Both account backends have strong unit coverage, while some higher-tier checks are shallow or environment-dependent.

FACT: C15, scripts. `scripts/` contains build, package, artifact verification, headless startup, performance budget, workflow, and release helpers.

FACT: C16, workflows. `.github/workflows/` is source of truth for CI and release sequencing, including qualification, build matrices, aggregation, tag ownership, and publication flow.

FACT: C17, packaging and macOS material. Root package configuration and `scripts/` define separate macOS arm64 and x64 DMGs. `mac/` is documentation-oriented repository material, not independent package-runtime proof.

FACT: C18, resources. `resources/` contains tracked package resources and icon material. It supports packaged-presence review but does not prove a packaged application executes.

FACT: C19, documentation, README, BUILD material, and plans. `docs/`, `README.md`, and related guidance explain intended behavior, but version and toolchain claims drift from `package.json` and are not current metadata source of truth.

FACT: C20, guidance and tool metadata. Root and nested `AGENTS.md` files describe repository conventions and constraints, but their 3.20.0 and Electron 43.x references are stale relative to `package.json`.

FACT: C21, tracked generated plan and icons. `src/main/generated/featurePlan.ts` and tracked icon outputs are reviewed through generation provenance. They are not manually edited source truth.

FACT: C22, vendor dependencies. `node_modules` and similar installed dependency material are vendor and lockfile-derived. Electron package metadata can inform installation assumptions, but installed vendor content does not replace source, lockfile, or runtime evidence.

FACT: C23, derived build and test outputs. `lib`, `dist`, `coverage`, `test-results`, and build history are derived artifacts. They can support built-CJS, packaged-presence, or test evidence when generated and inspected, but are not canonical handwritten source truth.

FACT: C24, caches and local state. `.git`, `.codegraph`, `.cocoindex`, `.omo`, `.venv`, `tsconfig.tsbuildinfo`, and `.DS_Store` are local, cache, repository-control, or tool-state material. They are not product source truth.

## Proposed Coding Challenge

### Proposal 1: Harden the Permission Boundary

#### Coding Prompt

Implement fail-closed parsing for native permission details in `src/main/utils/security/permissionHandler.ts`. Treat origin fields and `mediaTypes` as `unknown` before any string or array operation. Keep the first-present identity rule: blank or absent fields may fall through, but a malformed or untrusted first-present value must deny without rescue by a later trusted `securityOrigin`, and `embeddingOrigin` must never grant trust.

Deny malformed media data before any TCC request, dialog, persistence write, or raw-detail log. Keep `src/main/utils/security/mediaAccess.ts` as the sole owner of TCC checks and per-media in-flight deduplication. Do not add global mutable parser state or duplicate parsing in either account backend.

Make each request callback settle once for allow, denial, parser failure, and rejected asynchronous checks, with no unhandled promises. Have the synchronous check handler return `false` rather than throw. Add focused malformed-boundary tests beside the existing suite, and retain shared installation from both `src/main/windowWrapper.ts` and `src/main/utils/account/accountViewManager.ts`.

#### How I Would Use This Codebase

I would keep this work at the shared security boundary, use existing permission and media-access suites to define behavior, and treat both account backends only as installation consumers. That keeps parsing, TCC ownership, and backend neutrality in their current modules while adding focused failure coverage.

#### Why This Is Challenging

The handler connects an untyped native boundary to synchronous trust checks, asynchronous macOS TCC work, callback completion, and two account backends. A small parser change can alter origin precedence, trigger side effects before denial, break in-flight deduplication, or leave a callback unresolved. The tests need to isolate each part of that contract.

#### Evaluation Rubric

1. **Origin parsing and trust precedence.** Tests must show that valid trusted origins still pass, blank or absent fields follow the current fallback order, malformed or untrusted first-present values deny without rescue, and `embeddingOrigin` never grants trust. The implementation must parse boundary values without unchecked `.trim()` calls or equivalent string assumptions.

2. **Media parsing and side-effect isolation.** Primitive, object, and non-string-array `mediaTypes` inputs must deny before TCC, dialogs, persistence, or raw-detail logging, while valid media requests keep current behavior. `mediaAccess.ts` must remain the sole owner of TCC checks and per-media in-flight deduplication.

3. **Deterministic completion and concurrency.** Request callbacks must run exactly once for allow, deny, parser failure, and rejected asynchronous checks, and no unhandled rejection may remain. The check handler must return `false` instead of throwing. Concurrent valid requests must keep existing deduplication without introducing global mutable parser state.

4. **Shared ownership and verification.** Keep one parser and handler implementation shared by BrowserWindow and WebContentsView, without flipping backends or changing account partitions, navigation, notification authorization, or TLS handling. Pass `bun run test:run -- src/main/utils/security/permissionHandler.malformed.test.ts src/main/utils/security/permissionHandler.test.ts src/main/windowWrapper.test.ts src/main/utils/account/accountViewManager.test.ts`, then `bun run typecheck`, `bun run lint:all`, `bun run check:doc-claims`, `bun run test:coverage`, and `bun run build:prod`, with coverage at statements 94%, branches 92%, functions 94%, and lines 94%; treat the build as bundling proof only and do not infer exploitability or packaged-runtime coverage.
