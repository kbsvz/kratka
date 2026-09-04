<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Patterns Schema + Owner-Scoped RLS

- **Plan**: `context/changes/patterns-schema-rls/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-30
- **Verdict**: REVISE → **SOUND** after triage (all 9 findings fixed)
- **Findings**: 1 critical, 5 warnings, 3 observations

## Verdicts

| Dimension | Before triage | After triage |
|-----------|---------------|--------------|
| End-State Alignment | PASS | PASS |
| Lean Execution | WARNING | PASS |
| Architectural Fitness | WARNING | PASS |
| Blind Spots | WARNING | PASS |
| Plan Completeness | FAIL | PASS |

## Grounding

7/7 paths ✓, 2/2 symbols ✓, brief↔plan ✓, Progress↔Phase 4/4 phases + 20/20 criteria ✓.
No `docs/reference/contract-surfaces.md` or `context/foundation/lessons.md` — both checks skipped.

## Findings

### F1 — pgTAP scaffolding entirely unspecified

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2
- **Detail**: `grep` confirmed no reference to pgtap anywhere in `supabase/` or `package.json`. Three gaps: the extension is never created, so `supabase test db` runs against a database with no pgTAP functions; no `begin`/`plan(N)`/`finish`/`rollback` wrapper is specified, so an assertion list alone won't execute; and the path used `supabase/tests/` where Supabase documents `supabase/tests/database/`.
- **Fix**: Extension created in the *test file* rather than a migration (keeps pgTAP out of migration history and off the hosted project in Phase 4); wrapper specified in Phase 2's contract, noting `plan(N)` fails the run on a count mismatch; path moved to `supabase/tests/database/`. Confirmed via `supabase test db --help` that the default path recurses.
- **Decision**: FIXED

### F2 — Creating an empty pattern required uploading 10,000 zeros

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §2 — schema; interacts with S-01's create flow
- **Detail**: `grid jsonb not null` had no default while the CHECK demanded `jsonb_array_length(grid) = width * height`, so S-01's create — which per FR-004 only sets dimensions — had to construct and POST a ~20–30 KB zero array to open an empty editor. The plan never said who built it.
- **Fix applied (Fix B)**: `grid` defaults to `'[]'`; CHECK relaxed to `length = 0 OR length = width * height`. Consequence propagated into Critical Implementation Details — S-01 must treat length 0 as "all cells empty", S-03 must not index into an empty array. Phase 2 asserts empty-accepted / full-accepted / off-by-one-rejected.
- **Note**: Fix A (trigger fills the grid) was the recommendation; user chose B. Surviving invariant is narrower — a grid is either absent or exactly right, never partially wrong.
- **Decision**: FIXED

### F3 — "Name never reused" was trigger logic, not a constraint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §4
- **Detail**: The plan makes the 3-pattern cap a unique index "rather than a count" and grid sizing a CHECK rather than app discipline, but the never-reuse-a-name rule — committed to in PRD FR-006 — rested entirely on a SELECT inside the trigger. Also racy: two concurrent creates for one user could both pick the same unused name.
- **Fix**: Added `unique (user_id, name)`, spanning deleted rows so a retired name stays retired. Satisfiable by construction — ordinals map to unique `seq` values, pool names are excluded once assigned, the `'My Pattern N'` fallback embeds a per-user-unique `seq`.
- **Decision**: FIXED

### F4 — Trigger assigned seq/name only "when not supplied"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 §4
- **Detail**: Conditional assignment left both fields client-settable, and the UPDATE policy checks only ownership — so a mass-assigning endpoint (`insert({...body, user_id})`) would let a stray `name` through, and a PATCH would allow rename, an explicit PRD Non-Goal. **Scoping correction made during triage**: not exploitable today, since `SUPABASE_KEY` is server-only (`astro:env/server`, `access: "secret"`) and the browser cannot reach Postgres directly. This is a consistency-with-own-philosophy issue, not a live vulnerability.
- **Fix**: Insert assignment made unconditional (supplied values discarded). New `before update` trigger pins `seq`, `name`, and `user_id` alongside the `updated_at` bump. Restores rather than raises, so a client echoing the full row on save still succeeds. PRD FR-006 updated to state the name is system-assigned and cannot be modified.
- **Decision**: FIXED

### F5 — slot was caller-assigned while seq and name were trigger-assigned

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §4
- **Detail**: Three derived per-user values, two server-assigned and one pushed to the caller, with no stated rationale — and no documented contract for how S-01 finds a free slot or handles losing the unique-index race.
- **Fix applied (Fix A)**: Trigger derives `slot` too. Create now carries `width` and `height` only. Surfaced a subtlety now documented as a table: the three columns need **opposite row filters** — `slot` must see live rows only (or deleted patterns hold slots forever), `seq` and `name` must see all rows including deleted (or they collide and recycle). Slot exhaustion raises a distinct catchable error so S-01 can tell FR-005's limit state from a fault; the unique index remains the concurrency backstop.
- **Decision**: FIXED

### F6 — Seeding test users in auth.users unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1
- **Detail**: `patterns.user_id` has an FK to `auth.users(id)`, so tests need real rows; a JWT claim alone won't do. Direct inserts need `instance_id`, `aud`, `role`, `encrypted_password` and timestamps, and getting it wrong yields opaque errors precisely when you're trying to establish trust in the suite.
- **Fix**: Minimal insert specified with a note that `instance_id`/`aud`/`role` are the usual omissions, plus a caveat to verify against `\d auth.users` since GoTrue's shape has changed across versions. Fixture-existence assertions now open the suite.
- **Decision**: FIXED

### F7 — `npm run lint` in Phase 1 verified nothing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria
- **Detail**: Phase 1 touches only `.sql` and `.toml`; ESLint is configured for `{ts,tsx,astro}` and lints neither, so the check passed trivially.
- **Fix**: Criterion removed; Phase 1 Progress renumbered to 1.1–1.5.
- **Decision**: FIXED

### F8 — New `src/db/` directory for a single generated file

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 §1
- **Detail**: The codebase keeps non-component modules in `src/lib/`; a top-level `src/db/` for one generated file adds a convention CLAUDE.md doesn't mention.
- **Fix**: Moved to `src/lib/database.types.ts`.
- **Decision**: FIXED

### F9 — pattern_names SELECT policy unnecessary

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Lean Execution
- **Location**: Phase 1 §3
- **Detail**: Nothing in scope reads `pattern_names` from the client — the picker is `security definer` and reads it as owner.
- **Fix**: RLS enabled with zero policies (denies all client access). Rationale recorded so the omission doesn't read as an oversight during implementation.
- **Decision**: FIXED
