<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Print Correctness + Quality-Gates Wiring

- **Plan**: context/changes/testing-print-quality-gates/plan.md
- **Scope**: Phase 6 of 6 (full plan)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — README's CI section is stale after Phase 3's 4-job pipeline

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: README.md:190-193
- **Detail**: Still reads "GitHub Actions runs `astro sync`, lint, `npm audit`, and build on every push and PR to `main`" — the pre-Phase-3 single-job description. `ci.yml` now has four independent jobs (`lint-and-typecheck`, `print-check`, `test`, `e2e`). Phase 6's L-02 stale-claim sweep (`grep -rniE "no migrations|doesn't exist|not yet|none required|not required" ...`) technically passed because this is staleness-by-omission, not an explicit false claim matching that pattern — the sweep's own literal criterion was satisfied without catching what it was meant to catch.
- **Fix**: Update README.md:192 to describe the actual four jobs (lint+typecheck, print-check, test with Supabase-in-CI, e2e with Playwright).
- **Decision**: FIXED

### F2 — `supabase/seed.sql`'s pattern insert has no idempotency guard, unlike the two inserts above it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/seed.sql:47-52
- **Detail**: The `auth.users` and `auth.identities` inserts both use `on conflict (...) do nothing`; the new `patterns` insert has no such guard. Safe today only because `db reset` always starts from an empty table — if `seed.sql` is ever re-run without a full reset (e.g. a future split-out `supabase db seed` command, or a manual `psql -f`), it will hard-fail on `patterns_user_seq_uniq`/`patterns_user_name_uniq` instead of no-op like its neighbors.
- **Fix**: Add a one-line comment stating this insert is only safe under the current "seed always follows a full reset" invariant, so a future change to that invariant doesn't silently break `db reset` — a real `on conflict` guard isn't practical here since `slot`/`seq`/`name` are trigger-derived, not caller-supplied.
- **Decision**: SKIPPED

### F3 — Phase 5 shipped 5 files where the plan's contract named 2, with no adaptation note

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: context/changes/testing-print-quality-gates/plan.md (Phase 5 "Changes Required", Progress 5.1-5.4)
- **Detail**: Plan Phase 5 asked for `playwright.config.ts` + `e2e/critical-path.spec.ts` only. Actual delivery also added `e2e/auth.setup.ts`, `e2e/seed.spec.ts`, `e2e/helpers.ts`, `e2e/CLAUDE.md`, plus a `storageState`/`setup`-project split and `fullyParallel: false` in the config — all of it `/10x-e2e`'s own standard "two quality levers + auth setup" convention (which you explicitly invoked for this phase), not arbitrary scope creep. But plan.md's Progress log never records this expansion the way other deviations were recorded (e.g. 1.4's "adapted:" note, 5.4's "adapted:" note) — a future reader of just the plan wouldn't know why 5 files exist instead of 2.
- **Fix A ⭐ Recommended**: Add a brief "adapted:" note to Progress 5.1 (or a short addendum under Phase 5) explaining the lever expansion and pointing to `/10x-e2e`'s convention.
  - Strength: Plan becomes an accurate historical record without touching any code; matches how this same plan already handled other adaptations (1.4, 5.4).
  - Tradeoff: None meaningful — pure documentation.
  - Confidence: HIGH — direct precedent already exists in this same plan.
  - Blind spot: None significant.
- **Fix B**: Leave as-is
  - Strength: No further edits needed.
  - Tradeoff: The plan silently understates what Phase 5 actually shipped; a future `/10x-archive` or historical read of just plan.md would be misleading about scope.
  - Confidence: MEDIUM — the code itself (e2e/CLAUDE.md, helpers.ts) does explain the rationale, just not plan.md.
  - Blind spot: None significant.
- **Decision**: FIXED (via Fix A)

### F4 — `critical-path.spec.ts` uses a hardcoded pattern-name locator instead of the plan's specified generic one

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: e2e/critical-path.spec.ts:19
- **Detail**: Plan's Phase 5 contract explicitly said to locate the pattern-open link **generically** (`a[href^="/patterns/"]` excluding `/print`), "since the seeded pattern's auto-assigned name isn't a fixed literal this test should depend on." The shipped test instead hardcodes `getByRole("link", { name: "My Very First Pattern", exact: true })`. Verified via the `patterns_before_insert`/`pick_pattern_name` trigger (`supabase/migrations/20260830140641_...sql`): for a fresh user's first pattern (seq=1), the name is deterministically `"My Very First Pattern"` — so the hardcoded value is safe today, but it directly depends on the exact thing the plan said not to depend on, and the deviation was never flagged as "adapted" in Progress 5.1/5.2 the way other deviations were.
- **Fix A ⭐ Recommended**: Keep the hardcoded name, add a one-line comment citing the deterministic trigger behavior as justification, and note the adaptation in Progress.
  - Strength: Simpler test, more readable failure messages; the dependency is genuinely stable (trigger logic, not incidental state) and already documented in `e2e/CLAUDE.md`.
  - Tradeoff: If `pick_pattern_name`'s pool or ordering logic ever changes, this specific test breaks in a way a generic locator wouldn't — a real but low-probability coupling.
  - Confidence: HIGH — the trigger's ordinal-name mapping is a stable, migration-level contract, not implementation detail likely to change casually.
  - Blind spot: None significant.
- **Fix B**: Switch to the plan's originally-specified generic href-based locator.
  - Strength: Matches the plan exactly; zero coupling to naming-pool internals.
  - Tradeoff: `a[href^="/patterns/"]` is a CSS attribute selector, which `e2e/CLAUDE.md`'s own rules explicitly discourage ("Never use CSS selectors... for locating elements") — fixing this drift would introduce a different rule violation.
  - Confidence: MEDIUM — would need a role-based alternative (e.g. filtering out the link named "Print") to stay compliant with the project's own E2E rules, adding complexity for a currently-safe case.
  - Blind spot: Haven't measured how the seed pool's `pick_pattern_name` ordinal assignment behaves under concurrent/rare edge cases beyond the seeded-user-first-pattern case tested here.
- **Decision**: FIXED (via Fix A)

## Observations

- **CI-hardcoded Supabase keys** (`.github/workflows/ci.yml`, `test`/`e2e` jobs): confirmed safe — these are the Supabase CLI's fixed local-dev demo values (same on every install, JWT issuer `"supabase-demo"`), never linked to a real project, and the stack only exists for the job's lifetime. No action needed.
- **`test`/`e2e` jobs duplicate `supabase start` + env-file setup** (~10 lines each): expected given GitHub Actions jobs are isolated VMs. A composite action could de-duplicate this if a third job ever needs the same setup — not worth doing for two jobs alone.
