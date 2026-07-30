# performance-remediation - Work Plan

## TL;DR (For humans)
**What you'll get:** Trustworthy performance evidence, two targeted repeated-work fixes, a smaller package only when runtime-safe, and a measured basis for multi-account resource decisions. Automated checks will distinguish native startup, document readiness, and authenticated interaction instead of conflating them.

**Why this approach:** Measurement is repaired before any strict gate or optimization, so valid evidence—not static suspicion—decides what changes. Account, authentication, partition, and preload security behavior stay fixed throughout.

**What it will NOT do:** It will not weaken Electron security, change the account backend default, change preconnect from current inconclusive data, or remove a packaged dependency without proof and package smoke evidence.

**Effort:** Large
**Risk:** Medium - lifecycle, packaging, and benchmark changes cross process and release boundaries, mitigated by phased TDD and explicit no-change thresholds.
**Decisions to sanity-check:** CI remains unauthenticated; a separately secured release benchmark owns authenticated first-interaction readiness. BrowserWindow remains the default backend and WebContentsView stays opt-in.

Your next move: execute only in a separate worker session with `$start-work performance-remediation`. Full execution detail follows below.

---

> TL;DR (machine): Large, medium-risk, 10 implementation todos and 4 final verification tasks; producer-first metrics, deterministic lifecycle fixes, runtime-safe package reduction, backend-aware measurement, and threshold-gated follow-ups.

## Scope
### Must have
- A versioned, per-run-complete performance artifact contract for the unauthenticated CI startup path.
- Correct metric names and MB unit handling; explicit final export after the required capture producers finish.
- Regression-tested single BrowserWindow hydration navigation and offline failed-retry recovery without full document reload.
- Machine-checkable packaged runtime dependency closure before any package exclusion.
- Backend-aware renderer/process observability, controlled BrowserWindow/WebContentsView benchmarks, and durable evidence receipts.
- A threshold-gated decision protocol for unread observation, CDP JSON persistence, timer listeners, split chunks, and preconnect.
- CI remains unauthenticated; a credential-isolated release benchmark owns authenticated first interaction.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not hand-edit `src/main/generated/featurePlan.ts`, add runtime feature registration, or change the generated-plan architecture.
- Do not change `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, narrow validated IPC, permission/header handling, `persist:account-N`, URL validation, or the CJS preload contract.
- Do not interrupt Google auth, dehydrate account 0 or a bootstrap account, change BrowserWindow as the default backend, or change WebContentsView hide/throttle/destroy semantics before controlled evidence supports a separately approved policy decision.
- Do not represent `account-0-ready` or `did-finish-load` as first paint or first interaction.
- Do not infer runtime improvements from package bytes, source patterns, analyzer output, or a successful command alone.
- Do not change unread, CDP, timers, split chunks, or preconnect if their decision thresholds are not met; record `NO CHANGE` instead.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD for deterministic behavior and metric-contract changes; deterministic benchmark-contract tests for measurement-only work. Use Vitest, Electron/Playwright, package-scaffold scripts, and direct Bun build/package commands.
- Evidence: `.omo/evidence/performance-remediation/task-<N>-<slug>.{json,md,log}`. Every command records environment, artifact SHA/version, input account/backend state, raw run validity, aggregate median/p95, and exit status.
- A pass requires the exact command, artifact, and asserted outcome. Missing required metric producers are failures. Missing signing/authenticated-release credentials are explicit `[blocked: credentials unavailable]` receipts: they permit a conditional core-remediation verification result but prohibit release-readiness approval or any signed/authenticated success claim.
- CI covers unauthenticated native bootstrap, document-load, renderer producer presence, budget behavior, and package smoke. The secured release benchmark covers authenticated first interaction with redacted logs and isolated credentials.

## Execution strategy
### Parallel execution waves

**Wave 1 - independent foundations:** Todos 1, 3, 4, and 5 can proceed in parallel. They establish metric production, deterministic lifecycle tests/fixes, and package dependency proof without changing resource policy.

**Wave 2 - dependent enforcement and observability:** Todo 2 follows Todo 1; Todo 6 follows Todo 5; Todo 7 follows Todo 1. These three can run in parallel once their individual prerequisites are green.

**Wave 3 - controlled comparison:** Todo 8 runs only after all Wave 2 work and both deterministic lifecycle fixes are complete.

**Wave 4 - evidence-gated decisions:** Todo 9 evaluates each speculative candidate in independent sublanes but changes product code only after the declared threshold passes.

**Wave 5 - repository-wide verification:** Todo 10 and final verification tasks run after all prior evidence and receipts are complete.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 2, 7, 8, 9 | 3, 4, 5 |
| 2 | 1 | 8, 9 | 6, 7 |
| 3 | None | 8 | 1, 4, 5 |
| 4 | None | 8 | 1, 3, 5 |
| 5 | None | 6 | 1, 3, 4 |
| 6 | 5 | 8 | 2, 7 |
| 7 | 1 | 8 | 2, 6 |
| 8 | 2, 3, 4, 6, 7 | 9 | None |
| 9 | 2, 8 | 10 | Independent candidate sublanes only |
| 10 | 9 | F1-F4 | None |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Establish truthful metric production, final export, and per-run completeness
  What to do / Must NOT do: Write red tests first for early export, absent required markers, empty renderer evidence, MB/byte mismatch, missing build duration, and chunk detection. Add a versioned export schema that records metric units, capture completion, per-run validity, and aggregate completeness. Keep MB as the memory unit across monitor, export, budget input, and display. Move development export ownership out of `runDevPostDeferred()` so it occurs exactly once after the unauthenticated default BrowserWindow has emitted the defined document-load completion marker and an immediate renderer sample has completed; a load failure or timeout is invalid, not complete. Change `scripts/headless-startup.js` to collect every run artifact, validate the required schema before aggregation, retain run-level failures, and refuse medians assembled from incomplete data. Pass actual build duration into build history; count emitted `lib/chunks/*.js`, not the stale `*.chunk.js` suffix. Make `ANALYZE=true` emit deterministic machine-readable build stats under the evidence root, or remove the analyzer command claim if Rsbuild cannot produce the promised artifact. Must NOT call either document load or account readiness paint/interaction, change preload output mode, or make IPC latency gated without a real producer and baseline.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 2, 7, 8, 9
  References (executor has NO interview context - be exhaustive): `src/main/utils/account/cacheWarmer.ts:81-123`; `src/main/initializers/registerAppReady.ts`; `src/main/utils/lifecycle/performanceMonitor.ts:221-280,383-390`; `src/main/utils/lifecycle/performanceExport.ts:29-67,108-120`; `src/main/utils/lifecycle/performanceTypes.ts:27-60,100-119`; `scripts/headless-startup.js`; `scripts/build-rsbuild.js:164-239,291-382`; `rsbuild.config.js:148-211`; `scripts/headless-startup.test.js`; `src/main/utils/lifecycle/performanceMonitor.test.ts`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:15-28`.
  Acceptance criteria (agent-executable): New focused tests fail against current early export and aggregation behavior, then pass after the producer contract. A 5-run fresh-profile harness writes five complete child artifacts plus one aggregate with completeness metadata. The harness fails on a fixture with one missing required marker or no renderer sample. `bun run build:prod` writes numeric `buildTimeMs` and a chunk count matching actual `lib/chunks/*.js` files. Production main remains ESM; sandboxed preloads remain CJS and retain `cleanDistPath: false`.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- src/main/utils/lifecycle/performanceMonitor.test.ts scripts/headless-startup.test.js scripts/build-rsbuild.test.js`; `GOGCHAT_PERF_RUNS=5 HEADLESS_TIMEOUT_MS=60000 node scripts/headless-startup.js`; inspect `.omo/evidence/performance-remediation/task-1-valid-run.json`. Failure: run the harness against a fixture/mocked export missing `account-0-content-loaded` or renderer evidence and assert nonzero exit plus an explicit invalid-run receipt in `.omo/evidence/performance-remediation/task-1-invalid-run.json`.
  Commit: Intended atomic commit only if explicitly requested | `perf(metrics): finalize startup evidence contract`

- [ ] 2. Enforce the strict performance budget only after producers are complete
  What to do / Must NOT do: Add fixture-driven tests for `scripts/check-perf-budget.js`, then make required-gated metric absence a `FAIL` with exit 1. Rename `windowFirstPaint` to an accurate native-window-readiness name and retain document-load as a separate metric. Consume the schema/version and unit metadata from Todo 1; reject incompatible baseline/history data and regenerate baseline only through explicit `PERF_UPDATE_BASELINE=1`. Keep IPC latency, memory-operation latency, and any producer without an established baseline warn-only. Must NOT claim authenticated interaction, accept zero renderer samples as measured zero, silently carry old byte-based baselines forward, or make a missing release benchmark pass CI.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 8, 9
  References (executor has NO interview context - be exhaustive): `scripts/check-perf-budget.js:41-164,170-266,353-450`; `scripts/headless-startup.js`; `src/main/utils/lifecycle/performanceTypes.ts:27-60,100-119`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:15-28`; `.omo/ulw-research/20260730-134343/08-review-oracle.md:13-20`.
  Acceptance criteria (agent-executable): Missing gated marker/sample, schema-version mismatch, empty renderer evidence, and MB/byte fixture each exit 1. Missing warn-only data exits 0 with a warning. Complete compatible fixture passes and formats memory in MB exactly once. CI-style harness produces no `SKIP` for a gated metric.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- scripts/check-perf-budget.test.js scripts/headless-startup.test.js`; `node scripts/check-perf-budget.js .omo/evidence/performance-remediation/task-1-valid-run.json` with a passing result saved to `.omo/evidence/performance-remediation/task-2-gate-pass.log`. Failure: `node scripts/check-perf-budget.js tests/fixtures/perf/missing-gated-marker.json` must exit 1 and save `.omo/evidence/performance-remediation/task-2-gate-fail.log`.
  Commit: Intended atomic commit only if explicitly requested | `fix(perf): reject incomplete gated evidence`

- [ ] 3. Make the BrowserWindow factory the sole restored-navigation owner
  What to do / Must NOT do: Add a red hydration test whose factory models the live `windowWrapper` contract by calling `loadURL(url)` on creation. Change BrowserWindow hydration so the factory owns the one restored URL dispatch; retain the snapshot solely for factory input and state restoration. Preserve same partition, bounds, maximized state, existing live-window behavior, account-0 and bootstrap exclusions, activity listeners, cleanup, and existing Google-auth non-interruption behavior. Must NOT modify WebContentsView hydration, remove factory navigation from normal account creation, or add fallback navigation paths.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/main/windowWrapper.ts:42-134`; `src/main/utils/account/accountWindowManager.ts:372-455`; `src/main/utils/account/accountRouter.ts:45-101`; `src/shared/types/window.ts:52-100`; `src/main/utils/account/accountWindowManager.test.ts`; `src/main/utils/account/accountRouter.test.ts`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:30-38`.
  Acceptance criteria (agent-executable): The red test observes two `loadURL` calls before the fix and exactly one after it. Existing tests still prove `persist:account-N`, URL/bounds/maximized restoration, bootstrap exclusion, auth protection, and manager teardown. No assertion or code path changes `AccountViewManager.hydrateAccount()`.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- src/main/utils/account/accountWindowManager.test.ts src/main/utils/account/accountRouter.test.ts`; record one-navigation assertion in `.omo/evidence/performance-remediation/task-3-one-navigation.json`. Failure: temporarily retain the second manager call in the test fixture and assert the navigation-count test fails; record `.omo/evidence/performance-remediation/task-3-duplicate-detected.json`. Run `bun run typecheck`.
  Commit: Intended atomic commit only if explicitly requested | `fix(accounts): avoid duplicate hydration navigation`

- [ ] 4. Retain the offline fallback document through failed recovery checks
  What to do / Must NOT do: Add red preload and static-offline-page tests. Replace failed `window.location.reload()` behavior with a DOM-only completion signal from preload to the offline page so the page re-enables/restores retry state after a false reply. Preserve the existing DOM `app:checkIfOnline` request event, existing narrow `onOnlineStatus` subscription/unsubscribe, current bounded retry policy, and the single `location.replace(urls.appUrl)` transition after the first true reply. Must NOT add Electron APIs to `src/offline`, expose raw `ipcRenderer`, reload the document after a false reply, alter the retry cap semantics, or load feature preloads conditionally as part of this task.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/preload/offline.ts:8-50`; `src/offline/index.ts:1-24`; `src/preload/index.ts:17-89`; `src/shared/types/bridge.ts:8-27`; `src/preload/index.test.ts`; `tests/helpers/electron-test.ts:45-83`; `tests/e2e`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:40-48`; `src/preload/AGENTS.md`; `src/offline/AGENTS.md`.
  Acceptance criteria (agent-executable): At least two false online-status responses produce zero reloads, zero app-URL navigation, an enabled retry control, and one active subscription. The first true response yields exactly one app-URL replacement. Before-unload removes the event listener and unsubscribes. An Electron E2E fixture proves the same observable sequence without a real network dependency.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- src/preload/offline.test.ts src/offline/index.test.ts src/preload/index.test.ts`; `bunx playwright test tests/e2e/offline-recovery.spec.ts`; save `.omo/evidence/performance-remediation/task-4-recovery.json`. Failure: force three false replies and assert zero reload/navigation counters in `.omo/evidence/performance-remediation/task-4-failed-retries.json`. Run `bun run build:prod`.
  Commit: Intended atomic commit only if explicitly requested | `fix(offline): retain fallback after failed checks`

- [ ] 5. Prove packaged runtime dependency closure before changing package selection
  What to do / Must NOT do: Add a machine-checkable closure verifier that derives every external runtime package from emitted main/preload imports and Rsbuild externals, compares that set with the packaged application contents, and writes a deterministic allowlist/diagnostic report. Search all import forms structurally, including dynamic imports and Node/Electron built-ins. Explicitly classify `@rspack`, `@ast-grep`, and `@rslib` as runtime-required, build-only, or unresolved. Must NOT modify `package.json`, `bun.lock`, builder file patterns, or remove a dependency in this task.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 6
  References (executor has NO interview context - be exhaustive): `package.json`; `bun.lock`; `rsbuild.config.js:101-122,125-211`; `scripts/build-rsbuild.js:291-382`; `electron-builder.yml`; `electron-builder.sign.yml`; `src/main`; `src/preload`; `scripts/package-scaffold.test.js`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:50-56`; `.omo/ulw-research/20260730-134343/08-review-oracle.md:13-20`.
  Acceptance criteria (agent-executable): A new verifier and tests identify all externalized runtime packages, fail when a required runtime package is absent from a package fixture, and report whether each targeted compiler package has a runtime consumer. Output includes artifact path, package version, classification reason, and hash. The task does not alter package contents.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- scripts/verify-packaged-dependency-closure.test.js scripts/package-scaffold.test.js`; `bun scripts/verify-packaged-dependency-closure.js --artifact dist/mac-arm64/GogChat.app`; save `.omo/evidence/performance-remediation/task-5-closure.json`. Failure: remove a fixture-required external package and assert verifier failure in `.omo/evidence/performance-remediation/task-5-missing-runtime.json`. Run `bun run build:prod`.
  Commit: Intended atomic commit only if explicitly requested | `test(package): verify runtime dependency closure`

- [ ] 6. Remove only proven build-time package payload and smoke the disposable package
  What to do / Must NOT do: Consume Todo 5's closure report. Change the smallest manifest or electron-builder file-selection rule needed to prevent only proven-unreachable build-tool packages from entering the application artifact; regenerate `bun.lock` with Bun if the manifest changes. Rebuild a disposable unsigned ARM64 package, compare inventories, and run automated packaged smoke. Require a separate signed/notarized release validation when credentials exist; mark it `[blocked]` when absent rather than treating unsigned evidence as release proof. Must NOT hand-edit the lockfile, remove unresolved or runtime-external dependencies, publish, mutate a signed artifact, or claim a startup improvement.
  Parallelization: Wave 2 | Blocked by: 5 | Blocks: 8
  References (executor has NO interview context - be exhaustive): Todo 5 closure report; `electron-builder.yml`; `package.json`; `bun.lock`; `scripts/package-scaffold.test.js`; `scripts/after-pack.cjs`; `scripts/notarize.cjs`; `mac/AGENTS.md`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:50-56`.
  Acceptance criteria (agent-executable): The package inventory excludes only Todo 5-proven build-only namespaces and retains every runtime external. The disposable package launches, creates a window, exercises its unauthenticated document/offline surface, and exits cleanly. Resources, protocol registration, preload loading, updater configuration, and architecture remain valid. Signed/notarized validation either passes with credentials or is recorded blocked with no release-quality claim.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- scripts/verify-packaged-dependency-closure.test.js scripts/package-scaffold.test.js`; `bun run build:prod`; `CSC_IDENTITY_AUTO_DISCOVERY=false bunx electron-builder --mac dir --publish never`; `bunx playwright test tests/e2e/packaged-smoke.spec.ts`; store before/after inventories in `.omo/evidence/performance-remediation/task-6-package-diff.json`. Failure: package a fixture with a required external excluded and assert startup/closure failure in `.omo/evidence/performance-remediation/task-6-required-runtime-rejected.json`.
  Commit: Intended atomic commit only if explicitly requested | `build(package): exclude proven build-only dependencies`

- [ ] 7. Add backend-aware account renderer observability without changing policy
  What to do / Must NOT do: Add a narrow typed account-WebContents enumeration to `IAccountWindowManager`, implemented by both backends. BrowserWindow returns each live account window WebContents; WebContentsView returns every live child view WebContents, not just the host. Update performance sampling to map account and backend to `(webContentsId, pid, ProcessMetric.creationTime)` and discard destroyed/reused identities. Preserve working-set metrics as diagnostics on macOS and replace the misleading `private: 0` meaning with explicit unavailable/source metadata. Must NOT alter session partitions, bootstrap/account-0 exclusions, window/view visibility, throttling, destruction, startup routing, or default backend selection.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/shared/types/window.ts:52-100`; `src/main/utils/account/accountWindowManager.ts`; `src/main/utils/account/accountWindowRegistry.ts:122-143`; `src/main/utils/account/accountViewManager.ts:73-81,234-334,373-396,520-560`; `src/main/utils/lifecycle/performanceMonitor.ts:221-280`; `src/main/utils/lifecycle/performanceTypes.ts:36-60`; `src/main/utils/account/accountWindowManager.test.ts`; `src/main/utils/account/accountViewManager.test.ts`; `src/main/utils/lifecycle/performanceMonitor.test.ts`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:58-64`.
  Acceptance criteria (agent-executable): Both backends enumerate each live account's WebContents. A WCV fixture with two child views maps both children, while host-only sampling is rejected. Destroyed views do not appear. Process identity includes creation time to prevent PID reuse ambiguity. macOS output never represents unavailable private memory as measured zero. Existing sandbox, context isolation, partition, auth, and cleanup tests remain green.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- src/main/utils/account/accountWindowManager.test.ts src/main/utils/account/accountViewManager.test.ts src/main/utils/lifecycle/performanceMonitor.test.ts`; save WCV mapping fixture output to `.omo/evidence/performance-remediation/task-7-wcv-mapping.json`. Failure: simulate a destroyed child view or reused PID and assert it is excluded/re-keyed in `.omo/evidence/performance-remediation/task-7-stale-process-rejected.json`. Run `bun run typecheck`.
  Commit: Intended atomic commit only if explicitly requested | `feat(perf): observe account renderers across backends`

- [ ] 8. Run the controlled BrowserWindow/WebContentsView 1/2/4-account benchmark
  What to do / Must NOT do: Add a benchmark harness and contract tests that run freshly built, isolated profiles for BrowserWindow and opt-in WebContentsView at 1, 2, and 4 accounts. Exercise active, hidden, dehydrated, restored, auth-protected, memory-pressure, and shutdown transitions; persist raw run data and explicit exclusions. Capture per-account process identity, CPU after a baseline sample, working-set diagnostic data, macOS-appropriate process-memory evidence, renderer count, hydration/dehydration latency, switch latency, partition continuity, and cleanup results. CI runs only unauthenticated scenarios. The secured release benchmark separately validates first authenticated interaction using isolated credentials, redacted logs, and no credential output. Must NOT select a backend policy or claim a resource winner from this task alone.
  Parallelization: Wave 3 | Blocked by: 2, 3, 4, 6, 7 | Blocks: 9
  References (executor has NO interview context - be exhaustive): Todos 1-7 receipts; `tests/helpers/electron-test.ts:45-83`; `src/main/utils/account/accountSessionMaintenance.ts`; `src/main/utils/account/accountWindowManager.ts`; `src/main/utils/account/accountViewManager.ts`; `src/main/utils/lifecycle/performanceMonitor.ts`; Electron docs recorded in `.omo/ulw-research/20260730-134343/wave-1-saturation-summary.md:16-20`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:58-64,93-99`.
  Acceptance criteria (agent-executable): Each backend/account-count/state cell has at least five valid runs or is `[blocked]` with raw reason. Samples use isolated user-data paths and identity `(pid, creationTime, accountIndex, backend)`. Auth pages are never redirected/dehydrated incorrectly. Result tables include median, p95, min/max, invalid-run count, and evidence locations. Secured release benchmark success asserts a first-interaction contract without leaking credentials.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- scripts/account-backend-benchmark.test.js`; `bun run build:prod`; `bun scripts/account-backend-benchmark.js --backend browser-window --accounts 1,2,4`; repeat with `--backend web-contents-view`; save matrices in `.omo/evidence/performance-remediation/task-8-<backend>-matrix.json`. Failure: run with a missing child renderer/auth-protection breach fixture and assert the harness invalidates the run and records `.omo/evidence/performance-remediation/task-8-invalid-run.json`.
  Commit: Intended atomic commit only if explicitly requested | `test(perf): add account backend benchmark`

- [ ] 9. Apply threshold-gated candidate decisions or record NO CHANGE
  What to do / Must NOT do: Benchmark unread reconciliation, CDP JSON persistence, fired-timeout callback retention, split-chunk configuration, and preconnect as independent candidate lanes. Pre-register each primary metric, treatment, control, validity rule, and security/account invariant. For any product change, require randomized paired conditions with at least 20 valid pairs, at least 10% median improvement in the declared primary metric, no more than 5% p95 regression, and unchanged correctness/security/account evidence. For unread, require identical unread results; for timers, demonstrated linear retained-listener growth plus at least 5% long-session heap effect; for CDP, p95 sampling work at least 5ms and 10% improvement; for preconnect, use only secured release authenticated first-interaction evidence. Must NOT change a candidate when evidence is missing, noisy, below threshold, contradictory, or unsafe; write a `NO CHANGE` decision receipt instead.
  Parallelization: Wave 4 | Blocked by: 2, 8 | Blocks: 10
  References (executor has NO interview context - be exhaustive): `src/preload/unreadCount.ts:114-199`; `src/main/features/cdpTelemetry.ts:27-127`; `src/main/utils/lifecycle/cdpMetrics.ts:59-117`; `src/main/utils/lifecycle/resourceCleanup.ts:57-137`; `rsbuild.config.js:160-211`; current preconnect implementation; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:66-74,93-99`; `.omo/ulw-research/20260730-134343/08-review-oracle.md:13-20`.
  Acceptance criteria (agent-executable): Every lane emits raw metadata, control/treatment validity, median, p95, invariant checks, decision threshold, and final `CHANGE` or `NO CHANGE`. No source/config diff exists for a `NO CHANGE` lane. Any `CHANGE` lane has red-first behavior coverage and a before/after benchmark receipt.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- src/preload/unreadCount.test.ts src/main/utils/lifecycle/resourceCleanup.test.ts`; `bun scripts/performance-candidate-benchmark.js --candidate unread`; repeat `cdp`, `timers`, `split-chunks`, and `preconnect`; write `.omo/evidence/performance-remediation/task-9-<candidate>.json`. Failure: run an intentionally incomplete/noisy fixture and assert a `NO CHANGE` receipt with no product diff in `.omo/evidence/performance-remediation/task-9-threshold-not-met.json`.
  Commit: Intended atomic commit only if explicitly requested | `perf: apply only threshold-backed improvements`

- [ ] 10. Execute the complete repository, package, runtime, and invariant verification set
  What to do / Must NOT do: Add and test deterministic evidence/claim validators, then run all focused and full checks against the final built state. `scripts/verify-remediation-evidence.js` must validate Todo receipt schema, dependency completion, `[blocked: credentials unavailable]` classification, and the distinction between core-remediation conditional approval and release-readiness approval. `scripts/verify-performance-claims.js` must reject unsupported runtime-savings claims. Inspect the generated feature plan rather than hand-editing it, and compare final package closure/inventory against Todo 5. Treat unrelated pre-existing lint failures as baseline observations unless remediation changes them. Must NOT add cleanup refactors, rewrite baseline history without the explicit migration process, or declare signed-release validation passed without actual credentials and evidence.
  Parallelization: Wave 5 | Blocked by: 9 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): All Todo receipts; `scripts/verify-remediation-evidence.js` (new); `scripts/verify-remediation-evidence.test.js` (new); `scripts/verify-performance-claims.js` (new); `scripts/verify-performance-claims.test.js` (new); `AGENTS.md`; `src/main/AGENTS.md`; `src/main/utils/account/AGENTS.md`; `src/preload/AGENTS.md`; `scripts/AGENTS.md`; `tests/AGENTS.md`; `.omo/ulw-research/20260730-134343/SYNTHESIS.md:82-103`.
  Acceptance criteria (agent-executable): Typecheck, focused tests, full tests, production build, documentation claims, new strict budget fixtures, unauthenticated harness, package closure, package smoke, benchmark schema validation, and all applicable secured-release checks pass or are explicitly blocked with the credential-only status. Validators distinguish conditional core-remediation approval from release-readiness approval. No generated-plan hand edit, no security preference regression, no partition/auth regression, and no claim beyond recorded evidence remains.
  QA scenarios (name the exact tool + invocation): Happy: `bun run test:run -- scripts/verify-remediation-evidence.test.js scripts/verify-performance-claims.test.js`; `bun scripts/verify-remediation-evidence.js --plan .omo/plans/performance-remediation.md --evidence .omo/evidence/performance-remediation`; `bun scripts/verify-performance-claims.js --root .`; `bun run typecheck`; `bun run test:run`; `bun run build:prod`; `bun run check:doc-claims`; `GOGCHAT_PERF_RUNS=5 HEADLESS_TIMEOUT_MS=60000 node scripts/headless-startup.js`; `node scripts/check-perf-budget.js performance-metrics.json`; package and smoke commands from Todo 6; save consolidated receipts under `.omo/evidence/performance-remediation/task-10-final/`. Failure: run validators against missing-metric, package-closure, auth-protection, and missing-credential fixtures; each must emit explicit failure or `[blocked: credentials unavailable]` rather than silent success. Run `bun run lint:all` and record the existing `src/main/config.ts:156` baseline error only if it remains unrelated.
  Commit: Intended atomic commit only if explicitly requested | `test(perf): verify remediation release gates`

## Final verification wave
> Runs in parallel after ALL todos. F1, F2, and F4 must APPROVE. F3 must approve all unauthenticated scenarios and either approve secured-release scenarios or classify each missing-credential scenario as `[blocked: credentials unavailable]`; the latter permits conditional core-remediation completion but forbids release-readiness approval. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  What to do / Must NOT do: Compare every final diff and evidence receipt to Todos 1-10, their must-not-have constraints, and the dependency matrix. Reject undeclared file categories, skipped required acceptance evidence, a source change for a `NO CHANGE` candidate, or any generated-plan/security/account invariant breach.
  References: This plan; `.omo/drafts/performance-remediation.md`; `.omo/evidence/performance-remediation/`; `AGENTS.md`.
  Acceptance criteria: A machine-readable compliance report lists each todo as pass, blocked, or failed with linked receipt; no implicit pass.
  QA scenarios: Happy: `bun scripts/verify-remediation-evidence.js --plan .omo/plans/performance-remediation.md --evidence .omo/evidence/performance-remediation --mode compliance` exits 0 and writes `.omo/evidence/performance-remediation/F1-compliance.json`. Failure: `bun scripts/verify-remediation-evidence.js --plan tests/fixtures/plans/missing-receipt.md --evidence tests/fixtures/evidence/missing-receipt --mode compliance` exits 1 and writes `.omo/evidence/performance-remediation/F1-missing-receipt.json`.
  Commit: No | verification only
- [ ] F2. Code-quality and invariant review
  What to do / Must NOT do: Run an independent code review focused on type safety, unit consistency, lifecycle ownership, deterministic cleanup, package closure, and plan guardrails. Reject `any`/suppression additions, bare main timers, raw IPC exposure, direct shell use, security weakening, or untested behavior changes.
  References: Changed paths; `AGENTS.md`; nested account/lifecycle/preload/scripts guides; Todo 10 receipts.
  Acceptance criteria: Review verdict has no unresolved high-severity finding and separately identifies any pre-existing baseline issue.
  QA scenarios: Happy: invoke `skill(name="review-work", user_message="Review only the completed performance-remediation changes against .omo/plans/performance-remediation.md and write the verdict to .omo/evidence/performance-remediation/F2-review.md")`; the result must have no unresolved high-severity finding. Failure: `bun scripts/verify-performance-claims.js --root tests/fixtures/overclaim --expect-reject` exits 1 and records `.omo/evidence/performance-remediation/F2-policy-detection.json`.
  Commit: No | verification only
- [ ] F3. Agent-executed runtime and package QA
  What to do / Must NOT do: Drive unauthenticated Electron startup, offline recovery, BrowserWindow hydration, package smoke, and both account-backend benchmark contracts through their real surfaces. Run secured authenticated first-interaction only in the approved release environment; otherwise record `[blocked]`. Do not substitute sleep-only or title-only checks for observable readiness contracts.
  References: Todos 3, 4, 6, 8; `tests/helpers/electron-test.ts`; release-benchmark configuration created by Todo 8.
  Acceptance criteria: Every unauthenticated scenario produces an artifact-linked observable assertion. The secured release script returns `APPROVED` with authenticated evidence or `[blocked: credentials unavailable]`; the latter is conditional core-remediation approval only, never release-readiness approval.
  QA scenarios: Happy: `bunx playwright test tests/e2e/offline-recovery.spec.ts tests/e2e/packaged-smoke.spec.ts`; `bun scripts/account-backend-benchmark.js --verify-contract`; `bun scripts/release-auth-readiness-benchmark.js --record-blocked --evidence .omo/evidence/performance-remediation/F3-runtime/`; store all artifacts under `.omo/evidence/performance-remediation/F3-runtime/`. Failure: `bunx playwright test tests/e2e/offline-recovery.spec.ts --grep "negative replies"` against the duplicate-navigation/reload fixture and `bun scripts/verify-packaged-dependency-closure.js --fixture tests/fixtures/package/missing-runtime` must exit nonzero with classified artifacts.
  Commit: No | verification only
- [ ] F4. Scope-fidelity and claim-calibration review
  What to do / Must NOT do: Review final code, comments, documentation, benchmark output, and commit messages for unsupported performance claims. Ensure delivery-size facts are not presented as startup gains, static candidates remain measure-first unless thresholds passed, preconnect remains unchanged absent secured readiness evidence, and WCV instrumentation did not become a backend-policy change.
  References: `.omo/ulw-research/20260730-134343/SYNTHESIS.md`; `.omo/ulw-research/20260730-134343/08-review-oracle.md`; Todo 9 decision receipts.
  Acceptance criteria: A scope review says every implemented change maps to one todo and every stated benefit has a linked measurement or is worded as a bounded source/artifact fact.
  QA scenarios: Happy: `bun scripts/verify-performance-claims.js --root . --evidence .omo/evidence/performance-remediation` exits 0 and writes `.omo/evidence/performance-remediation/F4-scope.md`. Failure: `bun scripts/verify-performance-claims.js --root tests/fixtures/overclaim --expect-reject` exits 1 and writes `.omo/evidence/performance-remediation/F4-overclaim.json`.
  Commit: No | verification only

## Commit strategy

No commit is created merely by executing this plan; commits require the user's separate explicit instruction. If requested, preserve these atomic boundaries in dependency order and pair tests with their implementation:

1. `perf(metrics): finalize complete startup evidence contract` - Todo 1 tests and producers.
2. `fix(perf): reject incomplete gated evidence` - Todo 2 gate tests and script.
3. `fix(accounts): avoid duplicate hydration navigation` - Todo 3 implementation/test.
4. `fix(offline): retain fallback after failed checks` - Todo 4 implementation/tests.
5. `test(package): verify packaged runtime dependency closure` - Todo 5 verifier/tests.
6. `build(package): exclude proven build-only dependencies` - Todo 6 package selection, regenerated lockfile if needed, and smoke test.
7. `feat(perf): observe account renderers across backends` - Todo 7 shared interface/backends/sampler/tests.
8. `test(perf): add controlled account backend benchmark` - Todo 8 harness/contracts.
9. `perf: apply threshold-backed candidate improvements` - only a Todo 9 `CHANGE` lane with behavior test and benchmark receipt; never commit a `NO CHANGE` receipt as product code.
10. `test(perf): verify remediation release gates` - Todo 10 tests/harness validation only if it is an independently reviewable change.

Never combine package pruning with closure proof, deterministic fixes with benchmark policy, or evidence-only receipts with behavior changes.

## Success criteria

- Every unauthenticated CI artifact is complete, versioned, unit-correct, and valid per run before aggregation.
- Missing gated data fails; warn-only data remains explicit but non-blocking; old incompatible baselines are not compared silently.
- BrowserWindow hydration dispatches exactly one restored URL navigation without compromising account state, partitions, bootstrap, or auth behavior.
- Failed offline recovery checks do not reload the document; a positive reply performs exactly one app navigation with all bridge cleanup intact.
- Packaged build-tool payload is removed only after closure proof and disposable package smoke; signed/notarized validation passes or is explicitly blocked.
- Both account backends expose measurable child/account process identity before any resource-policy conclusion.
- The benchmark matrix covers every planned account/backend state or marks it blocked with raw evidence.
- Measure-first candidate changes meet the declared 20-pair/10%-median/5%-p95/invariant threshold, or result in a documented `NO CHANGE`.
- CI has no authenticated Google credentials; the secured release benchmark owns authenticated first interaction.
- F1, F2, and F4 approve; F3 approves all unauthenticated scenarios and either approves secured release evidence or records credential-only `[blocked]` status. Credential-only blocks prohibit release-readiness approval but do not misclassify otherwise verified core remediation as failed.
- No source, documentation, or commit claim exceeds the attached evidence.
