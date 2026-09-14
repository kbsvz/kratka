---
date: 2026-09-12T21:43:13+02:00
researcher: Zhanna Kabysheva
git_commit: 9ce1435d50667676a117535f8ca63cc39c20e826
branch: implement-test-plan
repository: kratka
topic: "Phase 2 risk grounding — Authorization & business-rule guardrails (Risks #2, #4, #5, #6)"
tags: [research, codebase, authorization, rls, concurrency, validation, soft-delete]
status: complete
last_updated: 2026-09-12
last_updated_by: Zhanna Kabysheva
---

# Research: Phase 2 risk grounding — Authorization & business-rule guardrails

**Date**: 2026-09-12T21:43:13+02:00
**Researcher**: Zhanna Kabysheva
**Git Commit**: 9ce1435d50667676a117535f8ca63cc39c20e826
**Branch**: implement-test-plan
**Repository**: kratka

## Research Question

For `context/foundation/test-plan.md` §3 Phase 2 ("Authorization & business-rule guardrails"), ground Risks #2, #4, #5, #6 in the current codebase: where does each failure surface actually live, what already guards against it, and what concretely is untested — per §1 principle #3 ("risks are scenarios, not code locations... that knowledge is produced by `/10x-research`... if the plan and research disagree about where the failure lives, research is the ground truth").

## Summary

Two of the four risks (#2, #4) are confirmed as real, currently-untested gaps. Two (#5, #6) turn out to have their stated premise **contradicted** by the actual code — validation is not client-side-only, and soft-delete reachability is not per-route-fragile — so the test target for those two needs to be reframed before planning.

| Risk | Premise holds? | What's actually true | Untested gap to close |
|---|---|---|---|
| #2 — cross-user access via id manipulation | **Yes** | No app-layer `user_id` equality check exists anywhere; ownership is enforced 100% by RLS, and the route code explicitly treats "not found" and "not owned" as the same case | No test drives the actual HTTP route handlers with two real users — only raw-SQL pgTAP exists |
| #4 — 4th pattern / slot-name desync under concurrency | **Partially** | Cap + slot/name uniqueness are DB-enforced via a partial unique index (race-free) — but the API route has no handling for the `23505` unique-violation a real race produces, contradicting the original design plan's assumption that "the loser retries once" | No test drives two concurrent creates; the API's un-retried `23505` path is unexercised |
| #5 — server accepts out-of-bounds input because validation is client-side only | **No** — premise is false | Both mutating routes run zod validation server-side, backed by DB CHECK constraints as an independent second layer | No test exists at the HTTP layer proving the zod 400 response (only DB-level pgTAP for the CHECK constraints) |
| #6 — soft-deleted pattern remains reachable | **No** — premise is false | A single, unconditional RLS `SELECT` policy (`deleted_at is null`) gates every read path; there is no per-route filter to forget | No test exercises the actual HTTP/page routes after a soft-delete (only raw-SQL pgTAP) |

## Detailed Findings

### Risk #2 — Cross-user pattern access via id manipulation

- Only one API file is id-scoped: [`src/pages/api/patterns/[id].ts`](../../../src/pages/api/patterns/%5Bid%5D.ts) — `PATCH` (lines 8-52) and `DELETE` (lines 54-90). Viewing a single pattern happens in Astro page frontmatter, not an API route: [`src/pages/patterns/[id].astro:19-26`](../../../src/pages/patterns/%5Bid%5D.astro) and [`src/pages/patterns/[id]/print.astro:15-22`](../../../src/pages/patterns/%5Bid%5D/print.astro).
- None of these handlers compare `pattern.user_id` to `locals.user.id`. Each queries with only `.eq("id", id)` and lets RLS filter the result; `PATCH` and both view routes have inline comments stating this is "by design" (`[id].ts:38-42`, `[id].astro:28-29`, `print.astro:24`) — a cross-owner id lookup and a genuinely nonexistent id are **indistinguishable** at the app layer (both produce `PGRST116` / null → 404).
- `context.locals.user` ([`src/middleware.ts:9-16`](../../../src/middleware.ts)) is the raw Supabase `User` object; routes only check truthiness or use `.id` for inserts, never for an ownership comparison.
- Note: `PROTECTED_ROUTES = ["/patterns"]` (`middleware.ts:4`) does not match `/api/patterns` — the middleware's auth gate does not cover the API routes; each handler does its own independent `if (!user)` check.
- RLS policies ([`supabase/migrations/20260830140641_create_patterns_and_names.sql:88-101`](../../../supabase/migrations/20260830140641_create_patterns_and_names.sql)) are the entire enforcement layer: `patterns_select`/`patterns_insert`/`patterns_update` all require `user_id = auth.uid()`. There is no `authenticated` DELETE policy — deletion goes only through the `soft_delete_pattern` RPC.
- Existing coverage ([`supabase/tests/database/patterns_rls.test.sql:87-97`](../../../supabase/tests/database/patterns_rls.test.sql)) verifies cross-user isolation, but via raw SQL role-switching, not via the actual route handlers or HTTP status codes.
- Reusable scaffolding already exists from Phase 1: [`test/integration/helpers/test-user.ts`](../../../test/integration/helpers/test-user.ts) (`createTestUser`/`cleanupTestUser`) and [`test/integration/helpers/api-context.ts`](../../../test/integration/helpers/api-context.ts) (`signInTestUser`, `buildAuthenticatedContext`), used today by [`test/integration/patterns-round-trip.test.ts`](../../../test/integration/patterns-round-trip.test.ts). Nothing currently creates two users and calls `PATCH`/`DELETE` on the other's pattern id.

### Risk #4 — 4th pattern / slot-name desync under concurrent creates

- [`src/pages/api/patterns/index.ts` (POST, lines 8-52)](../../../src/pages/api/patterns/index.ts) does no app-level counting; it inserts with only `user_id`, `width`, `height` and lets a DB trigger assign `slot`/`seq`/`name`. It special-cases only Postgres error `KR001` (the trigger's cap-exceeded error, lines 41-49) — there is **no handling for `23505`** (unique-violation) anywhere in `src/` (confirmed via `grep -rn "23505|retry"`).
- The actual concurrency-safe mechanism is a **partial unique index**, not the trigger: `patterns_user_slot_live_uniq unique (user_id, slot) where deleted_at is null` (migration lines 54-56). The `patterns_before_insert` trigger (lines 222-260) computes the lowest free slot and raises `KR001` if none is free, but under READ COMMITTED two concurrent inserts can compute the *same* free slot — the partial unique index, not the trigger, rejects the loser with `23505`.
- `patterns_user_seq_uniq` (line 46) and `patterns_user_name_uniq` (line 49) close the equivalent races for `seq` and pool-name assignment (`pick_pattern_name`, lines 175-207).
- The original design plan ([`context/archive/2026-08-30-patterns-schema-rls/plan.md:298-302`](../../../context/archive/2026-08-30-patterns-schema-rls/plan.md)) explicitly assumed: *"the loser gets a unique violation the caller retries once."* **That retry does not exist in the current route code** — this is the concrete gap.
- Existing pgTAP coverage ([`supabase/tests/database/patterns_rls.test.sql:58-65, 131-155`](../../../supabase/tests/database/patterns_rls.test.sql)) only exercises **sequential** single-session inserts (a 4th insert after 3 sequential ones); no test opens two concurrent transactions against the same free slot/seq/name, so the `23505` path is entirely unexercised.
- `lessons.md` L-03 is unrelated (a seed-data authoring desync, not a concurrency issue) — the test-plan's citation of it is a tangential precedent only, not evidence about this mechanism.

### Risk #5 — Out-of-bounds grid/palette accepted because validation is client-side only

**Premise contradicted.** Validation is layered, not client-side-only:

1. **Zod (app layer)** — [`src/lib/patterns.ts`](../../../src/lib/patterns.ts): `createPatternSchema` (lines 4-7, width/height `min(20).max(100)`) used by `POST` ([`index.ts:15-21`](../../../src/pages/api/patterns/index.ts)); `savePatternSchema` (lines 18-26, palette `.max(30)`, grid values `.refine`'d against `palette.length`) used by `PATCH` ([`[id].ts:24-28`](../../../src/pages/api/patterns/%5Bid%5D.ts)). Every mutating route validates before touching Supabase.
2. **DB CHECK constraints (independent second layer)** — [`supabase/migrations/20260830140641_create_patterns_and_names.sql:34-42`](../../../supabase/migrations/20260830140641_create_patterns_and_names.sql): `patterns_width_range`, `patterns_height_range`, `patterns_palette_size`, `patterns_grid_length` — these fire even if the zod layer were bypassed (e.g., a direct RPC/REST call), returning Postgres `23514`. `PATCH`'s handler already documents this fallback (`[id].ts:41`).
3. Client-side HTML `min`/`max` attributes ([`src/components/patterns/PatternDashboard.tsx:78-103`](../../../src/components/patterns/PatternDashboard.tsx)) and `MAX_PALETTE_COLORS = 30` gating the UI ([`src/components/hooks/usePatternGrid.ts:5,81,86`](../../../src/components/hooks/usePatternGrid.ts)) **mirror** the server bounds; no client-only check was found without a matching server check.
4. pgTAP already covers all four CHECK constraints directly ([`supabase/tests/database/patterns_rls.test.sql:160-191`](../../../supabase/tests/database/patterns_rls.test.sql)).

**Actual gap**: no test exercises the **zod boundary at the HTTP layer** (e.g., POSTing width=101 and asserting a 400) — [`test/integration/patterns-round-trip.test.ts`](../../../test/integration/patterns-round-trip.test.ts) only exercises valid inputs. This is a coverage gap in the app-layer validation response, not a missing-validation gap.

### Risk #6 — Soft-deleted pattern remains reachable

**Premise contradicted.** Soft delete only happens via the `soft_delete_pattern` RPC ([`supabase/migrations/20260830140641_create_patterns_and_names.sql:285-312`](../../../supabase/migrations/20260830140641_create_patterns_and_names.sql)), and a direct client UPDATE cannot fake it — the `patterns_update` policy's `USING` clause requires `deleted_at is null` (line 100), so setting `deleted_at` would move the row out of its own post-update visibility and get rejected.

Every read path relies on the single, unconditional `patterns_select` policy (lines 88-90: `user_id = auth.uid() and deleted_at is null`) — there is no per-route filter to omit:
- List — [`src/pages/patterns.astro:15-20`](../../../src/pages/patterns.astro) (comment at lines 10-13 notes explicit RLS reliance)
- Get-by-id (editor) — [`src/pages/patterns/[id].astro:20-26`](../../../src/pages/patterns/%5Bid%5D.astro)
- Get-by-id (print) — [`src/pages/patterns/[id]/print.astro:16-22`](../../../src/pages/patterns/%5Bid%5D/print.astro)
- Update (PATCH) — [`src/pages/api/patterns/[id].ts:30-35`](../../../src/pages/api/patterns/%5Bid%5D.ts) (also blocked by the `patterns_update` `USING` clause)

No route uses a service-role client that would bypass RLS. pgTAP already proves the policy hides soft-deleted rows from their owner ([`patterns_rls.test.sql:122-127`](../../../supabase/tests/database/patterns_rls.test.sql)) and that a direct UPDATE can't fake a delete (lines 114-120).

**Actual gap**: no integration test exercises the real HTTP/page routes end-to-end after a soft-delete (create → soft-delete → assert `GET /patterns/:id`, `GET /patterns/:id/print`, `PATCH /api/patterns/:id` all return not-found) — only raw-SQL pgTAP covers the underlying policy.

## Code References

- `src/pages/api/patterns/[id].ts:8-52` — PATCH handler, no ownership check, relies on RLS + CHECK constraints
- `src/pages/api/patterns/[id].ts:54-90` — DELETE handler, delegates ownership to `soft_delete_pattern` RPC
- `src/pages/api/patterns/index.ts:8-52` — POST handler, no `23505` handling
- `src/pages/patterns/[id].astro:19-49` — editor view, RLS-only ownership
- `src/pages/patterns/[id]/print.astro:15-40` — print view, RLS-only ownership
- `src/middleware.ts:4,9-16` — `PROTECTED_ROUTES` (doesn't cover `/api/patterns`), `locals.user` shape
- `src/lib/patterns.ts:4-26` — `createPatternSchema`, `savePatternSchema` (zod bounds)
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:34-42` — CHECK constraints (width/height/palette/grid)
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:54-56` — `patterns_user_slot_live_uniq` partial unique index
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:88-101` — RLS policies (select/insert/update)
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:222-260` — `patterns_before_insert` trigger (slot/seq/name assignment, `KR001`)
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:285-312` — `soft_delete_pattern` RPC (`KR002`, `KR003`)
- `supabase/tests/database/patterns_rls.test.sql:58-65,87-97,107-134,160-191` — existing pgTAP coverage (sequential cap, cross-user isolation, soft-delete invisibility, CHECK constraints)
- `test/integration/helpers/test-user.ts`, `test/integration/helpers/api-context.ts` — reusable two-user integration scaffolding from Phase 1
- `test/integration/patterns-round-trip.test.ts` — existing reference pattern for calling route handlers in-process

## Architecture Insights

- **Ownership enforcement is centralized in RLS, not duplicated in route code.** This is a deliberate pattern (explicit inline comments at every call site), not an oversight — but it means the app layer has zero independent assertion of the ownership boundary. A regression in a single RLS policy would silently break authorization everywhere at once, with no app-level check to catch it.
- **Concurrency safety follows a two-part pattern throughout this schema**: a trigger/function computes the "obvious" answer for ergonomics (friendly error codes `KR001`/`KR002`/`KR003`), while a plain DB constraint (partial unique index or `unique` constraint) is the actual race-free backstop. The API layer currently only speaks the ergonomic layer's error codes, not the constraint layer's (`23505`), which is a real, actionable gap for Phase 2 to close in the route code itself (not just tests) if the plan decides the retry behavior described in the original design doc should actually be implemented.
- **Risks #5 and #6 as stated in `test-plan.md` don't match the code.** Per test-plan.md §1 principle #3, research is the ground truth when it disagrees with the plan's risk framing. Both risks' underlying *concerns* (bounds enforcement, soft-delete leakage) are legitimate things to have tests for, but the stated failure mechanism ("client-side only", "per-route filter forgotten") isn't what would actually break — the real gap in both cases is **HTTP-layer test coverage of an already-correct multi-layer defense**, not a missing defense. Phase 2's plan should target proving the existing defense holds through the real route surface, not chasing a validation/leakage bug that doesn't exist today.

## Historical Context (from prior changes)

- `context/archive/2026-08-30-patterns-schema-rls/plan.md:49-50,298-302,325-333` — original design rationale for the partial unique index over trigger-only counting, and the explicit (unimplemented) assumption of a client-side retry-once on `23505`.
- `context/foundation/lessons.md` L-03 — cited by test-plan.md as tangential precedent for Risk #4, but is actually about an unrelated seed-data authoring desync, not concurrency.
- `context/foundation/test-plan.md:56-61` (Risk Response Guidance table) — defined the "must challenge" framing this research validated or contradicted for each risk.

## Related Research

- `context/archive/testing-critical-path-coverage/research.md` (Phase 1) — established the integration-test harness and helpers reused here.

## Open Questions

- **Risks #5 and #6's stated premises don't hold.** Recommend `/10x-plan` (and, per the test-plan orchestrator's own backport convention already used for Risks #1 and #3 on 2026-09-12) a short correction to `test-plan.md`'s Risk Response Guidance table reframing what these two tests should actually prove — HTTP-layer coverage of existing multi-layer defenses, not closing a validation/leakage hole. Not made here, since `/10x-research` doesn't edit `test-plan.md`.
- **Risk #4's true gap has an implementation question, not just a test question**: should the plan add `23505` retry-once handling to `src/pages/api/patterns/index.ts` (matching the original design doc's assumption), or should the test only document/assert current (no-retry, surfaced-as-500-or-error) behavior? This decision belongs to `/10x-plan`.
