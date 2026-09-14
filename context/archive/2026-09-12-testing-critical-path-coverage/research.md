---
date: 2026-09-12T12:41:31Z
researcher: Claude (10x-research)
git_commit: c36910d2e363d0b5dffe0a217199a4aef7226ba0
branch: create-test-plan
repository: kratka
topic: "Ground rollout Phase 1 of test-plan.md: save/reload round-trip (Risk #1) and estimator correctness (Risk #3)"
tags: [research, codebase, patterns-api, patternEstimator, save-reload, test-plan]
status: complete
last_updated: 2026-09-12
last_updated_by: Claude (10x-research)
---

# Research: Grounding test-plan Phase 1 — save/reload round-trip and estimator correctness

**Date**: 2026-09-12T12:41:31Z
**Researcher**: Claude (10x-research)
**Git Commit**: c36910d2e363d0b5dffe0a217199a4aef7226ba0
**Branch**: create-test-plan
**Repository**: kratka

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Bootstrap runner + critical-path coverage"), covering Risk #1 (save/reload round-trip data corruption) and Risk #3 (thread-count/time estimator math mismatch). Verify the plan's Risk Response Guidance, locate the real failure paths in code, find existing tests, identify the cheapest useful test layer, and flag any speculative risk or misleading hot-spot evidence.

## Summary

Both risks are real and actionable, and the response guidance in `test-plan.md` §2 holds up — with one correction and one sharpened finding:

- **Risk #3 (estimator) is grounded and slightly re-scoped.** The code (`src/lib/patternEstimator.ts`) matches the PRD's stated constants (7mm/stitch, 150 stitches/hour) exactly. There is zero test coverage today. `print.astro` is the sole consumer, so the cheapest layer is a pure unit test against `estimatePattern`/`formatDuration`, no I/O needed.
- **Risk #1 (save/reload) is grounded and more concrete than the plan assumed.** There is no GET API route — reload happens via a direct Supabase query inside an Astro page (`src/pages/patterns/[id].astro`), and critically, **that reload path has zero schema validation** — it casts the DB's `Json` columns straight to `PatternPalette`/`PatternGrid` with `as unknown as`, unlike every write path which validates through zod. The most concrete failure mode isn't "save corrupts data" (the DB CHECK constraints already guard the write) — it's **"a malformed/legacy row silently produces a wrong-looking grid on reopen because nothing revalidates it."** `usePatternGrid.ts` then does `Uint8Array.from(pattern.grid)`, which does not throw on a length mismatch — it silently truncates/pads.

No speculative risks found; both are real, currently-unguarded behaviors, not hypothetical safeguards.

## Detailed Findings

### Risk #1 — Save/reload round-trip

**Write path (`PATCH /api/patterns/[id]`):**
- [src/pages/api/patterns/[id].ts:24-28](src/pages/api/patterns/%5Bid%5D.ts) reads a JSON body and validates with `savePatternSchema`.
- `src/lib/patterns.ts:18-26`:
  ```ts
  export const savePatternSchema = z
    .object({
      palette: z.array(hexColor).max(30),
      grid: z.array(z.number().int().min(0)),
    })
    .refine((data) => data.grid.every((value) => value <= data.palette.length), {...});
  ```
  This schema deliberately does **not** check `grid.length === width * height` (comment at `patterns.ts:14-16`) — that invariant is left entirely to the DB CHECK constraint.
- [src/pages/api/patterns/[id].ts:30-35](src/pages/api/patterns/%5Bid%5D.ts): `supabase.from("patterns").update({ palette, grid }).eq("id", id)`.

**Create path (`POST /api/patterns`):**
- `src/pages/api/patterns/index.ts:14-21,31-39` — only `user_id`, `width`, `height` are inserted; `palette`/`grid` start at their column defaults. `createPatternSchema` (`src/lib/patterns.ts:4-7`) validates width/height bounds (20-100) via `z.coerce.number().int().min(20).max(100)`.

**Reload path — no GET API route exists.** Reload happens server-side directly in the Astro page:
- `src/pages/patterns/[id].astro:20-26`: `supabase.from("patterns").select("id, name, width, height, palette, grid").eq("id", id).single()`.
- `src/pages/patterns/[id].astro:30-36`: **casts `data.palette`/`data.grid` with `as unknown as` — no zod re-validation on reload**, unlike every write path.

**Client-side transform (`src/components/hooks/usePatternGrid.ts`):**
- Line 71-73 (load): `Uint8Array.from(pattern.grid)`; if `grid` is empty, allocates a fresh `Uint8Array(width * height)`. This call **does not throw** if `pattern.grid.length` doesn't match `width * height` — it silently produces a `Uint8Array` of whatever length `pattern.grid` actually was, which downstream indexing code assumes is `width * height`.
- Line 143-165 (save): `Array.from(gridRef.current)` turned back into a plain array and POSTed as `{ palette, grid }`. Width/height are never re-sent on save — they're immutable post-creation from the client's perspective.

**DB invariants (`supabase/migrations/20260830140641_create_patterns_and_names.sql`):**
```
34:  constraint patterns_width_range  check (width between 20 and 100),
35:  constraint patterns_height_range check (height between 20 and 100),
36:  constraint patterns_palette_size check (jsonb_array_length(palette) <= 30),
39-42: constraint patterns_grid_length check (
         jsonb_array_length(grid) = 0
         or jsonb_array_length(grid) = width * height
       ),
```
The `patterns_before_update` trigger (lines 326-340) pins `user_id`, `seq`, `slot`, `name`, `created_at` on every UPDATE — a save can't corrupt those — but does not itself validate grid/palette consistency beyond the CHECK constraints.

**Where response guidance was correct vs. needs sharpening:**
- ✅ "Grid encoding format, save/load API contract, partial-write handling" — all grounded above.
- ⚠️ Sharpen: the round-trip risk is not symmetric. The **write** side is reasonably guarded (zod + DB CHECK + refine on palette-index bounds). The **read** side (`[id].astro`) has no equivalent guard. A test that only exercises save→reload through the intended UI flow may never hit this gap, because a well-formed save always produces a well-formed row. The gap only bites on a row that became malformed some other way (a future migration, a manual edit, a bug in a route that bypasses `savePatternSchema`). A test that seeds a row directly (bypassing the API) with a mismatched grid length, then asserts what the reload path (`[id].astro` load logic / `usePatternGrid`) actually does with it, is the test that gives real signal here — a pure "save via API, then GET via API" test would not catch this class of bug because there is no GET API route to even test against; the reload is entirely server-rendered.
- One additional concrete gap not previously named: **no DB-level constraint checks that grid values reference a valid palette index** (only the API's zod `.refine` does). If any future write path bypasses `savePatternSchema`, an inconsistent grid/palette pair could be persisted with no DB guard.

**Existing tests:** none. `supabase/tests/database/patterns_rls.test.sql` covers RLS, the 3-pattern cap, soft delete, and the `patterns_grid_length`/`patterns_palette_size` CHECK constraints via raw SQL inserts (lines 171-191) — but nothing exercises the API routes, `usePatternGrid`, or the `[id].astro` load path. No JS/TS test runner is configured (`package.json` has no `test` script).

**Recommended cheapest layer:** integration test hitting the real API routes (`POST`/`PATCH /api/patterns/[id]`) against a local Supabase instance (matching the existing pgTAP convention of testing against a real DB, not mocks) for the write-side round-trip, plus a narrower test seeding a deliberately malformed row directly via the Supabase client and asserting what the reload path does with it (to close the read-side gap this research surfaced). The write-side round-trip does not need a browser — it's server-side API + DB. The read-side gap, if it also needs to touch `usePatternGrid`'s `Uint8Array` behavior, is a plain unit test (no I/O) once given the malformed input array directly.

### Risk #3 — Estimator correctness

- `src/lib/patternEstimator.ts:4-5,34-35,40`: `MM_PER_STITCH = 7`, `STITCHES_PER_HOUR = 150`; `threadMm = MM_PER_STITCH * cellCount`, `threadCm = threadMm / 10`; `totalHours = totalFilledCells / STITCHES_PER_HOUR`.
- `context/foundation/prd.md:181-183` ("## Business Logic"): "7 mm of thread per stitch (thread length in mm = 7 × cell count, converted to cm) and 150 stitches per hour" — **matches code exactly.**
  - **Action for test-plan §2:** 
- Thread length is rendered rounded up per color via `Math.ceil` in `src/pages/patterns/[id]/print.astro:176`; `formatDuration(estimate.totalHours)` is called at `print.astro:184`. `estimatePattern` is called at `print.astro:42`.
- Zero-total edge case: an empty/never-painted grid (`grid.length === 0`) yields a blank grid, empty legend, zero time, no error — documented both in `patternEstimator.ts`'s doc comment (lines 19-23) and `context/archive/2026-09-10-color-print-view/plan.md:397`.
- No large-total or hours-rounding edge case (e.g., a duration that rounds to exactly 60 minutes) is discussed anywhere in the archive — worth a test case since `formatDuration`'s `Math.round(hours * 60)` could produce `h=1, m=0` from an input just under 1 hour, which the existing `if (m === 0) return "${h}h"` branch already handles, but is unverified.
- **Single consumer confirmed:** repo-wide search for `estimatePattern`/`formatDuration` usage returns exactly `patternEstimator.ts` (definition) and `print.astro` (sole consumer) — no duplicate or divergent calculation exists elsewhere.
- **Existing tests:** none. No file references `estimatePattern` or `formatDuration` in a test context.

**Recommended cheapest layer:** pure unit test against `estimatePattern` and `formatDuration` directly — no DB, no HTTP, no rendering. Hand-compute expected thread-cm and duration values from a small fixed grid/palette using the 7mm/150-stitches constants (never copy the implementation's own output as the expected value — that's the oracle-problem anti-pattern the test-plan already names). One additional boundary test at the `print.astro` render (rounding/`Math.ceil` display) closes the loop to the actual user-visible surface, but the core math correctness is fully unit-testable.

## Code References

- `src/pages/api/patterns/[id].ts:24-35` — PATCH handler, save validation and DB write
- `src/pages/api/patterns/index.ts:14-21,31-39` — POST handler, create validation
- `src/lib/patterns.ts:4-26` — `createPatternSchema`, `savePatternSchema` (zod)
- `src/pages/patterns/[id].astro:20-36` — reload query and unvalidated cast
- `src/components/hooks/usePatternGrid.ts:71-73,143-165` — client load/save transform (`Uint8Array` <-> array)
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:34-42,326-340` — CHECK constraints and update trigger
- `supabase/tests/database/patterns_rls.test.sql:171-191` — existing CHECK-constraint pgTAP coverage
- `src/lib/patternEstimator.ts:1-53` — `estimatePattern`, `formatDuration`, constants
- `src/pages/patterns/[id]/print.astro:42,176,184` — sole consumer of the estimator
- `context/foundation/prd.md:181-183` — authoritative Business Logic constants
- `context/archive/2026-09-10-color-print-view/plan.md:31-34,258-262,278-283,397` — history of the constant change and zero-total edge case

## Architecture Insights

- The codebase consistently pushes structural invariants (bounds, lengths) down to Postgres CHECK constraints rather than duplicating them in TypeScript — this is a deliberate pattern (see `patterns.ts:14-16`'s comment) but it means anything that reads data back out **without** going through the same validated path (like `[id].astro`'s direct cast) has no equivalent guard.
- Business-logic constants are defined once in `patternEstimator.ts` and consumed from exactly one place (`print.astro`) — there's no duplication risk in code, only a documentation-currency risk (roadmap vs. PRD/code).

## Historical Context (from prior changes)

- `context/archive/2026-09-10-color-print-view/plan.md` — full history of the estimator constant change (45cm → 7mm) and the zero-total edge case decision.
- `context/archive/2026-08-31-editor-draw-save/` — original implementation of `usePatternGrid` and the save flow (not re-read in full this pass; the current code was read directly).
- `context/archive/2026-08-30-patterns-schema-rls/plan.md` — original CHECK constraint design rationale.

## Related Research

None prior — this is the first `/10x-research` pass for this change.

## Open Questions

- Should `[id].astro`'s reload path gain a zod re-validation step (matching the write paths), or is the CHECK-constraint-guarantees-at-write-time argument (i.e., a row can never actually become malformed through normal use) sufficient to leave it as pure risk-surface documentation without a code fix in this rollout phase? This is a `/10x-plan` scoping question, not a blocker to writing tests — a test can characterize current behavior (silent truncation/pad) either as a documented gap or as something the plan chooses to fix.
- No large-total/hours-boundary test case exists for `formatDuration` — worth including in the phase's test list even though no bug is suspected, since it's an untested boundary in a zero-coverage function.
