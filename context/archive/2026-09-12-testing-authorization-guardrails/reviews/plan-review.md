<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Authorization & Business-Rule Guardrails

- **Plan**: `context/changes/testing-authorization-guardrails/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-12
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 2 critical (1 withdrawn), 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict (at review) | After fixes |
|-----------|---------------------|-------------|
| End-State Alignment | FAIL | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | FAIL | PASS |
| Plan Completeness | WARNING | PASS |

## Grounding

9/9 paths ✓ (`src/lib/patternQueries.ts` new, as planned), 6/6 symbols ✓, brief↔plan ✓.

Not findings, verified: the `- [ ]` checkboxes in Success Criteria blocks match every archived plan in this repo and parse fine; `src/lib/patternQueries.ts` as a new module is correct — `src/lib/patterns.ts` is a dependency-free zod module imported by both API routes.

## Findings

### F1 — Phase 4's test can pass without ever exercising the retry

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 4 — Risk #4, concurrent-create test
- **Detail**: With one free slot, the loser reaches the cap message either via `23505` → retry → `KR001`, or via `KR001` on the first attempt (retry never entered) — the trigger recomputes `min` free slot per attempt (`supabase/migrations/20260830140641_create_patterns_and_names.sql:222-244`). Both paths produce an identical `Location` header, so the assertion passes whether or not the Phase 4 production change exists. The case the retry actually fixes — a race with slots still free — was never asserted, and Desired End State didn't describe it.
- **Fix A ⭐ Recommended**: Add a below-cap race case as the primary assertion (seed 1 pattern, race two POSTs, assert both succeed with distinct slots); keep the at-cap case as secondary.
  - Strength: Fails when the fix is reverted — it discriminates.
  - Tradeoff: Two race scenarios instead of one.
  - Confidence: HIGH — trigger recomputes slot/seq/name per attempt.
  - Blind spot: Whether local Supabase reliably interleaves to produce `23505`.
- **Fix B**: Pre-occupy the slot via admin client; single POST must retry onto the next slot.
  - Strength: Deterministic, zero flakiness.
  - Tradeoff: Not a real race; weaker signal for Risk #4 as stated.
  - Confidence: MEDIUM.
  - Blind spot: Doesn't cover the seq/name unique constraints.
- **Decision**: FIXED via Fix A — Phase 4 contract rewritten with both race cases plus the forced-collision fallback; Desired End State bullet 2 now states the below-cap property.

### F2 — Risk #5's palette-index bound (WITHDRAWN)

- **Severity**: ❌ CRITICAL (as reported)
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 5, bullet 3
- **Detail**: Reported as an off-by-one in `src/lib/patterns.ts:23` (`value <= data.palette.length`). Incorrect — grid values are 1-based with `0` meaning an empty cell (`src/lib/patternEstimator.ts:27-28`, `src/components/editor/PatternEditor.tsx:118`, `src/pages/patterns/[id]/print.astro:67` all read `palette[value - 1]` and skip `value === 0`). `<=` is the correct bound; the plan's "grid value indexing past `palette.length`" means `palette.length + 1`, which zod rejects.
- **Decision**: DISMISSED — reviewer error, no plan or code change.

### F3 — Four new test files turn on vitest file parallelism for the first time

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phases 2–5 (every "Full suite passes: `npm test`" criterion)
- **Detail**: `vitest.config.ts` sets no `pool`, `fileParallelism`, `sequence` or `poolOptions`, so files run in parallel by default. Latent today with one integration file; this plan adds four more against the same local Postgres, including Phase 4's timing-sensitive race test.
- **Fix**: Add a Phase 2 sub-step setting `test.fileParallelism: false` with a comment naming the shared-DB reason.
- **Decision**: FIXED — Phase 2 gained sub-step 2 ("Serialize integration test files"); Progress 2.2 annotated.

### F4 — Phase 1's automated criteria don't cover Phase 1's own named risk

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria
- **Detail**: The brief names extraction infidelity as Phase 1's key risk, but typecheck, lint and "existing tests still pass" can all pass with a broken extraction — the existing test never calls the new functions.
- **Fix**: Add a happy-path assertion calling `getPatternForOwner` and `getPatternListForOwner`.
- **Decision**: FIXED — folded into Phase 1 sub-step 3 with F5.

### F5 — Third copy of the extracted query left in place

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — "Wire the pages to the extracted functions"
- **Detail**: `test/integration/patterns-round-trip.test.ts:69-75` holds a third copy of the select, with a comment citing `src/pages/patterns/[id].astro:20-26` — a reference the extraction invalidates.
- **Fix**: Add the file to Phase 1's rewire list.
- **Decision**: FIXED — Phase 1 sub-step 3 rewires it to `getPatternForOwner` and adds the `getPatternListForOwner` assertion; Progress 1.3 retitled.

### F6 — Retry exhaustion can show a factually wrong cap message

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 4 — "Retry-once on unique-violation"
- **Detail**: With max 2 attempts, a 3+-way race can exhaust a caller while slots are free, showing "You already have 3 patterns" to someone with one. Accepted tradeoff, but undocumented.
- **Fix**: A comment at the exhaustion branch plus a `test-plan.md` §7 negative-space bullet.
- **Decision**: FIXED — added to Phase 4's contract and Phase 6's §7 contract.

### F7 — "Print" counted as a distinct tested surface

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State bullet 4; brief's decision table
- **Detail**: After Phase 1 there are two functions — print and get-by-id share `getPatternForOwner`. Phase 3's contract is correct; only the summaries overclaimed, and Phase 6's §6.3 write-up would inherit it.
- **Fix**: Reword to "list and get-by-id (shared by the editor and print routes)".
- **Decision**: FIXED — Desired End State, brief decision table, and brief scope list all reworded.
