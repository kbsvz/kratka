<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Patterns Schema + Owner-Scoped RLS

- **Plan**: `context/changes/patterns-schema-rls/plan.md`
- **Scope**: Full plan — Phases 1–4 of 4
- **Date**: 2026-08-30
- **Verdict**: APPROVED — triaged 2026-08-30: F1 fixed, F2 fixed, F3 accepted
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING → PASS after F1 fix |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Scope

12 files across 5 commits (`b726a4a`, `d8ce765`, `fa76eed`, `0be70a2`, `05a74cc`).
Progress: 20/20 complete. `change.md` status: `implemented`.
No `context/foundation/lessons.md` present — prior-rule check skipped.

Sub-agents were not used; the diff is small enough to review directly.

## Success criteria re-verified

| Command | Result |
|---|---|
| `npx supabase test db` | PASS — 27/27 |
| `npx astro check` | 0 errors |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |

Manual items 1.3–1.5, 2.3–2.4, 3.5, 4.4–4.6 are all `[x]`. Each has observable
evidence in the session transcript (schema dump, full TAP assertion list, mutation
test, hosted REST probes, hosted transaction-rollback script). No rubber-stamping
identified.

## Scope guardrails ("What We're NOT Doing")

All respected: no `src/pages/api/patterns/*`, no `src/lib/services/`, `zod` absent
and `package.json` unchanged, `src/middleware.ts` unchanged, no purge or restore
function (only a comment referencing a future purge), no tiled grid encoding.

## Findings

### F1 — Unplanned lint/format config changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `eslint.config.js:72`, `.prettierignore`
- **Detail**: Phase 3 added an ESLint `ignores` entry and a new `.prettierignore`,
  neither of which appears in the plan's "Changes Required". The reason was sound —
  the generated `database.types.ts` produced 126 prettier errors, and formatting a
  machine-generated file would be undone on every regeneration — and it was reported
  at the time. But the plan was never updated, so anyone diffing plan against
  implementation later sees two unexplained files.
- **Fix**: Add both files to the Phase 3 "Changes Required" section with the
  regeneration-churn rationale.
- **Decision**: FIXED — documented as Phase 3 item 3; the typed-client item renumbered to 4.

### F2 — `pick_pattern_name` declared STABLE but is volatile

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260830140641_create_patterns_and_names.sql:191`
- **Detail**: The function is declared `stable` but calls `random()`, so it can
  return different results for identical inputs within one statement — the
  definition of VOLATILE. PostgreSQL does not enforce volatility labels, so this is
  inaccurate metadata rather than a defect.
  Two hypotheses were tested and **both disproven**: (a) a multi-row INSERT taking
  the `seq > 3` branch might assign duplicate names — five trials produced three
  distinct names each time, because BEFORE-row triggers see rows inserted earlier in
  the same statement; (b) the planner might cache the result across rows — calling
  it five times in one query returned five distinct values. No observable impact
  today. The risk is latent: a future query shape could legitimately rely on STABLE
  semantics. The `unique (user_id, name)` constraint would surface any collision
  loudly rather than silently.
- **Fix**: Drop the `stable` keyword so it defaults to VOLATILE, which is the
  accurate declaration.
- **Decision**: FIXED — corrected in a NEW migration
  (`20260830200500_fix_pick_pattern_name_volatility.sql`) rather than by editing the
  original, which was already applied to hosted. Applied locally and pushed; 27/27
  tests still pass and grants survived the CREATE OR REPLACE.

### F3 — `width`/`height` immutability enforced only in TypeScript

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: `supabase/migrations/20260830140641_create_patterns_and_names.sql:311`
- **Detail**: The change's stated philosophy is structural enforcement — the cap is a
  unique index rather than a count, grid sizing is a CHECK rather than app
  discipline, name immutability is a trigger plus a constraint. But "no grid resize
  after creation" (a PRD Non-Goal) is enforced only by the `PatternUpdate` DTO
  omitting `width`/`height`. The BEFORE UPDATE trigger pins `user_id`, `seq`, `slot`,
  `name` and `created_at`, but not the dimensions. A caller bypassing the DTO could
  resize a pattern. Not a security issue and not data corruption — the grid-length
  CHECK still forces `grid` and dimensions to agree — but it is the one place the
  change relies on discipline where it elsewhere relies on structure.
- **Fix A ⭐ Recommended**: Leave as is; revisit if grid resize becomes a real
  requirement.
  - Strength: Resize is plausibly a *future feature* (the parked 1000×1000 work), so
    pinning now would need reverting later; the DTO already blocks it for all MVP
    callers, and no endpoint exists that could bypass it.
  - Tradeoff: An inconsistency with the change's own philosophy, undocumented.
  - Confidence: HIGH — no code path today can bypass the DTO.
  - Blind spot: S-01's endpoint is not written yet; if it mass-assigns, the DTO is
    bypassable.
- **Fix B**: Pin `width`/`height` in the BEFORE UPDATE trigger alongside the others.
  - Strength: Applies the structural-enforcement philosophy consistently; makes the
    Non-Goal unbreakable regardless of how S-01 is written.
  - Tradeoff: Two extra lines now, and a migration to undo when resize ships.
  - Confidence: HIGH — identical to the five columns already pinned.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (Fix A) — left as is. Resize is a plausible future feature
  (the parked 1000x1000 work), so pinning now would need reverting later. The DTO
  blocks it for every MVP caller. Revisit if S-01's endpoint mass-assigns, which
  would bypass the DTO.
