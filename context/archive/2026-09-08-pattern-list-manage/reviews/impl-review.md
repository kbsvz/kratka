<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pattern dashboard: list, create, and delete

- **Plan**: context/changes/pattern-list-manage/plan.md
- **Scope**: Phase 1 and Phase 2 (full plan)
- **Date**: 2026-09-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING (1 finding) |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — No in-flight guard on `confirmDelete` allows a double-fire on rapid double-click

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/usePatternList.ts:23-27
- **Detail**: `confirmDelete` reads `pendingDeleteId` from the hook's state and clears it via `setPendingDeleteId(null)`, but that clear isn't guaranteed to be visible before a second synthetic click on the same `AlertDialogAction` fires (e.g. an accidental fast double-click before the dialog closes). A second invocation could send a second `DELETE` request for the same id. Low real-world impact — the second request either 404s (already treated as success, no error shown) or hits `soft_delete_pattern`, which is itself idempotent (raises `KR002` if already deleted) — but it's an unguarded race worth closing.
- **Fix**: Add an `isDeletingRef` (or check `pendingDeleteId`/a small in-flight flag) at the top of `confirmDelete` and return early if a delete for the same id is already in flight.
- **Decision**: FIXED — added `inFlightIdRef` guard in `usePatternList.ts` (cleared in a `finally` block).

### F2 — "Sign in" button addition isn't reflected in plan.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/patterns/PatternDashboard.tsx:141-150, src/components/hooks/usePatternList.ts (sessionExpired field)
- **Detail**: Mid-implementation, a "Sign in" link (`/auth/signin`) was added next to the session-expired delete error, driven by a new `sessionExpired` flag on `usePatternList`. This is a legitimate, user-requested UX refinement made during manual verification of Phase 2 — not undocumented drift — but the plan text (Phase 2's "Changes Required" and Success Criteria) was never updated to describe it, so a future reader of plan.md alone wouldn't know this exists.
- **Fix**: Append a short addendum note under Phase 2 (or a `## Notes` section) documenting the `sessionExpired` field and the Sign-in button, so the plan stays an accurate record.
- **Decision**: FIXED — added "Addendum: change 5" under Phase 2 in `plan.md`.

### F3 — `usePatternList`'s doc comment overclaims naming parity with `useUnsavedChangesGuard`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/hooks/usePatternList.ts:5-8
- **Detail**: The doc comment says the hook "mirrors `useUnsavedChangesGuard`'s attempt→pending→confirm/cancel naming," but the entry point is `requestDelete`, not `attemptDelete`. The state-machine *shape* (idle → pending → confirm/cancel) does match; only the verb differs. Harmless functionally, but the comment is a small inaccuracy for the next reader trying to use it as a naming reference.
- **Fix**: Reword the comment to "mirrors the same attempt→pending→confirm/cancel *state-machine shape*" rather than implying identical naming (cheaper than renaming `requestDelete`, which is already used consistently in `PatternDashboard.tsx`).
- **Decision**: FIXED — reworded the doc comment in `usePatternList.ts`.

### F4 — `DELETE` route has no uuid-shape pre-check, unlike the page-level guard added in Phase 1

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/patterns/[id].ts:70
- **Detail**: `src/pages/editor/[id].astro` validates `id` against `UUID_RE` before querying (Phase 1's change 5), but the new `DELETE` handler passes `id` straight to `soft_delete_pattern` with no equivalent pre-check. A malformed id there falls through to the generic `400 "Delete failed"` branch rather than a `404`. Low real-world exposure — the UI only ever calls this route with a real listed pattern's id — but the two routes now disagree on how they classify "obviously not a real id."
- **Fix**: Optional — reuse the same `UUID_RE` check before the RPC call for consistent 404 semantics; not required since exposure is minimal and no plan criterion covers this route's malformed-input handling.
- **Decision**: SKIPPED — minimal real exposure, not worth fixing now.

---

**Re-review (2026-09-09, same day)**: after F1-F4 were triaged above, three more ad-hoc
fixes landed (uncommitted): the F1 in-flight-guard fix itself, relocating "Sign out" into
`PatternDashboard` so it hides when `sessionExpired` is true, and disabling every row's
"Delete" button under the same condition. Two sub-agents re-verified the current diff
(`usePatternList.ts`, `PatternDashboard.tsx`, `dashboard.astro`) against stated intent: all
three MATCH exactly, no DRIFT/MISSING/EXTRA. The in-flight guard is correctly cleared in a
`finally` covering every exit path (401, 404, thrown error, success) — a retry after
rollback is never permanently blocked. The relocated sign-out form preserves its exact
`POST /api/auth/signout` mechanics (uninterrupted native form). `dashboard.astro` was left
clean — no orphaned imports or dead code. Re-ran `npm run lint`, `npx astro check`,
`npm run build` — all pass. One new finding surfaced (F5).

### F5 — Two newest ad-hoc fixes aren't reflected in plan.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/patterns/PatternDashboard.tsx:129 (disabled Delete), :156-165 (relocated Sign out)
- **Detail**: Like F2, these are legitimate user-requested refinements, not undocumented drift — but `plan.md`'s Phase 2 addendum (added for F2/the "Sign in" button) doesn't yet mention the sign-out relocation or the disabled-Delete-buttons behavior.
- **Fix**: Extend the existing Phase 2 addendum (change 5) to also cover: `PatternDashboard` now renders the "Sign out" form (moved from `dashboard.astro`) hidden when `sessionExpired`, and each row's Delete button is `disabled={sessionExpired}`.
- **Decision**: FIXED — extended change 5's addendum in `plan.md` to cover the sign-out relocation, disabled Delete buttons, and the in-flight-guard, renamed to "session-expiry UX."
