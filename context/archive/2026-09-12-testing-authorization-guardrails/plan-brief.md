# Authorization & Business-Rule Guardrails — Plan Brief

> Full plan: `context/changes/testing-authorization-guardrails/plan.md`
> Research: `context/changes/testing-authorization-guardrails/research.md`

## What & Why

This is rollout Phase 2 of `context/foundation/test-plan.md`: prove ownership checks, the 3-pattern cap under concurrency, server-side input bounds, and soft-delete invisibility hold at the API layer (Risks #2, #4, #5, #6). Research found two of the four risk premises don't match the code — validation and soft-delete are already correctly layered — so this plan targets the real gaps: missing HTTP-level test coverage, one genuine untested concurrency bug, and view-route logic that's currently untestable because it's inlined in `.astro` frontmatter.

## Starting Point

Ownership is enforced entirely by RLS with zero app-layer checks (by design, but untested at the HTTP layer). The 3-pattern cap is DB-safe via a partial unique index, but the `POST` route has no handling for the `23505` a real race produces. Input validation (zod + DB CHECK) and soft-delete (a single RLS policy) are both already correct — only untested end-to-end. Phase 1 of the rollout (save/reload, estimator math) is complete and left behind a reusable two-user integration-test harness (`test/integration/helpers/`) this phase builds on directly.

## Desired End State

A second user cannot reach, view, or modify another user's pattern through any tested route. A concurrent race for the last pattern slot always resolves cleanly — one winner, one clean "at cap" message, no unhandled error. Out-of-range input and soft-deleted patterns are provably rejected/hidden through the real HTTP surface, not just at the database level.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Risk #4 fix scope | Add retry-once-on-`23505` to the `POST` route | Closes a real latent bug the original design assumed but never implemented | Plan |
| Concurrency test technique | True concurrent requests (`Promise.all`) | Proves the actual race, not a simulation | Plan |
| View-route test surface | Extract inline queries into `src/lib` functions, test those directly | Astro's Container API is infeasible here (hits the same `getViteConfig()`/cloudflare-adapter wall already abandoned for vitest) | Plan (research pivot) |
| Retry-exhaustion UX | Same "3 patterns" cap message as `KR001` | Reuses existing copy; correct in the overwhelming majority of real cases | Plan |
| Risk #5 test depth | HTTP-level rejection only, no DB-bypass test | pgTAP already proves the CHECK-constraint layer directly | Plan |
| Risk #6 test surface | List + get-by-id (the latter shared by the editor and print routes) | Free to add once query extraction (Phase 1) exists; covers every read path the risk statement names | Plan |
| Risk premise correction | Backport a correction to `test-plan.md` for Risks #5/#6 | Research is ground truth per test-plan §1 principle #3; matches the existing Risk #1/#3 backport convention | Research |

## Scope

**In scope:**
- Extracting `[id].astro`/`print.astro`/`patterns.astro`'s inline queries into testable `src/lib` functions
- Two-user integration tests for cross-owner `PATCH`/`DELETE` and the extracted get-by-id function
- Soft-delete reachability tests across list/get-by-id (editor + print)/PATCH/double-DELETE
- A retry-once fix for the `POST` route's unhandled `23505`, plus a true-concurrency integration test
- HTTP-level input-bounds tests for `POST`/`PATCH`
- `test-plan.md` cookbook (§6.3) and rollout-status (§3) sync, plus the Risk #5/#6 premise correction

**Out of scope:**
- Rendering actual `.astro` pages (Container API infeasible; see Current State Analysis in the full plan)
- Re-proving DB CHECK constraints independently (pgTAP already covers this)
- Any RLS policy, trigger, or RPC changes — only the `POST` route's error handling changes
- e2e/browser-level tests (test-plan §3 Phase 2 specifies `integration` only)

## Architecture / Approach

Phase 1 extracts two query functions (`getPatternForOwner`, `getPatternListForOwner`) into `src/lib/patternQueries.ts`, unblocking Phases 2 and 3 to test view-route logic without the Container API. Phases 2–5 are independent of each other and map one-to-one to the four risks, all built on the existing `test/integration/helpers/` two-user, real-RLS harness from Phase 1 of the rollout. Phase 6 closes out the rollout bookkeeping.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Extract query logic | Testable `src/lib` functions behind the view routes, no behavior change | Refactor regression if extraction isn't byte-for-byte faithful |
| 2. Risk #2 tests | Cross-user `PATCH`/`DELETE`/get-by-id all confirmed 404/null | None significant — reuses proven harness |
| 3. Risk #6 tests | Soft-delete unreachable via list/get/print/PATCH/double-DELETE | None significant |
| 4. Risk #4 fix + test | Retry-once on `23505`; concurrent-race test proves cap holds | `Promise.all` timing could be flaky against local Supabase |
| 5. Risk #5 tests | HTTP-level rejection of out-of-range width/height/palette/grid | None significant |
| 6. Cookbook + test-plan sync | §3 marked complete, §6.3 filled in, Risk #5/#6 premise corrected | None |

**Prerequisites:** Local Supabase running (`npx supabase start`), `.env.test` present (per Phase 1's setup).
**Estimated effort:** ~4-6 sessions across 6 phases — Phase 1 and Phase 4 are the heaviest (refactor + a production code change); 2, 3, 5 are straightforward test-authoring following an established pattern.

## Open Risks & Assumptions

- The concurrent-create test (Phase 4) assumes local Supabase's connection handling makes two genuinely concurrent `POST` calls race predictably enough for `Promise.all` to reliably produce one winner and one `23505`. If this proves flaky in practice, the documented fallback is a deterministic forced-collision (pre-occupy the slot via the admin client, then issue a single request) — weaker signal, but zero flakiness.
- Phase 1's extraction must be verified as behaviorally identical (same query, same shape) — any drift would invalidate Phases 2 and 3's tests without them appearing to fail for the right reason.

## Success Criteria (Summary)

- All four risks (#2, #4, #5, #6) have passing integration tests against real local Supabase, calling actual route handlers/query functions — not raw SQL.
- The `POST` route survives a real concurrent race without an unhandled error.
- `test-plan.md` accurately reflects what was tested and corrects its own premise where research found it wrong.
