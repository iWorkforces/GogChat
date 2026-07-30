# macos-intel-x64-dmg - Work Plan

## TL;DR (For humans)
**What you'll get:** Production releases that ship **two** macOS DMGs — Apple Silicon (`arm64`) and Intel (`x64`) — through the existing GitHub Release pipeline, with the same signing/notarization path and the same pre-publish artifact gate that already requires dual Windows installers.

**Why this approach:** Mirror the proven Windows multi-arch matrix pattern instead of inventing a universal binary or relying on deprecated Intel GitHub runners. electron-builder already names DMGs `${productName}-${version}-${arch}.dmg`; the gap is that CI and package scripts never pin or produce `x64`.

**What it will NOT do:** It will not create a universal (`arm64+x64`) binary, change Windows packaging, weaken macOS signing/notarization policy, claim public Intel support before packaged smoke evidence exists, or rewrite the dual Rsbuild (ESM main / CJS preload) architecture.

**Effort:** Medium  
**Risk:** Medium — release packaging and publish gates cross CI, signing, and docs; mitigated by test-first artifact contracts and matrix isolation so an x64 failure cannot silently drop arm64.  
**Decisions to sanity-check:** (1) Separate DMGs per arch (recommended) vs universal. (2) Cross-compile x64 on `macos-latest` (ARM) via electron-builder vs requiring a native Intel runner. (3) When public README/AGENTS wording flips from “Apple Silicon oriented” to dual-arch macOS.

Your next move: execute only in a separate worker session with `$start-work macos-intel-x64-dmg`. Full execution detail follows below.

---

> TL;DR (machine): Medium, medium-risk, 8 implementation todos and 3 final verification tasks; dual macOS DMG matrix, arch-required release verification, package script pins, post-pack hooks for both arches; no universal binary; no security/signing policy weakening.

## Current state (as of plan authoring)

| Area | Today | Gap for Intel |
| --- | --- | --- |
| `electron-builder.yml` `mac.target` | `dmg` only; **no** explicit `arch` list | Host-default arch only → arm64 on `macos-latest` |
| Global `artifactName` | `${productName}-${version}-${arch}.${ext}` | Ready for `…-x64.dmg` once built |
| `package:mac:release` | `electron-builder … --mac` (no `--x64` / `--arm64`) | Produces host arch only |
| `build-macOS-dmg.sh` | Hard-coded arm64 messaging + `electron-builder --mac --arm64` | Local script path is Silicon-only |
| `.github/workflows/release.yml` `build-mac` | Single job, `macos-latest`, one artifact `release-macos-dmg` | No matrix; no x64 job |
| `verify-release-artifacts.js` | Requires **≥1** DMG + Windows x64+arm64 | Would accept arm64-only forever |
| `verify-mac-release-signing.js` | Verifies first `.app` + first `.dmg` found | Needs to verify **per-arch** outputs in matrix jobs |
| `scripts/after-pack.cjs` | Skips non-arm64 | x64 builds skip strip/locale optimizations |
| `scripts/remove-locales.js` | Hard-coded `GogChat-darwin-arm64` | Would miss x64 unpack path if reused |
| Docs / AGENTS | Public platform = Apple Silicon | Must update only after smoke evidence |
| Native modules at runtime | Electron + pure JS deps; `sharp` is **devDependency** only | Cross-packaging x64 Electron is viable |

### Why not a universal DMG?

- User request is **Intel x64 DMG in production**, not “one fat binary.”
- Windows already ships **separate** per-arch installers; dual DMGs match that mental model.
- Universal binaries increase download size for every user and complicate notarization diagnostics.
- Separate DMGs allow independent failure isolation and clearer SHA256SUMS entries.

### Why cross-compile x64 on ARM runners?

- GitHub’s long-lived Intel macOS runners (`macos-13`) are deprecated / unavailable for new capacity planning.
- electron-builder downloads the **prebuilt Electron binary for the target arch**; host CPU does not need to match for a pure Electron wrapper with no native runtime addons that require rebuild-on-host.
- `scripts/install-electron-binary.js` already understands `npm_config_arch` and Rosetta detection — packaging jobs must **pin** target arch so Rosetta never rewrites x64 → arm64 during accidental local/CI install steps.
- Optional later: native-Intel smoke on real hardware; packaging success alone is not a public-support claim.

## Scope

### Must have
- Production release builds and publishes **both** `GogChat-<version>-arm64.dmg` and `GogChat-<version>-x64.dmg`.
- Explicit package scripts (or a single script with required arch arg) that pass `--mac --arm64` and `--mac --x64` to electron-builder with the existing sign overlay and `--publish never`.
- Release workflow matrix (or two jobs) that produce per-arch artifacts with distinct upload names (`release-macos-arm64`, `release-macos-x64`).
- Aggregated `verify-release-artifacts` gate that **requires both** macOS arches (parallel to required Windows arches).
- Signing/notarization preflight and trust verification still apply when `MAC_CSC_*` is configured; both arches use the same credential pair.
- Local `build-macOS-dmg.sh` (and package aliases) accept an architecture parameter; default remains `arm64` for local Silicon developers.
- Post-pack optimizations (`after-pack.cjs`) run for **both** darwin arm64 and darwin x64.
- Contract tests updated: `package-scaffold`, `release-workflow`, `verify-release-artifacts`, mac signing tests.
- AGENTS / README / BUILD / mac packaging guides updated to document dual-arch **packaging** without over-claiming support before smoke.

### Must NOT have (guardrails)
- Do **not** ship a universal binary unless a later, separate plan approves it.
- Do **not** change Windows NSIS names, runners, or Authenticode policy.
- Do **not** weaken `mac-release-signing` pair completeness, notarization requirements, or `verify-mac-release-signing` trust checks.
- Do **not** hand-edit `src/main/generated/featurePlan.ts` or touch feature lifecycle code for this work.
- Do **not** change Electron security defaults, preload CJS contract, or account partition model.
- Do **not** claim “Intel is supported” in user-facing README until at least one successful signed production (or release-candidate) x64 DMG has been installed and smoke-launched on real Intel macOS **or** an explicit owner waiver is recorded in evidence.
- Do **not** use labels `amd64`, `ia32`, or `universal` in artifact names.
- Do **not** merge both arches into a single DMG job that fails open if one arch is missing.

## Verification strategy
> Zero human intervention for automated gates - all verification is agent-executable.

- **Unit/contract tests (Vitest):** package scripts, workflow shape, artifact name detection, dual-DMG requirement, after-pack arch acceptance.
- **Local package smoke (when on macOS):**  
  - `bun run package:mac:arm64` (or arch-flag equivalent) → `dist/*-arm64.dmg`  
  - `bun run package:mac:x64` → `dist/*-x64.dmg`  
  Unsigned path is acceptable locally when credentials are absent; record `[blocked: credentials unavailable]` for signed claims.
- **CI contract:** `scripts/release-workflow.test.js` asserts matrix, runner, package command, arch proof step (if any), artifact upload names, and verify job still depends on both mac jobs + windows.
- **Release gate:** `verify-release-artifacts` fails if either mac arch is missing; succeeds only when arm64 DMG + x64 DMG + both Windows setups are present (existing Windows rules unchanged).
- **Signing:** When `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD` are complete, each mac matrix leg runs `verify-mac-release-signing` against **that** arch’s `.app` and `.dmg`.
- **Evidence root:** `.omo/evidence/macos-intel-x64-dmg/task-<N>-<slug>.{json,md,log}` for package inventories, workflow diffs, and smoke receipts.
- **Public wording gate:** Doc claim flip is a final verification task with `check:doc-claims` green and explicit smoke receipt or owner waiver.

## Recommended architecture

```text
prepare-release
      │
      ├─► build-mac (matrix)
      │     ├─ arch=arm64, package:mac:arm64 → release-macos-arm64
      │     └─ arch=x64,   package:mac:x64   → release-macos-x64
      │
      ├─► build-windows (existing matrix x64 / arm64)
      │
      └─► verify-release-artifacts
            downloads all four product artifacts
            requires: arm64.dmg + x64.dmg + windows-x64 + windows-arm64
            → verified-release-assets + SHA256SUMS
            → publish-release
```

### Package command shape (target)

Prefer explicit scripts mirroring Windows:

```bash
package:mac:arm64   # … electron-builder --config electron-builder.sign.yml --mac --arm64 --publish never
package:mac:x64     # … electron-builder --config electron-builder.sign.yml --mac --x64 --publish never
package:mac:release # thin wrapper or deprecated alias: keep behavior documented
package:mac:artifacts  # verify both DMG arches in dist/
```

Signing branch logic (present today inside `package:mac:release`) must be **shared** — extract a small shell fragment or Node helper if duplication becomes error-prone, but avoid abstraction for its own sake. Acceptable minimal change: two scripts that duplicate the existing signed/unsigned env dance with only the `--arm64` / `--x64` difference.

### Artifact names (contract)

| Arch | Expected DMG basename pattern |
| --- | --- |
| arm64 | `GogChat-<semver>-arm64.dmg` |
| x64 | `GogChat-<semver>-x64.dmg` |

Forbidden in release set: `amd64`, `ia32`, `universal`, multi-extension installers for mac, zip/mas/pkg unless a future plan adds them.

### electron-builder.yml

Optional but recommended for clarity:

```yaml
mac:
  target:
    - target: dmg
      arch:
        - arm64
        - x64
```

**Caveat:** Listing both arches can cause a **single** `electron-builder --mac` invocation to build both. Prefer **CLI pin per CI matrix cell** (`--arm64` **or** `--x64`) so jobs stay isolated and upload one arch each. Config list documents supported arches; scripts and CI still pass exactly one arch flag.

## Execution strategy

### Parallel execution waves

**Wave 1 – contracts first (TDD):** Todos 1–2. Red tests for dual DMG requirement and package/workflow shape before product changes.

**Wave 2 – packaging plumbing:** Todos 3–5. Scripts, electron-builder/after-pack, local DMG script.

**Wave 3 – CI + release gate:** Todo 6. Wire matrix and uploads; depends on 1–3 green.

**Wave 4 – docs + evidence:** Todos 7–8 and final verification.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 6, 8 | 2, 3 (after tests sketched) |
| 2 | None | 3, 6 | 1 |
| 3 | 2 | 4, 5, 6 | 1 |
| 4 | 3 | 8 | 5 |
| 5 | 3 | 8 | 4 |
| 6 | 1, 2, 3 | 7, F1 | None |
| 7 | 6 | F2, F3 | 8 |
| 8 | 1, 4, 5 | F1–F3 | 7 |

## Todos
> Implementation + Test = ONE todo. Never separate.

- [ ] 1. Dual macOS DMG release-artifact contract
  What to do / Must NOT do: Extend `scripts/verify-release-artifacts.js` (and tests) so release verification requires **exactly one** DMG per required mac arch (`arm64`, `x64`) using basename patterns consistent with `artifactName` (`*-arm64.dmg`, `*-x64.dmg`). Reject missing arch, duplicate arch, and forbidden labels (`amd64`, `ia32`, `universal`). Keep Windows rules unchanged. Optionally factor shared “detect arch from mac DMG name” helpers analogous to `detectWindowsInstallerArch`. Must NOT accept “any single DMG” as success. Must NOT require blockmaps or zip sidecars for mac.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 6, 8
  References: `scripts/verify-release-artifacts.js`; `scripts/verify-release-artifacts.test.js`; `scripts/verify-windows-package-artifacts.js` (pattern to mirror); `electron-builder.yml` `artifactName`.
  Acceptance criteria: Tests fail on fixtures with only arm64 DMG; pass with both DMGs + both Windows setups; fail on `…-amd64.dmg` / duplicates; CLI still copies verified set + `SHA256SUMS.txt`.
  QA scenarios: Happy: fixture with `GogChat-3.17.0-arm64.dmg` + `GogChat-3.17.0-x64.dmg` + both Windows setups → exit 0. Failure: arm64-only fixture → exit 1 with `Missing required macOS DMG arch: x64`.
  Commit: `test(release): require macOS arm64 and x64 DMGs`

- [ ] 2. Package scaffold contracts for arch-pinned mac scripts
  What to do / Must NOT do: Update `scripts/package-scaffold.test.js` (and related release-workflow expectations) to require explicit `package:mac:arm64` and `package:mac:x64` (or equivalent) that: run `build:prod`, invoke `mac-release-signing.js --release`, use `electron-builder.sign.yml`, pass exactly one of `--arm64`/`--x64`, and use `--publish never`. Preserve unsigned credential-absent path. Define `package:mac:artifacts` (or extend verify helper) requiring both arches. Must NOT remove the historical `package` / `package:mac:release` entry without a clear deprecation comment or thin wrapper that fails if used for dual-arch publish.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 3, 6
  References: `package.json` scripts; `scripts/package-scaffold.test.js`; `scripts/mac-release-signing.js`; `electron-builder.sign.yml`.
  Acceptance criteria: Scaffold tests fail against current host-default `package:mac:release`; pass after scripts exist with arch flags and no `amd64` labels.
  QA scenarios: `bun run test:run -- scripts/package-scaffold.test.js`.
  Commit: `test(package): contract macOS arch-pinned package scripts`

- [ ] 3. Implement arch-pinned mac package scripts and keep signing policy shared
  What to do / Must NOT do: Implement the package scripts demanded by Todo 2. Factor shared signed/unsigned env logic only if duplication would clearly drift (prefer minimal copy-paste of the existing `if [ -n "$MAC_CSC_LINK" ]` branch with arch flag injected). Ensure `CSC_IDENTITY_AUTO_DISCOVERY=false` remains on the unsigned path and notarization env is only required when signing credentials are complete (existing `mac-release-signing` behavior). Document that `package:mac:release` either becomes a deprecated alias (e.g. arm64-only with warning) or is removed from release.yml entirely in favor of matrix commands. Must NOT call `shell.openExternal` or change app runtime. Must NOT enable `--publish always`.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 4, 5, 6
  References: `package.json`; `scripts/mac-release-signing.js`; current `package:mac:release` string.
  Acceptance criteria: Scaffold tests green; dry-run `bun scripts/mac-release-signing.js --release` still enforces credential pairs; scripts contain `--mac --arm64` / `--mac --x64` and `--publish never`.
  QA scenarios: `bun run test:run -- scripts/package-scaffold.test.js scripts/mac-release-signing.test.js`; local `bun run package:mac:x64` when credentials absent produces unsigned `*-x64.dmg` or a clear builder error with evidence log (host must be darwin for real package).
  Commit: `feat(package): add macOS arm64 and x64 release package scripts`

- [ ] 4. Local DMG script + after-pack / locale tooling for both arches
  What to do / Must NOT do: Teach `build-macOS-dmg.sh` an `--arch arm64|x64` flag (default `arm64`). Replace hard-coded “Apple Silicon only” messaging with the selected arch. Pass the matching electron-builder arch flag. Update `scripts/after-pack.cjs` to run strip/locale cleanup for **both** darwin arm64 and darwin x64 (use electron-builder arch enum: x64=1, arm64=3). Fix `scripts/remove-locales.js` hard-coded `GogChat-darwin-arm64` path if still used, or document it as legacy if after-pack fully supersedes it. Add/adjust unit tests where present. Must NOT introduce Intel-only code paths in app runtime. Must NOT strip signed binaries in a way that breaks notarization (strip only pre-sign as today).
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 8
  References: `build-macOS-dmg.sh`; `scripts/after-pack.cjs`; `scripts/remove-locales.js`; `BUILD.md`; `mac/AGENTS.md`.
  Acceptance criteria: `./build-macOS-dmg.sh --environment develop --arch x64` invokes builder with `--x64`; after-pack logs optimizations for x64 context in a unit/mock test or documented dry run; arm64 path remains default.
  QA scenarios: Script help shows both arches; grep/tests prove after-pack no longer early-returns for x64.
  Commit: `feat(mac): package arm64 and x64 local DMG and post-pack hooks`

- [ ] 5. Mac artifact verifier helper (optional but recommended)
  What to do / Must NOT do: Add `scripts/verify-macos-package-artifacts.js` (+ tests) modeled on Windows verifier: detect arch from DMG basename, `--require-arch`, manifest mode, forbid bad labels. Wire `package:mac:artifacts`. Use it from each release matrix leg after package (like Windows) **and** from the aggregate verifier. Must NOT invent new naming schemes beyond existing `artifactName`.
  Parallelization: Wave 2 | Blocked by: 3 | Blocks: 6 (soft), 8
  References: `scripts/verify-windows-package-artifacts.js`; `scripts/verify-release-artifacts.js`.
  Acceptance criteria: Unit tests cover detect/require/duplicate/forbidden; CLI exits nonzero on missing required arch.
  QA scenarios: `bun run test:run -- scripts/verify-macos-package-artifacts.test.js`.
  Commit: `feat(release): verify macOS DMG arch artifacts`

- [ ] 6. Production release workflow matrix for macOS dual DMG
  What to do / Must NOT do: Replace single `build-mac` job with a matrix (or two jobs) for `arm64` and `x64` on `macos-latest`. Each cell: install, build:prod (or rely on package script), signing config detection, `bun run package:mac:${{ matrix.arch }}`, conditional `verify-mac-release-signing` when signing configured, per-arch `verify-macos-package-artifacts --require-arch`, upload `release-macos-${{ matrix.arch }}` with `dist/*-${{ matrix.arch }}.dmg` (or exact filter). Update `verify-release-artifacts` job `needs` to depend on the matrix job. Harden `verify-mac-release-signing` to operate on the **current job’s** single-arch dist (not “first of many”). Update `scripts/release-workflow.test.js` accordingly. Consider optional runner arch proof for arm64 (`uname -m` == `arm64`); for x64 packaging on ARM hosts, document that host is ARM while **target** is x64 — do **not** fail the job for host≠target when intentionally cross-packaging. Must NOT remove Windows matrix. Must NOT publish from package steps.
  Parallelization: Wave 3 | Blocked by: 1, 2, 3 | Blocks: 7, F1
  References: `.github/workflows/release.yml`; `scripts/release-workflow.test.js`; `scripts/verify-mac-release-signing.js`.
  Acceptance criteria: Workflow tests assert matrix include for arm64+x64, package commands, distinct artifact names, verify job still aggregates all uploads; YAML validates.
  QA scenarios: `bun run test:run -- scripts/release-workflow.test.js scripts/verify-mac-release-signing.test.js`; `actionlint` or equivalent if available.
  Commit: `ci(release): build and publish macOS arm64 and x64 DMGs`

- [ ] 7. Documentation and AGENTS dual-arch packaging claims
  What to do / Must NOT do: Update packaging-facing docs: root `AGENTS.md`, `mac/AGENTS.md`, `scripts/AGENTS.md`, `BUILD.md`, `README.md` (careful). Document: dual DMG production pipeline; package commands; artifact names; cross-package note; **public support** remains gated on smoke evidence. Expand “Do not add Intel-specific assumptions” in `mac/AGENTS.md` to allow dual-arch packaging while forbidding universal-by-default and false support claims. Run `bun run check:doc-claims`. Must NOT state Windows is publicly supported. Must NOT state Intel is supported in marketing language until F2 smoke or waiver.
  Parallelization: Wave 4 | Blocked by: 6 | Blocks: F2, F3
  References: `AGENTS.md`; `mac/AGENTS.md`; `scripts/AGENTS.md`; `BUILD.md`; `README.md`; `scripts/check-doc-claims.js`.
  Acceptance criteria: Doc-claims check green; packaging docs list both arches and both package scripts; README platform section accurately reflects policy chosen in F2.
  QA scenarios: `bun run check:doc-claims`; manual read of README platform blurb.
  Commit: `docs(mac): document dual-arch macOS DMG packaging`

- [ ] 8. End-to-end local/CI evidence package for both DMGs
  What to do / Must NOT do: Produce evidence receipts under `.omo/evidence/macos-intel-x64-dmg/` listing: script versions, builder command lines, DMG basenames, sizes, SHA-256, signing state (signed vs `[blocked: credentials unavailable]`), and `file`/`lipo -archs` (or `vtool`) proof that the packaged app’s main binary matches the claimed arch. Prefer running on a darwin host; if agent host is not macOS, record blocked package smoke and still ship contract tests as the automated bar. Must NOT claim notarized success without stapler validation.
  Parallelization: Wave 4 | Blocked by: 1, 4, 5 | Blocks: F1–F3
  References: dist outputs; `scripts/verify-mac-release-signing.js`; evidence directory convention from performance-remediation plan.
  Acceptance criteria: Evidence files exist for arm64 and x64 package attempts (or explicit platform block); checksums match SHA256SUMS helper output if used.
  QA scenarios: Inspect evidence JSON; optional `hdiutil imageinfo` on produced DMGs.
  Commit: evidence only if repo tracks it; otherwise leave untracked under `.omo/` per project norms.

## Final verification tasks

- [ ] F1. Contract suite green
  Run: `bun run test:run -- scripts/package-scaffold.test.js scripts/release-workflow.test.js scripts/verify-release-artifacts.test.js scripts/verify-macos-package-artifacts.test.js scripts/verify-mac-release-signing.test.js scripts/mac-release-signing.test.js` (adjust names to files that exist after implementation).  
  Pass: all green. Fail: any red contract.

- [ ] F2. Packaged smoke policy decision
  - **Preferred:** Install `*-x64.dmg` on Intel Mac (or Rosetta-documented path if owner accepts) + install `*-arm64.dmg` on Apple Silicon; launch, account bootstrap smoke, quit cleanly.  
  - **If no Intel hardware:** Keep public README as “Apple Silicon + Intel packaging (Intel runtime smoke pending)” **or** owner waiver. Do not silently claim full Intel support.  
  Record receipt in evidence.

- [ ] F3. Production pipeline dry-run
  Open PR from `feat/macos-intel-x64-dmg` → `develop`; confirm PR CI green. After merge, a version bump release must attach **four** product binaries (2 mac DMGs + 2 Windows setups) plus `SHA256SUMS.txt`. Confirm GitHub Release assets match verify-release contract.

## Out of scope / follow-ups (do not implement in this plan)

- Universal binary DMG.
- Mac App Store / `pkg` / `zip` targets.
- Auto-update feed architecture that selects arch (document as future when `publish` provider is real).
- PR CI (`pr-check.yml`) dual-arch packaging on every PR (too expensive); keep release-tag path only unless a later perf budget allows optional manual `workflow_dispatch`.
- Changing `minimumSystemVersion` or camera/mic privacy strings.
- Runtime feature work, account manager, or performance budgets.

## Risk register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cross-packaged x64 Electron fails notarization edge case | Release red for x64 leg | Matrix isolation; arm64 still ships if fail-fast false; investigate stapler per arch |
| `after-pack` strip breaks signature order | Trust verify fails | Keep afterPack before sign (electron-builder order); do not strip after notarize |
| Host Rosetta flips arch during electron install | Wrong binary arch in DMG | Pin `npm_config_arch` / builder CLI arch; assert with `lipo`/`file` in evidence |
| Artifact upload globs match wrong files | Publish wrong set | Per-arch path filters + aggregate dual-arch require |
| Doc claims run ahead of smoke | False user trust | Public support wording gated on F2 |
| Dual package doubles release mac minutes | Cost/time | Accept ~2× mac package time; fail-fast false keeps partial diagnosis |

## Implementation notes for the executor

1. **Start with failing tests** (Todos 1–2). Do not edit `release.yml` first.
2. **Prefer Windows-pattern naming:** `package:mac:x64`, `package:mac:arm64`, `verify-macos-package-artifacts.js`, matrix `arch`.
3. **Keep `artifactName` as-is** unless a bug appears; do not introduce `-macos-` infix for mac DMGs (Windows already uses `-windows-` because NSIS needed disambiguation).
4. **Signing secrets** are shared; no new secret names required for x64.
5. **Branch for this work:** `feat/macos-intel-x64-dmg` (created at plan authoring from `develop`).
6. **No commits unless the user requests them** during execution; this plan file may be committed when asked.
7. **Electron version** already in `package.json` (`^43.x`) publishes official darwin x64 builds — confirm at package time; no Electron fork required.

## Success criteria (definition of done)

1. Tag/main release workflow produces and publishes both `*-arm64.dmg` and `*-x64.dmg`.
2. `verify-release-artifacts` fails closed if either mac arch is missing.
3. Signed releases (when credentials present) notarize and pass `verify-mac-release-signing` per matrix leg.
4. Contract tests encode the dual-arch mac release shape permanently.
5. Docs describe dual-arch packaging accurately; public Intel support wording matches smoke reality.
6. No regression to Windows dual-arch release or mac signing policy.

## Quick reference — files expected to change

| File | Role |
| --- | --- |
| `package.json` | Arch-pinned package scripts |
| `electron-builder.yml` | Optional mac target arch documentation |
| `.github/workflows/release.yml` | Mac matrix + artifact names |
| `build-macOS-dmg.sh` | `--arch` flag |
| `scripts/after-pack.cjs` | Optimize x64 too |
| `scripts/remove-locales.js` | Arch-aware paths if still used |
| `scripts/verify-release-artifacts.js` + `.test.js` | Require both mac DMGs |
| `scripts/verify-macos-package-artifacts.js` + `.test.js` | New (recommended) |
| `scripts/verify-mac-release-signing.js` + `.test.js` | Per-job single-arch robustness |
| `scripts/package-scaffold.test.js` | Script contracts |
| `scripts/release-workflow.test.js` | CI contracts |
| `AGENTS.md`, `mac/AGENTS.md`, `scripts/AGENTS.md`, `BUILD.md`, `README.md` | Docs |

## Suggested PR title (when implementing)

`feat(release): ship macOS Intel x64 DMG alongside Apple Silicon`

## Suggested PR body outline

- Dual DMG production (arm64 + x64)
- Matrix packaging; aggregate require both
- Artifact names unchanged template
- Signing/notarization unchanged
- Docs packaging claims; support policy note
- Test plan: contract suite + package smoke + release asset checklist
