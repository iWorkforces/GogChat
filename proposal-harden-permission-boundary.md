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
