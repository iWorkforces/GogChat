# native-os-notifications - Work Plan

## TL;DR (For humans)

**What you'll get:** Reliable macOS native notifications for Google Chat messages, with a correct permission flow that **asks when authorization is not yet granted**, and a hardened bridge from Chat’s web `Notification` API into Electron’s main-process OS banners. Optional generic “new unread” banners only if runtime evidence shows Chat is not firing the Web Notification API.

**Why this approach:** The codebase already has the primary stack (`notificationBridge` → `NOTIFICATION_SHOW` → `handleNotification` → `Electron.Notification`). The gap is not “invent notifications from scratch”; it is (1) permission semantics that match “ask if we don’t have it yet,” (2) multi-account click focus, (3) evidence-gated fallbacks, and (4) signed-build verification that Chat actually calls `new Notification(...)`.

**What it will NOT do:** It will not reverse-engineer Chat’s private transport, disable `contextIsolation`/`sandbox`, re-import `overrideNotifications` into the sandboxed preload, scrape message bodies from the DOM for privacy-invasive content, claim Windows notification product support as a first-class goal, or hand-edit `src/main/generated/featurePlan.ts`.

**Effort:** Medium  
**Risk:** Medium — OS permission UX, multi-account IPC focus routing, and DOM/Google Chat behavior are environment-sensitive; mitigated by phased TDD, reusing the media-permission pattern, and gating the unread fallback on measured evidence.  
**Decisions to sanity-check:** (1) Permission probe remains a silent Electron `Notification` (no native addon required for v1). (2) Denied UX opens System Settings once (not a loop). (3) Unread-delta OS banners are Phase 2 / evidence-gated only. (4) Click focuses the **sender account window**, not always account-0.

Your next move: execute only after plan approval, in a separate implementation session (e.g. worktree or branch `support-native-notifications`). Full execution detail follows below.

---

> TL;DR (machine): Medium, medium-risk; 3 PR phases + optional Phase 2 fallback; permission utility + windowWrapper thin call, bridge reliability, multi-account focus; no protocol scraping; no security model regression; evidence gate for synthetic unread notifications.

---

## Current state (as of plan authoring)

| Area | Today | Gap |
| --- | --- | --- |
| Page → native bridge | `src/preload/notificationBridge.ts` installs page-world `Notification` via `webFrame.executeJavaScript`, CustomEvent → IPC | Depends on Chat calling `new Notification(...)`; no runtime product verification recorded |
| Main OS show | `src/main/features/handleNotification.ts` deferred feature; validate + rate limit + auto-dismiss | Click always focuses constructor-bound `mainWindow` (account-0) |
| OS permission prompt | `windowWrapper.ts` silent probe Notification once; flag `app.notificationPermissionRequested` | Flag = “probe got `show` once”, **not** “authorization currently granted”; no denied → Settings path |
| Web `notifications` permission | `permissionHandler.ts` auto-grants for trusted Google origins | Correct for a Chat wrapper; keep |
| Unread / badge | `unreadCount.ts` + `badgeHelpers.ts` dock/tray | Does **not** create OS message banners |
| Legacy override | `overrideNotifications.ts` requires `contextIsolation: false` | Must stay **out** of `preload/index.ts` |
| Media TCC pattern | `mediaAccess.ts` + `mediaPermissions` security feature: status → request → denied dialog + Settings URL | Notifications should mirror structure, not copy media APIs that don’t exist for notifications |
| Electron 43 | `Notification.isSupported()` only; no first-class OS auth status API | Probe + config + optional future status module; no required native addon for Phase 1 |
| Settings URL allowlist | Camera/mic Privacy URLs only | Must add Notifications pane URL(s) before denied UX can open Settings safely |

### Two permission layers (must both work)

```text
Layer A — macOS app authorization (UNUserNotificationCenter)
  Missing → no OS banners at all for Electron.Notification

Layer B — Chromium session permission "notifications"
  Missing → page Notification API may be denied
  Today: auto-grant for mail.google.com / chat.google.com / accounts.google.com
```

### Primary message path (keep)

```text
Chat page: new Notification(title, options)
  → page-world GogChatNotification (notificationBridge)
  → CustomEvent __gogchatNotificationShow
  → preload validate + IPC NOTIFICATION_SHOW
  → handleNotification → Electron Notification.show()
  → macOS native banner
  → click → focus correct account window (Phase 1 fix)
```

---

## Goals and non-goals

### Goals

1. **Permission:** On macOS, if notification authorization has not been successfully requested yet, the app must request it (system dialog via probe Notification). If the user has denied, offer a clear one-time (or once-per-session) path to System Settings — never spam impossible re-prompts.
2. **Delivery:** When Google Chat constructs a Web Notification, GogChat must show a validated native OS notification with title/body/icon/tag where provided.
3. **Click:** Clicking a notification restores and focuses the **account window (or view) that produced it**, not always account-0.
4. **Reliability:** Account-0 background throttling exemption and existing bridge security model remain; bridge re-install / race risks are covered by tests where practical.
5. **Evidence:** Manual signed-build checklist documents whether Chat fires Web Notifications when the window is unfocused; that evidence decides Phase 2.
6. **Tests:** Unit/contract coverage for permission gating, denied Settings open, IPC validation, multi-account focus routing, and bridge forwarding.

### Non-goals (guardrails)

- Do **not** disable `contextIsolation`, `sandbox`, or re-enable `nodeIntegration`.
- Do **not** import `overrideNotifications.ts` from sandboxed `preload/index.ts`.
- Do **not** scrape private Chat wire protocols (webchannel/XMPP/push internals) for message content.
- Do **not** invent rich notification bodies from DOM text of conversations (privacy + fragility).
- Do **not** hand-edit `src/main/generated/featurePlan.ts` (register via `*.spec.ts` only if a new feature is added).
- Do **not** claim “notifications work while app is fully quit” (Electron process must be running; tray/close-to-tray is in scope, cold OS push is not).
- Do **not** make Windows notification UX a Phase 1 deliverable (macOS-first product; keep code platform-gated where appropriate).
- Do **not** silently set `notificationPermissionRequested = true` on `failed` (would block legitimate retries for unsigned/dev/transient failures).

---

## Product decisions (locked for this plan)

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Primary path = existing Web Notification bridge** | Already built, secure, content-rich when Chat cooperates |
| D2 | **Permission probe stays Electron `Notification.show()`** | Triggers `requestAuthorization` without a native addon; matches current code and Electron docs |
| D3 | **Config flag means “OS request path completed successfully (show fired)”**, not “user currently allows notifications” | Matches what we can know without a status library |
| D4 | **Denied → dialog + System Settings**, mirror `mediaAccess.showDeniedPermissionDialog` | macOS will not re-show the system prompt after deny |
| D5 | **Phase 1 does not add unread-delta synthetic OS notifications** | Avoid spam and false positives until runtime evidence proves Chat does not fire Web Notifications |
| D6 | **Phase 2 unread fallback is evidence-gated** | Implement only if signed smoke shows bridge works for manual `new Notification` but real Chat messages do not notify when unfocused |
| D7 | **Click routing uses `event.sender` / webContents → account window** | Multi-account correctness |
| D8 | **Web notifications permission stays auto-grant for trusted Google origins** | Dedicated Chat app should not double-prompt with a site prompt |
| D9 | **CI / headless skips interactive permission dialogs** | Same pattern as mediaAccess (`CI=1`) |
| D10 | **No new npm native modules in Phase 1** | Avoid packaging/signing complexity; optional `macos-notification-state` only if later status accuracy is required |

---

## Architecture target

### Permission flow (Phase 1)

```text
ensureNotificationPermission({ parentWindow? }):
  if !mac || !Notification.isSupported() → return
  if CI → skip interactive request; log and return
  if config.notificationPermissionRequested === true → return
     // "we already completed a successful probe path this install profile"
  if in-flight / process guard → return

  schedule (setImmediate / tracked, non-blocking):
    probe = new Notification({ title: 'GogChat', body: '…', silent: true })
    on show → close probe; configSet(requested=true); log granted-path completed
    on failed → do not set flag; log; release guard for retry next launch

  // Optional denied UX (see below): only when we can detect deny, or
  // when a later show fails with a clear authorization error, or when
  // user triggers "Enable Notifications" from menu (optional polish).
```

**Denied UX (Phase 1 minimum):**

Because Electron 43 does not expose a first-class “authorization status” API, Phase 1 implements:

1. **First-run probe** (existing, extracted to a dedicated helper).
2. **Settings allowlist expansion** for Notifications pane URL(s).
3. **`showDeniedNotificationPermissionDialog(window)`** reusable helper (media pattern).
4. **Call sites for denied dialog (pick A, recommended):**  
   - **A (recommended):** Expose an app-menu item under Help or Preferences-adjacent: “Notification Settings…” that opens System Settings Notifications (always available, no false “you denied” claim).  
   - **B:** After probe `failed` in a **signed** build, show dialog once (risk: unsigned dev false positives — gate with `app.isPackaged` or explicit env).  
   - **C (Phase 1.5):** If a real notification `failed` event fires with auth-related error, show dialog once per session.

Plan default: **A + existing probe**, with **C** as a small add-on in the same permission PR if cheap. Do **not** block on native status modules.

### Message show path (Phase 1)

```text
defineIPC NOTIFICATION_SHOW handler(validated, event):
  if !Notification.isSupported() → log + return
  resolve focus target:
    BrowserWindow.fromWebContents(event.sender)
    or accountWindowManager lookup by webContents id / partition
    fallback: mainWindow
  create Electron Notification
  on click → restoreAndFocus(focusTarget); optional: forward click to page later
  tag de-dupe + auto-dismiss as today
```

### Unread fallback path (Phase 2 only — evidence-gated)

```text
On UNREAD_COUNT increase (count > last):
  if window focused / visible and focused → skip
  if permission not requested successfully → ensure permission first
  synthetic Notification:
    title: 'GogChat'
    body: count === 1 ? 'You have a new unread message' : `You have ${count} unread messages`
  Debounce / rate limit shared with IPC_NOTIFICATION
  No DOM message body scraping
```

Acceptance for entering Phase 2: written smoke receipt showing:

1. Manual `new Notification('test')` in Chat page → OS banner works.  
2. Real inbound message while unfocused with Chat desktop notifications enabled → **no** bridge log / no OS banner.  
3. Unread count / favicon badge **does** update.

If (2) fails (i.e. real messages **do** notify), Phase 2 is **NO CHANGE**.

---

## Phased PR plan

### PR 1 — Notification permission: extract, harden, Settings path

**Title:** `feat(notifications): harden macOS notification permission request`

**Depends on:** none  

**Scope:**

1. Extract permission logic from `windowWrapper.ts` into something like:
   - `src/main/utils/security/notificationAccess.ts`
   - Optional thin feature `src/main/features/notificationPermissions.ts` registered in `security.spec.ts` **or** keep call from `windowWrapper` if security-phase has no window yet.
   - **Recommendation:** Keep **request probe** callable from `windowWrapper` (first window exists for dialog parent), but implement pure helpers in `notificationAccess.ts` (testable, no BrowserWindow required for probe itself). Menu item can call the Settings opener without a window.

2. Preserve behavior:
   - Process-level de-dupe guard.
   - Persist `app.notificationPermissionRequested` **only** after probe `show`.
   - On `failed`, leave flag false; release guard.
   - Skip non-mac; skip when `!Notification.isSupported()`.
   - Skip interactive request in CI (mirror mediaAccess).

3. Expand `validateAppleSystemPreferencesURL` allowlist with Notifications-related URL(s). Candidate (verify on current macOS before shipping):
   - Prefer a documented Apple URL that opens Notifications for the app or the Notifications pane.
   - Fallback: open System Settings app via existing shell fallback pattern if deep link fails.
   - Update unit tests in `urlValidators.test.ts` / `validators.test.ts`.

4. Add `showDeniedNotificationPermissionDialog(window)` (or “Open Notification Settings” without claiming deny when status unknown).

5. Optional small menu action via `menuActionRegistry` / app menu: “Notification Settings…” → open System Settings. Prefer registry decoupling over feature→feature imports.

6. Move / update tests from `windowWrapper.test.ts` notification gating into `notificationAccess.test.ts`; keep a thin integration assertion that windowWrapper still invokes ensure.

7. Docs: `src/main/AGENTS.md` — clarify flag semantics and CI skip.

**Must NOT:**

- Change bridge or IPC payload shape.
- Set requested=true on failed.
- Add native npm modules.
- Block `loadURL` / critical path.

**Acceptance (agent-executable):**

- `bun run test:run -- src/main/utils/security/notificationAccess.test.ts src/main/windowWrapper.test.ts src/shared/urlValidators.test.ts`
- `bun run typecheck`
- New tests cover: first call schedules one probe; second window same process no second probe; show → config true; failed → config false; non-mac no probe; CI skip; Settings URL validation accepts new allowlisted URL and rejects unapproved.

---

### PR 2 — Bridge reliability + multi-account focus + `isSupported` guard

**Title:** `fix(notifications): multi-account focus and notification show hardening`

**Depends on:** PR 1 preferred (independent if needed; no hard code dep)

**Scope:**

1. **`handleNotification.ts`**
   - Guard with `Notification.isSupported()` before constructing.
   - Change IPC handler to use `(validated, event)` from `defineIPC`.
   - Resolve focus `BrowserWindow` from `event.sender` (`BrowserWindow.fromWebContents`); fall back to the window passed at feature init.
   - For WebContentsView backend: if sender is a view’s webContents, resolve host window via account manager APIs already used for focus/switch — inspect `accountViewManager` / `IAccountWindowManager` for the correct “focus this account” entry point; use that instead of raw BrowserWindow when available.
   - Keep validation, rate limit, tag de-dupe, auto-dismiss, cleanup.

2. **`notificationBridge.ts` (only if tests reveal a real race)**
   - Document that preload re-runs on full navigation.
   - If needed: re-execute install script on `dom-ready` / visibility without double-install (`__gogchatNotificationBridgeInstalled` guard already present).
   - Prefer minimal change; do not switch to script-tag injection (CSP).

3. **Tests**
   - `handleNotification.test.ts`: isSupported false → no Notification; click focuses sender-derived window when different from main; existing auto-dismiss/tag tests still pass.
   - Bridge tests remain green; add re-install idempotency if code changes.

4. **Logging**
   - Structured debug: title, tag, hasBody, senderId (not full message body at info level if privacy-sensitive — debug only).

**Must NOT:**

- Change IPC channel names.
- Expose raw `ipcRenderer` to page.
- Focus wrong account when sender is known.

**Acceptance:**

- `bun run test:run -- src/main/features/handleNotification.test.ts src/preload/notificationBridge.test.ts`
- `bun run typecheck`
- Manual checklist (signed build preferred) recorded under evidence path (see Verification).

---

### PR 3 — Docs, AGENTS, smoke checklist, product wording

**Title:** `docs(notifications): document native notification architecture and smoke checklist`

**Depends on:** PR 1 + PR 2

**Scope:**

1. Update root / nested AGENTS where notification + permission semantics changed.
2. Add short user-facing README note only if accurate: native notifications require macOS permission + Chat desktop notification settings; tray/badge still show unread when banners are suppressed by Chat focus rules.
3. Add `docs/plans/native-os-notifications.md` (this plan, committed) **or** link from this session plan into repo `docs/plans/` when implementing.
4. Smoke checklist (manual, signed):

```text
[ ] Fresh profile: first launch shows macOS notification permission dialog (or probe path)
[ ] Allow → config flag true; subsequent launches no repeated probe
[ ] Deny path / Settings menu opens Notifications settings
[ ] DevTools: window.Notification is GogChat wrapper / bridge installed
[ ] new Notification('GogChat test', { body: 'hello' }) → OS banner
[ ] Chat settings: desktop notifications enabled
[ ] Unfocus app; send real message → banner? (record yes/no)
[ ] Click banner → correct account window focused
[ ] Multi-account: message on account-1 focuses account-1
[ ] Badge/tray still update on unread
```

**Acceptance:**

- Docs claim check / AGENTS consistency; no unsupported Windows claims.
- Smoke results stored as evidence for Phase 2 go/no-go.

---

### PR 4 / Phase 2 — Unread-delta synthetic OS notifications (implemented, default OFF)

**Title:** `feat(notifications): optional unread-delta fallback banners`

**Status:** Implemented with `app.unreadDeltaNotifications` **default false**. Enable via Preferences → **Notify on Unread Badge Increase** after smoke if Chat web notifications are silent while badges update.

**Scope (landed):**

1. Shared `showNativeNotification` in `utils/platform/nativeNotification.ts` (used by `handleNotification` + badge unread path).
2. On strict unread increase, focus window not focused, flag true: generic banner (`You have N unread messages`), tag `gogchat-unread-delta` replaces stacks.
3. First observed count never notifies (avoids login spam). Focused window suppresses. No DOM body scrape.
4. Config kill-switch: `app.unreadDeltaNotifications` default **false**.

**Acceptance:** unit tests for policy + badge wiring + menu checkbox.

---

## File map (expected touch list)

### PR 1

| File | Action |
| --- | --- |
| `src/main/utils/security/notificationAccess.ts` | **Create** — ensure/request/denied/settings helpers |
| `src/main/utils/security/notificationAccess.test.ts` | **Create** |
| `src/main/windowWrapper.ts` | Thin: call `ensureNotificationPermission()` |
| `src/main/windowWrapper.test.ts` | Adjust mocks/expectations |
| `src/shared/urlValidators.ts` | Allowlist Notifications System Settings URL(s) |
| `src/shared/urlValidators.test.ts` (+ validators tests) | Cover new URLs |
| `src/main/features/appMenu.ts` + `menuActionRegistry.ts` | Optional “Notification Settings…” |
| `src/main/AGENTS.md` | Permission semantics |
| `src/shared/types/config.ts` / schema | Only if new keys (prefer none in PR 1) |

### PR 2

| File | Action |
| --- | --- |
| `src/main/features/handleNotification.ts` | isSupported, sender→window focus |
| `src/main/features/handleNotification.test.ts` | New cases |
| `src/preload/notificationBridge.ts` | Only if re-install needed |
| `src/preload/notificationBridge.test.ts` | If bridge changes |
| Account manager helpers (as needed) | Focus account by webContents id |

### PR 3

| File | Action |
| --- | --- |
| `docs/plans/native-os-notifications.md` | Commit plan |
| `AGENTS.md` / nested guides | Architecture table updates |
| `README.md` | Accurate notification notes only |

### PR 4 (optional)

| File | Action |
| --- | --- |
| Shared show helper extracted from handleNotification | Create/use |
| `badgeHelpers.ts` or new deferred feature | Unread-delta trigger |
| Config schema | Optional kill switch |
| Tests | Focus/increase/rate |

---

## Implementation details worth locking

### Permission helper API (sketch)

```ts
// notificationAccess.ts
export type NotificationPermissionEnsureResult =
  | 'unsupported'
  | 'skipped-ci'
  | 'already-requested'
  | 'scheduled'
  | 'failed-to-schedule';

export function ensureNotificationPermission(): NotificationPermissionEnsureResult;
export function openNotificationSystemSettings(): Promise<void>;
export function showNotificationSettingsDialog(window: BrowserWindow): Promise<void>;
export function resetNotificationPermissionSchedulingForTests(): void;
```

- No bare `setTimeout` in main for production paths if a tracked timer is required for dismiss elsewhere; probe can keep `setImmediate` as today (Node, not a recurring timer). Auto-dismiss in handleNotification already uses `createTrackedTimeout`.
- Do not import features from features.

### Focus resolution (sketch)

```ts
function resolveNotificationFocusWindow(
  event: IpcMainEvent,
  fallback: BrowserWindow
): BrowserWindow {
  const fromSender = BrowserWindow.fromWebContents(event.sender);
  if (fromSender && !fromSender.isDestroyed()) return fromSender;
  // WebContentsView: map sender → host via account manager if available
  return fallback;
}
```

### Rate limits

- Keep `RATE_LIMITS.IPC_NOTIFICATION = 5` unless smoke shows drops under real Chat load; then raise carefully with tests.
- Do not remove validation.

### Security

- Continue `validateNotificationData` in preload and main.
- Icon via `validateFaviconURL` (http/https/data).
- Settings URLs only through allowlist + `openExternal` shell wrapper.

---

## Verification strategy

> Automated gates first; signed smoke for product claims.

### Automated (every PR)

```bash
bun run typecheck
bun run test:run -- src/main/utils/security/notificationAccess.test.ts \
  src/main/windowWrapper.test.ts \
  src/main/features/handleNotification.test.ts \
  src/preload/notificationBridge.test.ts \
  src/shared/urlValidators.test.ts
bun run lint:all   # if touched files require
```

### Manual signed smoke (PR 3 evidence)

- Prefer **code-signed** build: unsigned macOS builds often emit Notification `failed` and look broken.
- Record results under `.omo/evidence/native-os-notifications/` (or project evidence root) with date, app version, macOS version, allow/deny outcomes, and whether real Chat messages produced banners.

### Phase 2 gate

- Written receipt with the three conditions in the Architecture section. Without it: **NO CHANGE** on unread-delta.

### Explicit non-claims

- Do not claim notifications while the app process is fully quit.
- Do not claim Chat always notifies when focused (Google product behavior).
- Do not claim Windows parity in Phase 1.

---

## Execution strategy

### Wave 1 — Permission (PR 1)

Independent. Highest user-facing requirement: “ask if we don’t have it yet.”

### Wave 2 — Delivery hardening (PR 2)

Can start after or parallel to Wave 1 if conflict-free; prefer after permission extract to reduce `windowWrapper` churn.

### Wave 3 — Docs + smoke (PR 3)

After Wave 1–2 mergeable.

### Wave 4 — Optional fallback (PR 4)

Only after smoke evidence.

### Dependency matrix

| Work item | Depends on | Blocks | Parallel with |
| --- | --- | --- | --- |
| PR1 permission | None | PR3, PR4 | PR2 (soft) |
| PR2 focus/bridge | None (soft: PR1) | PR3, PR4 | PR1 |
| PR3 docs/smoke | PR1, PR2 | PR4 go/no-go | — |
| PR4 unread fallback | PR3 evidence = go | — | — |

---

## Todos (implementation + test = one todo)

### Wave 1

- [ ] **1. Notification permission helper + windowWrapper integration**  
  **What:** Create `notificationAccess.ts` with ensure/open-settings/dialog; wire `windowWrapper` to call ensure; CI skip; process guard; config flag only on `show`; port tests.  
  **Must NOT:** set flag on failed; block loadURL; change IPC.  
  **Acceptance:** unit tests listed in PR 1 green; typecheck green.  
  **References:** `src/main/windowWrapper.ts` (probe block ~78–118); `src/main/utils/security/mediaAccess.ts`; `src/shared/types/config.ts` `notificationPermissionRequested`; `src/main/utils/config/configSchema.ts`.

- [ ] **2. System Settings Notifications URL allowlist + menu/dialog**  
  **What:** Extend `validateAppleSystemPreferencesURL`; dialog/menu entry to open Notifications settings; tests for allow/deny lists.  
  **Must NOT:** open unvalidated URLs; claim “denied” if status unknown (word dialog as enable/settings).  
  **Acceptance:** validators tests; optional menu action covered by existing menu test patterns.  
  **References:** `src/shared/urlValidators.ts` `validateAppleSystemPreferencesURL`; `mediaAccess.showDeniedPermissionDialog`; `menuActionRegistry.ts`.

### Wave 2

- [ ] **3. handleNotification multi-account focus + isSupported**  
  **What:** Use IPC event.sender to focus producer window; isSupported guard; tests with dual fake windows.  
  **Must NOT:** break tag de-dupe/auto-dismiss; string-literal IPC channels.  
  **Acceptance:** handleNotification tests green; typecheck green.  
  **References:** `src/main/features/handleNotification.ts`; `src/main/utils/ipc/defineIPC.ts` handler `(validated, event)`; account view/window managers for WCV host focus.

- [ ] **4. Bridge smoke-hardening only if needed**  
  **What:** After manual smoke, fix install races only if proven; otherwise document NO CHANGE.  
  **Must NOT:** script-tag injection; contextIsolation false.  
  **Acceptance:** bridge tests still pass; evidence note.

### Wave 3

- [ ] **5. Docs + signed smoke checklist + Phase 2 go/no-go**  
  **What:** Commit plan/docs; run signed checklist; write evidence.  
  **Acceptance:** evidence file exists; Phase 2 marked go or NO CHANGE.

### Wave 4 (conditional)

- [ ] **6. Unread-delta synthetic notifications**  
  **What:** Only on go; shared show helper; focused suppression; tests.  
  **Must NOT:** DOM message scraping; enable without evidence.  
  **Acceptance:** tests + manual spam check.

---

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Chat does not call Web Notification | Phase 2 evidence gate + optional unread fallback |
| Unsigned builds fail Notification | Document signed smoke; keep flag false on failed |
| Settings deep link breaks across macOS versions | Allowlist + shell open System Settings fallback |
| Multi-account WCV focus harder than BW | Use account manager focus APIs; test both if WCV flag on |
| Permission dialog spam | One successful probe per profile; menu for Settings; no re-prompt loops |
| Rate limit drops bursts | Measure in smoke; adjust only with tests |
| Privacy if logging bodies | Debug-level only; no analytics of message content |

---

## Open questions (defaults applied if unanswered)

| # | Question | Default if no answer |
| --- | --- | --- |
| Q1 | Menu item for Notification Settings in Phase 1? | **Yes** — low cost, helps denied users |
| Q2 | Show in-app dialog automatically on first `failed` in packaged builds? | **No** in Phase 1 (unsigned noise); menu only + log |
| Q3 | Unread-delta default on if Phase 2 goes? | **Off by default** with config enable, or on only after extra product confirm |
| Q4 | Commit plan into `docs/plans/native-os-notifications.md`? | **Yes** during PR 3 |

---

## Success criteria (overall)

1. First launch on macOS with a fresh profile **requests** notification authorization when not previously completed (`show` path).  
2. Users who need to enable notifications later can open System Settings from the app without hunting.  
3. When Chat fires Web Notification, users get a **native OS banner** with validated payload.  
4. Notification click focuses the **correct account** surface.  
5. Security model unchanged: isolation, sandbox, validated IPC, no raw renderer `ipcRenderer` exposure.  
6. Automated tests cover permission + show + focus.  
7. Phase 2 fallback only with evidence; otherwise explicit **NO CHANGE**.

---

## Key Decisions (summary)

1. **Reuse the existing notification bridge** rather than a new message-protocol client.  
2. **Treat permission as first-class** with a dedicated `notificationAccess` helper modeled on media access patterns.  
3. **Config flag = probe completed**, not live OS grant status (Electron limitation without addons).  
4. **Denied/help path = System Settings**, not repeated system prompts.  
5. **Multi-account focus from IPC sender** is Phase 1, not a later nice-to-have.  
6. **Unread synthetic banners are optional Phase 2**, evidence-gated.  
7. **macOS-first**; Windows not in Phase 1 success criteria.  
8. **No security model regressions** for contextIsolation/sandbox/preload CJS.

---

## PR Plan (ordered)

| Order | PR | Title | Depends |
| --- | --- | --- | --- |
| 1 | PR1 | `feat(notifications): harden macOS notification permission request` | — |
| 2 | PR2 | `fix(notifications): multi-account focus and notification show hardening` | soft: PR1 |
| 3 | PR3 | `docs(notifications): document native notification architecture and smoke checklist` | PR1, PR2 |
| 4 | PR4 | `feat(notifications): optional unread-delta fallback banners` | PR3 + evidence go |

Each PR is independently reviewable; PR2 can merge before PR1 if needed, but permission is the higher product priority for “ask if we don’t have it yet.”
