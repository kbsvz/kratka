<!-- PLAN-REVIEW-REPORT -->
# Plan Review: My Patterns + Pattern Editor Redesign

- **Plan**: context/changes/patterns-page-ui-improvements/plan.md
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | FAIL |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

9/9 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Phase 2 leaves a duplicate sign-out button

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — My Patterns page redesign
- **Detail**: Phase 1 adds a static `AppHeader` with its own always-visible sign-out button. But `PatternDashboard.tsx:156-166` already renders its own conditional sign-out form (`{!sessionExpired && (...)}`), with a docstring (`PatternDashboard.tsx:31-33`) explaining why it lives there. Phase 2's three "Changes Required" items never mention removing this block, so the redesigned page would end up with two sign-out buttons.
- **Fix**: Add a fourth Phase 2 change item: remove the sign-out `<form>` block and its now-stale docstring rationale from `PatternDashboard.tsx`. `sessionExpired` itself stays — it's still read by the delete-error banner's "Sign in" link (`PatternDashboard.tsx:148-152`) — only the dedicated sign-out form is redundant now.
- **Decision**: FIXED — added Phase 2 item 4 (remove redundant sign-out) and a matching manual-verification bullet (2.5) in `plan.md`.

### F2 — New "Paint" tool button's color-recovery behavior is unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3, item 5 — Add a Tools control (Paint/Erase)
- **Detail**: `Tool` (`usePatternGrid.ts:9`) is `{type:"paint", colorIndex} | {type:"erase"}` — there is no "paint tool selected, no color chosen" state, and switching to `erase` discards whatever `colorIndex` was active. The plan's Phase 3 text says the new Paint button "selects the currently-active color (or the first palette color if none is selected)" but doesn't say what happens when the current tool is `erase` — whether to remember the last-used paint color or reset to `palette[0]`.
- **Fix A ⭐ Recommended**: Always fall back to `palette[0]` when Paint is clicked while erase is active
  - Strength: No new state to track; one-line implementation (`tool.type === "paint" ? tool.colorIndex : 1`).
  - Tradeoff: A user who had color 4 selected before switching to erase gets color 1 back, not color 4 — a minor surprise, not a functional bug.
  - Confidence: HIGH — matches the "no persisted state beyond what's already in `Tool`" shape the hook already uses.
  - Blind spot: Not verified against the mockup's actual interaction (the mockup is a static HTML snapshot, doesn't demonstrate the erase→paint recovery case).
- **Fix B**: Track `lastPaintColorIndex` separately in `usePatternGrid` and restore it
  - Strength: Matches likely user expectation — "Paint" returns to whatever color they were last using.
  - Tradeoff: Adds new state to a hook this plan otherwise keeps untouched — contradicts Phase 3 item 5's own "no changes to Tool type or selectColor/selectErase signatures" constraint.
  - Confidence: MEDIUM — reasonable UX guess, unverified with the user.
  - Blind spot: Whether this is worth extra state given it's a cosmetic-only redesign change, not a requested feature.
- **Decision**: ACCEPTED — left to the implementer's judgment during Phase 3.

### F3 — Route rename leaves stale docs (lessons.md L-02)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, item 4 — Rename the route
- **Detail**: `lessons.md` L-02 explicitly warns that docs asserting "X" go stale silently and directs a sweep of `README.md`, `context/foundation/*.md`, `context/deployment/*.md` before closing a change. `README.md:151` lists `/dashboard` as a Protected route in its routes table, and `context/deployment/deploy-plan.md:119,178` both reference `/dashboard` as the (soon to be wrong) protected-route name. Phase 1's file list doesn't include either doc.
- **Fix**: Add to Phase 1's route-rename item: update `README.md`'s routes table (`/dashboard` → `/patterns`) and the two `/dashboard` mentions in `context/deployment/deploy-plan.md` to `/patterns`.
- **Decision**: FIXED — added `README.md` and `deploy-plan.md` to Phase 1's file list, Contract, Automated Verification grep, and a new manual-verification bullet (1.8) in `plan.md`.
