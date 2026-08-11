# stability-performance-remediation - Work Plan

## TL;DR (For humans)
**What you'll get:** A production-safe preload, reliable multi-account activity and throttling, bounded shutdown and update checks, trustworthy performance evidence, complete automated test discovery, and a release pipeline that verifies the exact source and all artifacts before creating a tag.

**Why this approach:** Runtime test surfaces are established before fixes, and passing source tests are never substituted for executing built or packaged artifacts. Performance work remains measure-first, while irreversible release actions move behind every qualification gate.

**What it will NOT do:** It will not replace the default account backend, overwrite the existing package-manifest change, add speculative dependencies or protocols, weaken quality thresholds, claim Windows readiness, or make an unmeasured CDP optimization.

**Effort:** XL
**Risk:** High - the work crosses sandboxed preload execution, account lifecycle, process shutdown, performance gates, CI, packaging, and irreversible release-tag ordering.
**Decisions to sanity-check:** Explicit preload installers instead of package metadata changes; 2-second stage and 8-second total shutdown bounds; 6-second online and 10-second update deadlines; release tags created only after aggregate verification; CDP concludes with measured no-change evidence.

Your next move: after the plan review passes, start execution in a separate worker session. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk remediation delivering built-preload integrity, account and shutdown liveness, coherent performance evidence, complete recurring gates, measured CDP no-change, and verify-before-tag release safety.

## Scope
### Must have
- Remediate every approved current defect: production preload reachability, BrowserWindow activity wiring, bounded shutdown, WCV throttling, online IPC liveness, manual update liveness/stable selection, and renderer-count aggregation.
- Harden every approved release/build/coverage risk: fail-closed feature parsing, direct app-ready characterization, complete Playwright discovery, deterministic lint/coverage gates, and release qualification before tag creation.
- Keep CDP persistence measurement-only. Produce real 1/100/1000-record evidence and a machine-readable `NO CHANGE`; product CDP files require a separate approved plan.
- Use RED-before-GREEN TDD for production code and config-with-logic. Characterization tests must pass against unchanged behavior before refactoring.
- Distinguish source-unit, built-CJS execution, packaged-presence, packaged-runtime, headless-performance, and release-workflow evidence. One evidence class cannot substitute for another.
- Protect the pre-existing/concurrent `package.json` modification byte-for-byte and keep it out of staging and commits.
- Preserve BrowserWindow as the default account backend, account-0 notification reliability, strict IPC/preload security, generated feature-plan ownership, and dual-arch release artifact policy.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not edit, format, reset, stage, or overwrite `package.json`; do not add package scripts or dependencies.
- Do not hand-edit `src/main/generated/featurePlan.ts`, add runtime feature registration, or silently accept unsupported feature-spec syntax.
- Do not flip `app.useWebContentsView`, change `persist:account-N`, interrupt auth pages, or sample only the WCV host WebContents.
- Do not expose raw `ipcRenderer`, add a new public IPC schema, weaken URL validation, change sandbox/CJS preload rules, or reintroduce certificate pinning.
- Do not edit `src/main/features/cdpTelemetry.ts` or `src/main/utils/lifecycle/cdpMetrics.ts` in this plan.
- Do not lower coverage thresholds, delete/weaken tests, broaden lint cleanup beyond the frozen manifest, or call a flaky timing pass a product fix.
- Do not create, move, delete, or publish a release tag during local QA. Workflow simulations must use disposable local bare remotes.
- Do not claim Windows support/readiness, a backend winner, startup savings, or CDP improvement without the repository's required evidence.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD with Vitest for source/script contracts and Playwright/Electron for integration, production-preload, and performance surfaces. Workflow logic also uses disposable-git fixtures; CDP uses an Electron child benchmark against the built current implementation.
- RED proof: each behavioral todo first runs its named focused command and records the expected failing assertion in `<attemptDir>/task-<N>-red.log` before production/config implementation.
- GREEN proof: rerun the identical focused command and record a passing result in `<attemptDir>/task-<N>-green.log`.
- Surface proof: run the exact Electron, Playwright, headless, package, or disposable-git command named by the todo and store machine-readable output in `<attemptDir>/task-<N>-surface.{json,log}`.
- Evidence root: `<attemptDir>` is `currentAttemptDir` from `omo-agent-toolkit ulw-loop status --json`; outside ulw-loop use `.omo/evidence/stability-performance-remediation/`.
- Teardown: every Electron child, Playwright app, timer, listener, observer, abort controller, temporary user-data directory, temporary package directory, and bare Git remote is closed/removed in `finally`; evidence records the teardown receipt.
- Full gates after relevant waves: `bun run typecheck`, `bun run lint:all`, `bun run test:coverage`, `bun run build:prod`, `bunx madge --circular --extensions ts src/`, all four Playwright projects, five-run headless capture, and budget check.
- Existing commands only: headless capture is `GOGCHAT_PERF_RUNS=5 HEADLESS_TIMEOUT_MS=90000 node scripts/headless-startup.js`; budget gate is `node scripts/check-perf-budget.js performance-metrics.json`.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

- **Wave 0 - Safeguards and frozen baseline:** Todos 1-3 run serially. They create no product commit and establish dirty-worktree, diagnostic, evidence, and file-ownership contracts.
- **Wave 1 - Test surfaces before fixes:** Todos 4-6 may run in parallel after Wave 0. Playwright discovery is established before any Electron RED test; startup characterization and deterministic timing debt remain isolated.
- **Wave 2 - Independent TDD remediation:** Todos 7-13 may run in parallel after their named Wave 1 prerequisites because production ownership is disjoint. No two tasks may edit the same file.
- **Wave 3 - Dependent protocol/package work:** Todos 14-16 run after their functional owners. Online IPC serializes behind preload because both own `src/preload/offline.ts`; package proof consumes the built preload; residual debt waits for all file owners.
- **Wave 4 - Coverage and recurring CI:** Todos 17-19 run serially. Reinclude exact seams, make full coverage green without threshold changes, then activate recurring lint and Playwright CI.
- **Wave 5 - Measurement-only CDP:** Todos 20-22 run serially after recurring gates are green. This wave must end with measured `NO CHANGE` and no product CDP diff.
- **Wave 6 - Release safety:** Todos 23-25 run serially after every functional, quality, package, and measurement gate. Qualification and aggregate verification must precede the only write-capable tag job.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | - | 2-25 | - |
| 2 | 1 | 3-25 | - |
| 3 | 2 | 4-25 | - |
| 4 | 3 | 7, 9, 14, 15, 19 | 5, 6 |
| 5 | 3 | 17 | 4, 6 |
| 6 | 3 | 16, 18 | 4, 5 |
| 7 | 4 | 14, 15, 17 | 8-13 |
| 8 | 3 | 16, 17 | 7, 9-13 |
| 9 | 4 | 16, 17 | 7, 8, 10-13 |
| 10 | 3 | 16, 17 | 7-9, 11-13 |
| 11 | 3 | 16 | 7-10, 12, 13 |
| 12 | 3 | 17, 19 | 7-11, 13 |
| 13 | 3 | 16, 17 | 7-12 |
| 14 | 7, 4 | 16, 17, 19 | 15 |
| 15 | 7, 4 | 19, 23 | 14 |
| 16 | 6, 8-14 | 17-19 | - |
| 17 | 5, 7-14, 16 | 18 | - |
| 18 | 6, 17 | 19-25 | - |
| 19 | 4, 12, 14, 15, 18 | 20-25 | - |
| 20 | 19 | 21 | - |
| 21 | 20 | 22 | - |
| 22 | 21 | 23-25 | - |
| 23 | 15, 18, 19, 22 | 24 | - |
| 24 | 23 | 25 | - |
| 25 | 24 | F1-F4 | - |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Lock the dirty worktree and concurrent package manifest
  - What to do: record `GIT_MASTER=1 git status --short --untracked-files=all`, `shasum -a 256 package.json`, and `GIT_MASTER=1 git diff --cached -- package.json`; store the hash and path status in `<attemptDir>/task-1-worktree.json`. Recheck before and after every tooling/workflow todo.
  - Must NOT do: do not reset, restore, stash, format, stage, or edit `package.json`. If its hash changes, stop the active task, record drift, reread the user-owned file, and refresh only the guard baseline after confirming no agent write caused it.
  - Parallelization: Wave 0 | Blocked by: none | Blocks: 2-25.
  - References: `package.json:1-99`; root `AGENTS.md` dirty-worktree and git safety rules.
  - Acceptance criteria: baseline JSON contains the SHA-256, unstaged/staged status, and `git diff --cached -- package.json` is empty; every later task evidence repeats the same hash or an explicit external-drift stop receipt.
  - QA scenarios: happy - Bash commands above produce a stable hash; failure - compare against a deliberately wrong expected hash in a read-only shell condition and assert nonzero without changing the file. Evidence: `<attemptDir>/task-1-{worktree,teardown}.{json,log}`.
  - Recommended task executor category: `git` - repository-state and staging safety only.
  - Commit: N - evidence-only safeguard.

- [ ] 2. Freeze baseline diagnostics by exact path and assertion
  - What to do: run the current full gates and write `<attemptDir>/task-2-baseline.json` mapping every failure to command, test id/rule, path, and owner candidate. Include the known load-sensitive profiler timeout, wall-clock performance assertion, coverage deficit, lint findings, and Playwright discovery counts; do not classify them as product regressions.
  - Must NOT do: do not fix anything, update snapshots/baselines, or accept a command summary without the complete captured log.
  - Parallelization: Wave 0 | Blocked by: 1 | Blocks: 3-25.
  - References: `package.json:14-54`; `vitest.config.ts:3-68`; `playwright.config.ts:3-12`; `.github/workflows/pr-check.yml:39-69`.
  - Acceptance criteria: execute `bun run typecheck`, `bun run lint:all`, `bun run test:run`, `bun run test:coverage`, `bun run build:prod`, `bunx playwright test --list`, and `bunx madge --circular --extensions ts src/`; JSON records exit code and exact failures for each.
  - QA scenarios: happy - all outputs are captured even when commands fail; failure - omit one required command in a temporary copy of the manifest and make the manifest validator return nonzero. Evidence: `<attemptDir>/task-2-{baseline,commands}.{json,log}`.
  - Recommended task executor category: `unspecified-high` - broad read-only baseline collection and classification.
  - Commit: N - evidence-only baseline.

- [ ] 3. Freeze shared-file ownership and evidence validation
  - What to do: create `<attemptDir>/task-3-ownership.json` assigning exclusive owners exactly as follows: `package.json` none; `playwright.config.ts` Todo 4; preload modules Todo 7 then `offline.ts` Todo 14; account router/window Todo 8; WCV Todo 13; `vitest.config.ts` Todo 17; PR workflow Todo 19; release workflow Todos 23-25 serially; generated feature plan generator-only. Validate it with an inline `bun -e` assertion so no repository file is added.
  - Must NOT do: do not add product documentation or create overlapping write ownership; `src/main/generated/featurePlan.ts` can only change as build output and is never authored/staged manually.
  - Parallelization: Wave 0 | Blocked by: 2 | Blocks: 4-25.
  - References: `.omo/drafts/stability-performance-remediation.md` Components/Decisions; `src/preload/AGENTS.md`; `src/main/utils/account/AGENTS.md`; `scripts/AGENTS.md:46-60`; `tests/AGENTS.md:18-53`.
  - Acceptance criteria: ownership validator rejects duplicate parallel owners, any `package.json` owner, and a generated-file author; accepts the dependency matrix above.
  - QA scenarios: happy - current matrix validates; failure - inject duplicate ownership in a temporary JSON fixture and assert rejection. Evidence: `<attemptDir>/task-3-{ownership,validation}.json`.
  - Recommended task executor category: `quick` - mechanical execution-safety contract.
  - Commit: N - evidence-only ownership contract.

- [ ] 4. Establish complete Playwright project discovery before runtime RED tests
  - What to do: change `playwright.config.ts` to use `testDir: './tests'` and explicit projects named `e2e`, `integration`, `performance`, and `preload-artifact`, with non-overlapping `testMatch` patterns for existing directories and `tests/artifact/preload/**/*.test.ts`. Add `scripts/playwright-config.test.js` to load the exported config, enumerate normalized matches, and reject duplicate project ownership. Preserve one worker, 60-second per-test timeout, no retries, list reporter, and headless mode unless a project needs a longer explicit timeout.
  - Must NOT do: do not edit `package.json`, duplicate a test across projects, run artifact tests under generic integration, or add skipped/placeholder tests to inflate discovery.
  - Parallelization: Wave 1 | Blocked by: 3 | Blocks: 7, 9, 14, 15, 19.
  - References: `playwright.config.ts:1-13`; `tests/AGENTS.md:18-31`; `tests/e2e/user-workflows.test.ts`; `tests/integration/*.test.ts`; `tests/performance/performance-regression.test.ts`.
  - Acceptance criteria: `bunx playwright test --list` lists every tracked Playwright test exactly once; `--project=e2e`, `integration`, and `performance` each list only their own directory; `preload-artifact` may list zero until Todo 7 but must resolve as a valid project.
  - QA scenarios: happy - capture all four list outputs; failure - a Vitest contract imports the config and rejects overlapping normalized test paths or an unknown project. Evidence: `<attemptDir>/task-4-{red,green,discovery}.log`.
  - Recommended task executor category: `quick` - single-config deterministic test topology.
  - Commit: Y | `test(e2e): expose all Playwright test projects`.

- [ ] 5. Characterize the app-ready orchestration seam
  - What to do: add `src/main/initializers/registerAppReady.test.ts` before changing coverage. Mock phase/store/account/finalizer boundaries and characterize security plus global cleanup, critical plus config initialization, preconnect, account-0 creation, account WebContents load hooks, UI phase, and `setImmediate` deferred scheduling.
  - Must NOT do: do not modify `registerAppReady.ts`, call document load first paint/interaction, or assert implementation-private incidental log text.
  - Parallelization: Wave 1 | Blocked by: 3 | Blocks: 17.
  - References: `src/main/initializers/registerAppReady.ts:64-240`; `src/main/AGENTS.md` startup order; `src/main/utils/lifecycle/performanceFinalizer.ts`; `src/main/utils/account/cacheWarmer.ts`.
  - Acceptance criteria: characterization is GREEN against unchanged production code; assertions prove preconnect precedes account-0, account WebContents (not WCV host) owns load markers, UI precedes detached deferred scheduling, and deferred failure does not relabel readiness semantics.
  - QA scenarios: happy - `bun run test:run -- src/main/initializers/registerAppReady.test.ts`; failure - inject rejected required security phase and assert account creation/UI/deferred do not proceed. Evidence: `<attemptDir>/task-5-{characterization,failure}.log`.
  - Recommended task executor category: `unspecified-high` - central multi-boundary orchestration characterization.
  - Commit: Y | `test(startup): characterize app-ready ordering`.

- [ ] 6. Make the frozen timing tests deterministic without weakening behavior
  - What to do: update only the baseline-listed timing tests. In `configProfiler.test.ts`, replace the million-iteration wall-time case with 100,000 deterministic mocked reads, exact call-count/statistics assertions, and a mocked monotonic clock. In `performanceMonitor.test.ts`, replace the `<10ms` real-clock assertion with a mocked clock sequence and exact elapsed value. Add no production fast path.
  - Must NOT do: do not raise global timeouts, remove iteration/call-count assertions, loosen inequalities, or touch non-manifest test debt.
  - Parallelization: Wave 1 | Blocked by: 3 | Blocks: 16, 18.
  - References: `src/main/utils/lifecycle/configProfiler.ts:54-67`; `src/main/utils/lifecycle/configProfiler.test.ts`; `src/main/utils/lifecycle/performanceMonitor.test.ts`; baseline evidence from Todo 2.
  - Acceptance criteria: each focused file passes five consecutive isolated runs and once inside `bun run test:run`; exact call count and elapsed calculations remain asserted.
  - QA scenarios: happy - loop focused tests five times using Bash and then full suite; failure - provide a clock sequence with negative/incorrect elapsed and assert the test detects it. Evidence: `<attemptDir>/task-6-{red,green,repeat}.log`.
  - Recommended task executor category: `quick` - tests-only deterministic clock repair.
  - Commit: Y | `test(perf): remove wall-clock timing flakiness`.

- [ ] 7. Replace preload side effects with explicit installers and execute the built CJS entry
  - What to do: RED-first update `src/preload/index.test.ts` and add `tests/artifact/preload/preload-entry.test.ts` plus a disposable Electron fixture. Export and explicitly call installers from `disableWebAuthn.ts`, `faviconChanged.ts`, `offline.ts`, `passkeyMonitor.ts`, `searchShortcut.ts`, `unreadCount.ts`, and `notificationBridge.ts`. Call WebAuthn disabling first, expose `window.gogchat` second, then install all remaining features in the current order. Preserve every unload cleanup and CJS `.js` import path.
  - Must NOT do: do not edit `package.json`, rely on bare side-effect imports, import `overrideNotifications.ts`, expose raw IPC, use string-grep as the sole artifact assertion, or treat separate emitted files as entry reachability.
  - Parallelization: Wave 2 | Blocked by: 4 | Blocks: 14, 15, 17.
  - References: `package.json:13`; `src/preload/index.ts:7-90`; `src/preload/disableWebAuthn.ts:15-27`; `src/preload/offline.ts:17-64`; `src/preload/notificationBridge.ts:66-88`; `src/preload/AGENTS.md:7-50`; `scripts/build-rsbuild.js:331-400`; `accountWebPreferences.ts:47-59`.
  - Acceptance criteria: source test asserts exact installer call order; after `bun run build:prod`, Playwright launches an Electron fixture that loads the actual `lib/preload/index.js` and proves WebAuthn is disabled before page script observation, bridge methods exist, favicon/unread DOM changes send expected IPC, search focuses the fixture input, offline false/true paths terminate correctly, passkey/notification forwarding is observable, and unload removes resources.
  - QA scenarios: RED - `bun run build:prod && bunx playwright test --project=preload-artifact` fails because current bundle omits feature behavior; GREEN - same command passes after explicit installers. Failure fixture omits one installer and must fail its observable assertion. Teardown closes Electron and removes userData. Evidence: `<attemptDir>/task-7-{red,green,surface,teardown}.{log,json}`.
  - Recommended task executor category: `deep` - critical cross-process build/runtime correction.
  - Commit: Y | `fix(preload): retain production feature installers`.

- [ ] 8. Route new BrowserWindows through manager-owned registration exactly once
  - What to do: RED-first extend `accountRouter.test.ts` and `accountWindowManager.test.ts`. Add a required new-window registration callback to `routeAccountWindow`; invoke it only in the factory-created branch. The manager callback must register the window, attach activity/dehydration/throttle listeners, and emit one WebContents-created notification. Remove unconditional post-route notification. On callback failure, detach/unregister partial state, destroy the new window, and rethrow.
  - Must NOT do: do not call the callback for existing or hydrated windows, double-register, duplicate listeners/hooks/navigation, change partitions, or alter backend selection.
  - Parallelization: Wave 2 | Blocked by: 3 | Blocks: 16, 17.
  - References: `src/main/utils/account/accountRouter.ts:45-101`; `accountWindowManager.ts:160-255,407-428,528-566`; `accountWebPreferences.ts:47-59`; `accountWebContentsHooks.ts`; account guide hydration/throttling rules.
  - Acceptance criteria: public creation of account 1 starts throttled, focus unthrottles, blur re-throttles and schedules dehydration, focus/show cancels it, each event records activity once; existing route and hydration do not increase listener/hook counts; callback failure leaves no live window, registry entry, hook, listener, or timer.
  - QA scenarios: RED/GREEN `bun run test:run -- src/main/utils/account/accountRouter.test.ts src/main/utils/account/accountWindowManager.test.ts`; Electron integration `bunx playwright test --project=integration tests/integration/multi-account.test.ts`. Teardown destroys manager and temp userData. Evidence: `<attemptDir>/task-8-{red,green,surface,rollback}.log`.
  - Recommended task executor category: `deep` - default-backend lifecycle and rollback semantics.
  - Commit: Y | `fix(accounts): register new windows through the manager`.

- [ ] 9. Bound shutdown stages and prove process exit
  - What to do: RED-first add pending-promise, late-rejection, duplicate-quit, and process-exit cases. Implement an injectable deadline-signal factory whose production implementation uses `AbortSignal.timeout`: 2,000 ms per stage and an independent 8,000 ms overall ceiling. Timeout abandons but does not cancel a stage; observe late rejection, log stage identity, continue later stages in order, and guard `app.exit()` exactly once.
  - Must NOT do: do not add bare `setTimeout`, use timers tracked by cleanup machinery that can clear its own watchdog, change normal cleanup order, or claim cancellation support absent from cleanup contracts.
  - Parallelization: Wave 2 | Blocked by: 4 | Blocks: 16, 17.
  - References: `src/main/initializers/registerShutdown.ts:19-60`; `registerShutdown.test.ts`; `featureRunner.ts:77-91`; `resourceCleanup.ts:184-230`; lifecycle cleanup contract.
  - Acceptance criteria: fake-timer unit tests prove each timed-out stage yields to later stages and exit once; late rejection creates no unhandled rejection; a built Electron child with a never-settling cleanup exits by 8,000 ms plus fixed harness slack.
  - QA scenarios: RED/GREEN `bun run test:run -- src/main/initializers/registerShutdown.test.ts`; surface `bun run build:prod && bunx playwright test --project=integration -g "bounded shutdown"`. Teardown force-kills only after the assertion timeout and records PID cleanup. Evidence: `<attemptDir>/task-9-{red,green,process,teardown}.log`.
  - Recommended task executor category: `deep` - asynchronous liveness with process-level proof.
  - Commit: Y | `fix(lifecycle): bound graceful shutdown`.

- [ ] 10. Bound manual update checks and select only valid stable releases
  - What to do: RED-first add a pure parser from `unknown`, require valid tag and HTTPS release URL plus `draft === false` and `prerelease === false`, select the first valid stable API entry, and use `AbortSignal.timeout(10_000)`. Timeout, malformed payload, empty/no-stable list, HTTP failure, dismissal, and normal completion must all release `manualGate`; leave background notifier unchanged. Add `tests/integration/manual-update.test.ts`; from `electronApp.evaluate`, replace main-process `globalThis.fetch` with a deferred/local fixture, import the built update feature, invoke the manual path, and inspect the real update window lifecycle without public network access.
  - Must NOT do: do not cast untrusted JSON, offer drafts/prereleases, open an unvalidated URL, change automatic update policy, or add a dependency.
  - Parallelization: Wave 2 | Blocked by: 3 | Blocks: 16, 17.
  - References: `src/main/features/appUpdates.ts:24-30,84-103,118-235`; `appUpdates.test.ts`; `updateWindow.ts`; shared URL validators/shell wrapper rules.
  - Acceptance criteria: fake-timer tests prove hung fetch aborts at 10 seconds, terminal UI settles, and a second manual check starts; malformed/draft/prerelease-only fixtures never open a URL; stable fixture opens only the validated stable `html_url`.
  - QA scenarios: RED/GREEN `bun run test:run -- src/main/features/appUpdates.test.ts src/main/utils/platform/updateWindow.test.ts`; surface `bun run build:prod && bunx playwright test --project=integration tests/integration/manual-update.test.ts`, with fetch restoration/app close/userData removal in `finally`. Evidence: `<attemptDir>/task-10-{red,green,surface,teardown}.log`.
  - Recommended task executor category: `unspecified-high` - network boundary parsing and native-dialog liveness.
  - Commit: Y | `fix(updates): bound stable release checks`.

- [ ] 11. Make feature specification parsing fail closed
  - What to do: RED-first extend `featurePlanPlugin.test.js`, then replace the hand-scanner entry/metadata extraction with the already-installed TypeScript compiler API. Require every exported array element to be an object literal; reject spreads, calls, identifiers, conditionals, holes, computed names, and malformed known metadata with file, element index, and property. Allow static identifier/string keys, operational `init`/`cleanup`, same-phase dependencies, and earlier-phase dependencies. Reject forward-phase dependencies under `security < critical < ui < deferred`. Build all output before writing.
  - Must NOT do: do not evaluate arbitrary expressions, change runtime registration, inspect implementation bodies, hand-edit generated output, or partially write on error.
  - Parallelization: Wave 2 | Blocked by: 3 | Blocks: 16.
  - References: `scripts/featureSpecParser.js:10-244`; `featurePlanPlugin.js:45-69,146-216`; `featurePlanPlugin.test.js`; `src/main/initializers/{security,ui,deferred}.spec.ts`; scripts guide.
  - Acceptance criteria: fixtures cover spread/call/identifier/conditional/hole/computed/malformed metadata and forward dependency failures; current specs produce byte-identical source with `write:false`; error leaves an existing output fixture unchanged; duplicates/unknowns/cycles still fail.
  - QA scenarios: RED/GREEN `bun run test:run -- scripts/featurePlanPlugin.test.js`; surface `bun run build:prod && bun run check:doc-claims`, then verify generated file equals generator output and was not manually authored. Evidence: `<attemptDir>/task-11-{red,green,build,no-write}.log`.
  - Recommended task executor category: `deep` - build-time grammar and dependency validation.
  - Commit: Y | `fix(build): reject unsupported feature specifications`.

- [ ] 12. Select coherent upper-median renderer evidence
  - What to do: RED-first update `headless-startup.test.js`. For complete valid runs in original order, count unique renderer identity by `(pid, creationTime)` when creationTime exists, otherwise PID; stable-sort by count then original index; choose `floor(validRunCount / 2)` (upper median for even counts); copy that run's complete `rendererSnapshots`. Incomplete runs never provide representative snapshots and still make aggregate completeness fail.
  - Must NOT do: do not synthesize unrelated snapshot fields, use the last run, accept incomplete evidence, change MB/ms units, or reinterpret document load as interaction.
  - Parallelization: Wave 2 | Blocked by: 3 | Blocks: 17, 19.
  - References: `scripts/headless-startup.js:290-371`; `scripts/check-perf-budget.js:95-105,232-237`; `performanceTypes.ts:70-105`; performance script invariants.
  - Acceptance criteria: tests cover `[4,4,4,4,1] -> 4`, even-count upper median, deterministic tie, PID reuse, missing creationTime fallback, and incomplete-run exclusion; budget gate reads a coherent representative and cannot false-pass from a final low-count run.
  - QA scenarios: RED/GREEN `bun run test:run -- scripts/headless-startup.test.js scripts/check-perf-budget.test.js`; surface five-run headless command followed by budget check. Evidence: `<attemptDir>/task-12-{red,green,headless,budget}.{log,json}`.
  - Recommended task executor category: `unspecified-high` - performance evidence contract and adversarial fixtures.
  - Commit: Y | `fix(perf): aggregate representative renderer evidence`.

- [ ] 13. Centralize WCV resource-state and throttling transitions
  - What to do: RED-first add a `0 -> 1 -> 2 -> 0` matrix plus create/park/hydrate/unregister/fallback cases. Route all transitions through one private helper that updates visibility/resourceState and reapplies: account 0 unthrottled; visible secondary unthrottled; hidden-live and dehydrated-parked secondary throttled.
  - Must NOT do: do not mark hidden-live as dehydrated, park account 0/bootstrap, leave the host without a visible fallback, alter default backend, or conflate host and child WebContents.
  - Parallelization: Wave 2 | Blocked by: 3 | Blocks: 16, 17.
  - References: `src/main/utils/account/accountViewManager.ts:90-135,317-374,605-675`; `accountViewManager.test.ts`; account guide three-state and throttling invariants.
  - Acceptance criteria: every transition matrix cell asserts state, visibility, and exact `setBackgroundThrottling` value; switching away from account 1/2 sets true; returning sets false; account 0 always false; frontmost parking promotes account 0.
  - QA scenarios: RED/GREEN `bun run test:run -- src/main/utils/account/accountViewManager.test.ts`; surface `bunx playwright test --project=integration tests/integration/multi-account.test.ts` with explicit `app.useWebContentsView=true`, followed by a default BrowserWindow smoke. Evidence: `<attemptDir>/task-13-{red,green,wcv,bw-default}.log`.
  - Recommended task executor category: `unspecified-high` - opt-in backend state-machine correction.
  - Commit: Y | `fix(accounts): align WCV throttling with visibility`.

- [ ] 14. Isolate online checks per sender and guarantee terminal offline UI
  - What to do: after Todo 7, RED-first extend rate limiter, IPC pipeline, online feature, preload/offline, static offline, and integration tests. Scope limiter keys by `event.sender.id` in both canonical `defineIPC` and legacy helper paths. Remove `deduplicate: true` from online checks. Preserve channels/payloads. Arm one 6,000 ms preload deadline per request; clear it on response/unload and dispatch the existing failure DOM event exactly once on timeout.
  - Must NOT do: do not add correlation IDs/new channels/persisted state, globally relax rate limits, reload on false/timeout, or leave a timer/listener after unload.
  - Parallelization: Wave 3 | Blocked by: 7, 4 | Blocks: 16, 17, 19.
  - References: `rateLimiter.ts:14-72`; `defineIPC.ts:130-279`; `ipcHelper.ts`; `inOnline.ts:99-130`; `src/preload/offline.ts:17-64`; `src/offline/index.ts:13-38`; IPC and preload guides.
  - Acceptance criteria: same sender is limited; two sender IDs are independently admitted, produce exactly two isolated network probes, and each receives true/false; dropped response triggers one failure at 6 seconds; true navigates once; false/timeout never reload; unload cancels deadline and subscription.
  - QA scenarios: RED/GREEN `bun run test:run -- src/main/utils/ipc/rateLimiter.test.ts src/main/utils/ipc/defineIPC.test.ts src/main/features/inOnline.test.ts src/preload/offline.test.ts src/offline/index.test.ts`; surface `bunx playwright test --project=integration tests/integration/ipc-communication.test.ts`. Evidence: `<attemptDir>/task-14-{red,green,two-sender,timeout,teardown}.log`.
  - Recommended task executor category: `deep` - cross-process multi-account liveness and shared pipeline behavior.
  - Commit: Y | `fix(ipc): isolate online checks by sender`.

- [ ] 15. Verify packaged preload presence separately from built behavior
  - What to do: RED-first add `scripts/verify-packaged-preload.js` and `scripts/verify-packaged-preload.test.js`. The verifier inspects disposable packaged output and proves `lib/preload/index.js` plus every CommonJS chunk required by that entry is included. Consume Todo 7's built-CJS execution result; do not repeat or replace it. Run both macOS package commands; when credentials are absent, require the repository's unsigned path and label trust readiness separately.
  - Must NOT do: do not claim presence proves execution, prune dependencies, modify package arch policy, list universal/amd64, or treat unsigned output as signed release evidence.
  - Parallelization: Wave 3 | Blocked by: 7, 4 | Blocks: 19, 23.
  - References: `scripts/verify-packaged-dependency-closure.js`; its tests; `scripts/package-mac-arch.sh`; `verify-macos-package-artifacts.js`; `electron-builder.yml`; scripts packaging guide.
  - Acceptance criteria: missing preload/chunk fixture fails; built preload execution receipt is linked; disposable mac arm64 package contains the configured entry and closure verifier passes; x64 package presence/artifact naming is checked without claiming runtime smoke.
  - QA scenarios: RED/GREEN `bun run test:run -- scripts/verify-packaged-preload.test.js scripts/verify-packaged-dependency-closure.test.js`; surface `bun run package:mac:arm64`, `bun run package:mac:x64`, `bun run package:mac:artifacts`, `bun scripts/verify-packaged-preload.js --dist dist`, and `bun scripts/verify-packaged-dependency-closure.js`. Teardown removes only task-created disposable outputs, never pre-existing user artifacts. Evidence: `<attemptDir>/task-15-{red,green,closure,arm64,x64,teardown}.log`.
  - Recommended task executor category: `unspecified-high` - packaging contract and artifact-class separation.
  - Commit: Y | `test(package): verify production preload inclusion`.

- [ ] 16. Resolve only residual frozen diagnostics after file owners finish
  - What to do: compare Todo 2's manifest to completed owners 6 and 8-14. Assign findings inside their changed files back to those owners. Fix only remaining manifest-listed lint/type/test findings in one path-scoped residual change; preserve runtime behavior and exact tests.
  - Must NOT do: do not run broad auto-fix over unrelated files, alter thresholds, clean adjacent code, or touch `package.json`.
  - Parallelization: Wave 3 | Blocked by: 6, 8-14 | Blocks: 17-19.
  - References: `<attemptDir>/task-2-baseline.json`; ESLint/Prettier configs; exact paths listed by the manifest.
  - Acceptance criteria: every original diagnostic is either closed by its functional owner or this task; no new path outside the frozen manifest changes; `bun run lint:all`, `bun run typecheck`, and full unit suite pass.
  - QA scenarios: happy - compare pre/post diagnostic sets by path/rule; failure - validator rejects any changed source path absent from ownership or manifest. Evidence: `<attemptDir>/task-16-{red,green,scope-diff}.json`.
  - Recommended task executor category: `quick` - bounded deterministic residual cleanup.
  - Commit: Y | `chore(quality): close frozen diagnostic debt`.

- [ ] 17. Reinclude remediated orchestration and preload seams in coverage
  - What to do: change only `vitest.config.ts` after direct tests exist. Remove exclusions for `src/preload/**`, `registerAppReady.ts`, `inOnline.ts`, `appUpdates.ts`, and `defineIPC.ts`; keep unchanged CDP product files and genuine type/entry-only exclusions. Preserve thresholds 94 statements, 92 branches, 94 functions, 94 lines.
  - Must NOT do: do not lower thresholds, add blanket exclusions, count Playwright as Vitest coverage, or reinclude files without executable source tests.
  - Parallelization: Wave 4 | Blocked by: 5, 7-14, 16 | Blocks: 18.
  - References: `vitest.config.ts:16-68`; tests created/updated in Todos 5, 7, 10, 14; tests guide coverage rules.
  - Acceptance criteria: `bun run test:coverage` instruments each named seam; coverage JSON contains them with nonzero statements/functions; existing thresholds are unchanged in config.
  - QA scenarios: RED - coverage before removal shows named paths absent; GREEN - after config change paths appear and suite reports exact remaining branches. Failure - config contract test rejects threshold/exclusion regression. Evidence: `<attemptDir>/task-17-{red,green,coverage-paths}.json`.
  - Recommended task executor category: `quick` - focused coverage configuration change.
  - Commit: Y | `test(coverage): include remediated runtime seams`.

- [ ] 18. Close branch coverage gaps without production or threshold changes
  - What to do: add only missing happy/failure tests identified by Todo 17 until `bun run test:coverage` passes 94/92/94/94. Prioritize installer cleanup/error branches, startup required/optional phase failures, update malformed/timeout branches, and IPC limited/sender branches.
  - Must NOT do: do not edit production solely for coverage, exclude new lines, add vacuous assertions, use snapshots of logs as behavior proof, or change thresholds.
  - Parallelization: Wave 4 | Blocked by: 6, 17 | Blocks: 19-25.
  - References: Todo 17 coverage JSON; `vitest.config.ts:63-68`; colocated tests for exact under-covered files.
  - Acceptance criteria: full coverage exits 0 at unchanged thresholds; every added test asserts externally observable return/callback/state/IPC behavior; focused tests pass before the full run.
  - QA scenarios: happy - `bun run test:coverage`; failure - mutate a temporary fixture/mocked branch so each new assertion demonstrates it can fail. Evidence: `<attemptDir>/task-18-{coverage,mutation-check}.log`.
  - Recommended task executor category: `unspecified-high` - multi-module branch-gap closure without scope expansion.
  - Commit: Y | `test(coverage): close stability branch gaps`.

- [ ] 19. Activate complete recurring PR gates only after suites are green
  - What to do: RED-first add `scripts/pr-workflow.test.js`, then update `.github/workflows/pr-check.yml`. Order: frozen install and Electron binary; typecheck; doc claims; lint; unit coverage; circular deps; production build; Playwright `e2e`, `integration`, `performance`, `preload-artifact`; five-run headless capture; budget gate; always-upload metrics/log evidence. Use literal existing commands, not package aliases.
  - Must NOT do: do not add authenticated Google credentials, duplicate unit execution without purpose, omit artifact upload on failure, change performance units/schema, or edit `package.json`.
  - Parallelization: Wave 4 | Blocked by: 4, 12, 14, 15, 18 | Blocks: 20-25.
  - References: `.github/workflows/pr-check.yml:13-80`; `package.json:14-54`; Playwright projects from Todo 4; tests/scripts guides.
  - Acceptance criteria: workflow tests prove every gate and dependency/order; local command sequence passes; `bunx playwright test --list` proves no omitted/duplicated project test; headless/budget command names are exact.
  - QA scenarios: RED/GREEN workflow contract test; surface run all commands locally, with `GOGCHAT_PERF_RUNS=5 HEADLESS_TIMEOUT_MS=90000 node scripts/headless-startup.js` then `node scripts/check-perf-budget.js performance-metrics.json`. Evidence: `<attemptDir>/task-19-{red,green,workflow,full-gates}.log`.
  - Recommended task executor category: `unspecified-high` - CI orchestration across qualified suites.
  - Commit: Y | `ci: enforce stability and runtime test gates`.

- [ ] 20. Build a fail-closed CDP persistence measurement harness
  - What to do: RED-first add a script/test harness under `scripts/` that builds first, launches an Electron child, points `app.userData` to a unique temp directory, imports the built current `recordMetrics` entry, pre-seeds valid 1/100/1000-record files, resets before each sample, measures one append/rewrite, and writes raw machine-readable samples. Reject sample count below 20, missing sizes, invalid JSON, order/cap failure, or receipt-only `NO CHANGE`.
  - Must NOT do: do not edit CDP product files, invent a treatment, use Date-only aggregate without raw samples, access user real data, or add a dependency.
  - Parallelization: Wave 5 | Blocked by: 19 | Blocks: 21.
  - References: `src/main/utils/lifecycle/cdpMetrics.ts:33-145`; `cdpTelemetry.ts:99-116`; `scripts/performance-candidate-benchmark.js`; performance candidate tests and evidence rules.
  - Acceptance criteria: harness test fails on zero/19 samples, missing size, malformed final JSON, FIFO/order/cap violation, and child leak; passes a deterministic fixture with >=20 raw samples per size and environment metadata.
  - QA scenarios: RED/GREEN `bun run test:run -- scripts/cdp-persistence-benchmark.test.js`; surface dry run against disposable Electron child. Evidence: `<attemptDir>/task-20-{red,green,dry-run,teardown}.{log,json}`.
  - Recommended task executor category: `unspecified-high` - new empirical harness around an existing product surface.
  - Commit: Y | `test(perf): add CDP persistence measurement harness`.

- [ ] 21. Measure current CDP persistence at 1, 100, and 1000 records
  - What to do: run Todo 20's harness with 20 independent samples per size on an otherwise idle machine. Record OS/arch/Electron/Node/Bun, per-sample duration and event-loop delay, p50/p95, file bytes, final record count, JSON validity, FIFO ordering, and cap behavior. Repeat once if any cell is incomplete; never merge incomplete cells.
  - Must NOT do: do not modify source/config, discard slow valid samples, compare unlike environments, or manufacture a control/treatment pair.
  - Parallelization: Wave 5 | Blocked by: 20 | Blocks: 22.
  - References: harness from Todo 20; `MAX_RECORDS_PER_ACCOUNT` in `cdpMetrics.ts:33-34`; performance evidence rules in `scripts/AGENTS.md:62-73`.
  - Acceptance criteria: evidence contains exactly three complete cells with >=20 raw samples each, valid computed percentiles, final files that parse, monotonic record order, and <=1000 records.
  - QA scenarios: happy - complete native run; failure - interrupt a disposable run and assert validator marks cell incomplete and refuses summary. Teardown removes temp userData and child. Evidence: `<attemptDir>/task-21-cdp-raw.json` and `task-21-teardown.log`.
  - Recommended task executor category: `unspecified-high` - controlled local performance measurement.
  - Commit: N - measurement evidence only.

- [ ] 22. Produce a machine-derived CDP `NO CHANGE` decision
  - What to do: validate Todo 21 evidence, write a deterministic decision receipt stating `NO CHANGE` because this approved plan has no control/treatment optimization candidate, and verify `GIT_MASTER=1 git diff -- src/main/features/cdpTelemetry.ts src/main/utils/lifecycle/cdpMetrics.ts` is empty. Record any material latency as an input to a separate future plan, not a hidden implementation.
  - Must NOT do: do not claim improvement, modify product/config, reinterpret baseline timing as paired benefit, or approve a treatment without a new plan.
  - Parallelization: Wave 5 | Blocked by: 21 | Blocks: 23-25.
  - References: Todo 21 raw evidence; candidate threshold policy in `performance-candidate-benchmark.js:125-167`; draft Decision 12.
  - Acceptance criteria: decision validator requires all three complete raw cells and emits `NO CHANGE`; product CDP diff is empty; full recurring gates remain green.
  - QA scenarios: happy - validate complete evidence; failure - remove one raw sample in a temporary copy and assert decision becomes invalid, not `NO CHANGE`. Evidence: `<attemptDir>/task-22-{decision,product-diff,full-gates}.{json,log}`.
  - Recommended task executor category: `quick` - deterministic evidence classification and scope check.
  - Commit: N - evidence-only decision.

- [ ] 23. Make release eligibility read-only and exact-SHA bound
  - What to do: RED-first add a dependency-free `scripts/release-eligibility.js` plus tests using a temporary bare Git remote. It computes candidate version tag and immutable source SHA, classifies absent/same-SHA/wrong-SHA tags, never writes, and emits GitHub outputs. Replace prepare job shell mutation with this helper and read-only permissions. Tag-triggered runs validate then set non-publishing/no-mutation outcome.
  - Must NOT do: do not create/delete/move a real tag, grant write permission to prepare/build jobs, depend on mutable branch checkout, or claim tag-event publication.
  - Parallelization: Wave 6 | Blocked by: 15, 18, 19, 22 | Blocks: 24.
  - References: `.github/workflows/release.yml:3-49`; `scripts/release-workflow.test.js:9-44`; GitHub Actions exact-SHA/concurrency guidance; packaging guide.
  - Acceptance criteria: absent tag yields eligible candidate+SHA without remote mutation; same-SHA tag permits retry; wrong-SHA fails closed; tag-trigger emits no publish intent; `git ls-remote` proves fixture remote unchanged.
  - QA scenarios: RED/GREEN focused script/workflow tests; surface temp bare remote exercises all states and is removed in `finally`. Evidence: `<attemptDir>/task-23-{red,green,git-fixture,teardown}.log`.
  - Recommended task executor category: `deep` - irreversible release ownership modeled in testable code.
  - Commit: Y | `ci(release): make eligibility read-only and exact-SHA`.

- [ ] 24. Qualify, build, and aggregate before the sole tag write
  - What to do: RED-first extend release workflow contract, then implement DAG: `prepare-release` -> `qualify-release`; macOS and Windows matrix builds need both and checkout the emitted exact SHA; aggregate verifier needs all four builds; `create-release-tag` needs aggregate verification and is the sole `contents: write` tag owner; publish needs both verified assets and create-tag. Qualification runs typecheck, docs, lint, coverage, circular deps, production build, all Playwright projects, headless capture, and budget on exact SHA.
  - Must NOT do: do not push a tag before aggregate verification, relax all-four artifact policy/signing checks, allow build legs write credentials, or publish on qualification/build/verify failure.
  - Parallelization: Wave 6 | Blocked by: 23 | Blocks: 25.
  - References: `.github/workflows/release.yml:51-264`; `.github/workflows/pr-check.yml` after Todo 19; `verify-release-artifacts.js`; mac/windows signing/artifact verifiers; release workflow tests.
  - Acceptance criteria: workflow contract graph proves every dependency and exact-SHA checkout; only create-tag/publish have required write permission; any qualification/build/aggregate failure makes tag/publish unreachable; one publish job remains.
  - QA scenarios: RED/GREEN `bun run test:run -- scripts/release-workflow.test.js scripts/verify-release-artifacts.test.js`; surface no-publication workflow state-machine fixture injects each failed predecessor and asserts zero tag writes. Evidence: `<attemptDir>/task-24-{red,green,dag,failure-matrix}.json`.
  - Recommended task executor category: `deep` - cross-platform release DAG and irreversible action ordering.
  - Commit: Y | `ci(release): verify artifacts before tagging`.

- [ ] 25. Lock release race, retry, and publication recovery behavior
  - What to do: add job-level concurrency keyed by candidate tag with `cancel-in-progress: false`; immediately before tag creation recheck the remote. If absent, create at exact source SHA; if same SHA, continue retry; if different, fail. Preserve an existing qualified tag after publish failure so a main rerun can rebuild/reverify/publish; never auto-delete/move. Test tag-trigger no-op and real-main ownership.
  - Must NOT do: do not force-push tags, auto-delete recovery tags, allow two tag writers, skip requalification on retry, or contact GitHub during tests.
  - Parallelization: Wave 6 | Blocked by: 24 | Blocks: F1-F4.
  - References: release helper from Todo 23; `.github/workflows/release.yml`; GitHub Actions concurrency semantics; `scripts/release-workflow.test.js`.
  - Acceptance criteria: disposable remote tests cover race inserted between prepare/create, absent tag, same-SHA retry, wrong-SHA failure, publish-failure retry, and tag event no-op; workflow retains exactly one write-capable tag job and one publish job.
  - QA scenarios: RED/GREEN focused release tests; surface run the helper against two concurrent disposable clones and assert one safe winner/no moved tag. Teardown removes all clones/remotes. Evidence: `<attemptDir>/task-25-{red,green,race,retry,teardown}.log`.
  - Recommended task executor category: `deep` - release race safety and recovery semantics.
  - Commit: Y | `ci(release): make tag publication retry-safe`.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance and evidence audit
  - Verify every Todo 1-25 acceptance criterion against its exact receipt; reject self-report, missing RED, missing surface class, stale attempt directory, incomplete CDP cells, or an implementation claim backed only by source tests.
  - Required result: unconditional `APPROVED` with a finding-to-task-to-evidence traceability matrix.
  - Recommended task executor category: `unspecified-high`.

- [ ] F2. Code quality, security, and lifecycle review
  - Read every changed file, run `lsp_diagnostics` on all changed TS files, inspect error/timeout cleanup, IPC sender trust, preload isolation, account listener rollback, generated-file ownership, and release permissions. Run full typecheck/lint/coverage/build/madge gates.
  - Required result: zero change-caused diagnostics, no prohibited suppression/cast/timer pattern, and unconditional `APPROVED`.
  - Recommended task executor category: `unspecified-high`.

- [ ] F3. Agent-executed real-surface QA
  - Run all four Playwright projects, actual built-CJS preload fixture, bounded Electron shutdown child, BrowserWindow-default plus WCV-opt-in account scenarios, five-run headless/budget, disposable package presence checks, CDP evidence validator, and release disposable-git simulation. Record screenshots/logs/JSON and teardown every resource.
  - Required result: every binary observable passes and teardown receipt reports no process/temp-dir leakage; unconditional `APPROVED`.
  - Recommended task executor category: `unspecified-high`.

- [ ] F4. Scope, dirty-worktree, and release-safety fidelity
  - Compare final diff to ownership manifest and original audit. Verify `package.json` hash/staged diff guard, no authored generated plan, BrowserWindow still default, CDP product files unchanged, coverage thresholds unchanged, no Windows support claim, and no real tag/release side effect.
  - Required result: no scope creep or user-change overwrite; unconditional `APPROVED`.
  - Recommended task executor category: `unspecified-high`.

## Commit strategy
- Commits are created only when the execution invocation explicitly authorizes Git operations (for example `$start-work ... --make-pr`); otherwise the listed commit lines are atomic staging/review boundaries, not permission to commit.
- Before any authorized commit, load `git-master`, inspect `GIT_MASTER=1 git status`, scoped diff, and recent repository/file history; stage only the todo's owned implementation plus direct tests.
- Never include `.omo/evidence/`, temporary fixtures/output, `package.json`, user changes, generated feature output authored by hand, or unrelated formatter churn.
- Keep each implementation and its tests together. Todos marked Commit N produce evidence only. Do not collapse release, preload, account, performance, or CI concerns into an omnibus commit.
- Suggested order follows the dependency matrix: Wave 1 test topology/characterization; Wave 2 independent fixes; Wave 3 IPC/package/residual; Wave 4 coverage/CI; Wave 5 harness only; Wave 6 three release commits.

## Success criteria
- `package.json` remains byte-identical to the accepted execution baseline and absent from staged/committed diffs; all user-owned dirty paths remain intact.
- `bun run typecheck`, `bun run lint:all`, `bun run test:coverage`, `bun run build:prod`, and `bunx madge --circular --extensions ts src/` exit 0 with coverage thresholds unchanged at 94/92/94/94.
- `bunx playwright test --list` discovers every tracked e2e/integration/performance/preload-artifact test exactly once; all four project commands pass.
- The Electron fixture executes actual `lib/preload/index.js` and observes all required preload behaviors; packaged presence and dependency closure pass as separate evidence.
- Public BrowserWindow creation installs activity/dehydration/throttle listeners once, handles rollback, and remains the default; WCV state/throttling matrix passes without policy flip.
- Shutdown continues later stages and exits exactly once within the 8-second production ceiling despite a pending cleanup; no late unhandled rejection or leaked child remains.
- Online checks isolate sender limits and always terminate UI by response or 6-second failure; manual updates abort at 10 seconds, reject malformed/draft/prerelease data, and release their gate.
- Feature codegen rejects unsupported/forward dependency specs without touching prior output; current valid specs produce deterministic equivalent output and runtime feature phases remain unchanged.
- Five-run renderer aggregation selects coherent upper-median evidence; adversarial, tie, PID-reuse, and incomplete-run fixtures pass; headless budget cannot false-pass from the final run.
- CDP benchmark contains >=20 raw samples at each size with valid JSON/order/cap evidence, emits measured `NO CHANGE`, and leaves CDP product files unchanged.
- PR CI includes lint, coverage, all Playwright projects, production build, headless capture, and budget evidence using real repository commands.
- Release tests prove exact-SHA qualification/build/all-four aggregate verification occurs before the sole tag write; failure creates no tag, same-SHA retry is safe, wrong-SHA/race fails closed, and no test publishes or mutates a real release.
- Final verifiers F1-F4 all return unconditional approval and the user explicitly accepts the execution evidence before the work is declared complete.
