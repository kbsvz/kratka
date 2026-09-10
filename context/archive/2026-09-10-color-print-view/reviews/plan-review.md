<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Color Print View Implementation Plan

- **Plan**: context/changes/color-print-view/plan.md
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: REVISE
- **Findings**: 2 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | WARNING |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | FAIL |

## Grounding

4/5 paths ✓ (1 critical miss — see F2). Both FAILs trace to the same root cause: this plan was drafted without visibility into `patterns-page-ui-improvements`, a redesign that finished and archived earlier today. Every fix is a mechanical path/route correction, not an architectural flaw — hence REVISE rather than RETHINK despite two FAIL dimensions.

## Findings

### F1 — Plan redirects to a route that no longer exists

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Current State Analysis; Phase 1 item 2 Contract; Manual Verification 1.5; Testing Strategy step 5
- **Detail**: The plan says not-found/not-owned patterns redirect to `/dashboard`. `/dashboard` was renamed to `/patterns` earlier today by `patterns-page-ui-improvements` (now archived) — `src/pages/dashboard.astro` no longer exists and `/dashboard` 404s. `src/pages/editor/[id].astro:44` confirms the current redirect target is `/patterns`.
- **Fix**: Replace every `/dashboard` reference in the plan with `/patterns`: Current State Analysis (2 mentions), Phase 1 item 2's Contract line, Manual Verification 1.5, and Testing Strategy step 5.
- **Decision**: FIXED — replaced all `/dashboard` references (Current State Analysis, Phase 1 item 2 Contract, Manual Verification 1.5, Progress 1.5) with `/patterns` in `plan.md`. Testing Strategy step 5 didn't literally name the route, no edit needed there.

### F2 — Phase 2 targets a file path that no longer exists

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 item 2 — "Dashboard entry point"
- **Detail**: Phase 2 item 2 targets `src/components/dashboard/PatternDashboard.tsx`, which doesn't exist — the same redesign moved it to `src/components/patterns/PatternDashboard.tsx`. The cited line reference (`:120`) is also stale; the editor-link pattern is now at line 156.
- **Fix**: Update the file path to `src/components/patterns/PatternDashboard.tsx` and the line citation to line 156.
- **Decision**: FIXED — updated the file path and line citation (both the Phase 2 item and the References section) in `plan.md`.

### F3 — The "reserved Actions-column slot" no longer exists

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 2 item 2 — "Dashboard entry point"
- **Detail**: The plan's premise is that S-02 left an Actions column with room for a future Print link alongside Delete. That table no longer exists: the redesign collapsed it to a single untitled column containing only a low-emphasis red "Delete" text link (`PatternDashboard.tsx:148,168-178`). There is no multi-action slot — where Print actually goes is now an open design question.
- **Fix A ⭐ Recommended**: Add "Print" as a second text link in the same untitled column
  - Strength: Keeps the table's column count and the "no new columns" scope boundary intact; matches the existing low-emphasis-text-action visual language exactly.
  - Tradeoff: Two actions crammed into one narrow right-aligned cell — fine at 2, wouldn't scale to a 3rd.
  - Confidence: HIGH — directly mirrors the pattern already shipped for Delete in the same column.
  - Blind spot: Exact visual spacing/order (Print before or after Delete) not specified.
- **Fix B**: Add a second untitled column dedicated to Print
  - Strength: Cleaner separation between a destructive action (Delete) and a safe one (Print); easier to extend later.
  - Tradeoff: Widens the table by a column the mockup wasn't designed with; more layout risk on narrow viewports.
  - Confidence: MEDIUM — no mockup evidence either way.
  - Blind spot: Whether the redesign's mobile breakpoint (which already hides one table column) has room for a second.
- **Decision**: FIXED via Fix A — Phase 2 item 2's Contract now specifies Print as a sibling text link in the same untitled TableCell as Delete ("Print · Delete"), styled `text-kratka-green` to distinguish it from Delete's `text-kratka-red`, no new column.

### F4 — Middleware step is already satisfied

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 item 3 — "Protected routes"
- **Detail**: `src/middleware.ts:4` already reads `PROTECTED_ROUTES = ["/patterns", "/editor"]`, added by the same concurrent redesign. Since the guard matches via `startsWith`, `/patterns/<id>/print` is already covered — this step is a no-op as written.
- **Fix**: Drop Phase 1 item 3, or reword it to "Verify — no change needed."
- **Decision**: FIXED — reworded Phase 1 item 3 to "verify only," and refreshed the two related stale Current State Analysis bullets (PROTECTED_ROUTES value, Actions-column claim) for consistency with F1/F3.
