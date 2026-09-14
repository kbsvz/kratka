# Print Correctness + Quality-Gates Wiring — Plan Brief

> Full plan: `context/changes/testing-print-quality-gates/plan.md`
> Research: `context/changes/testing-print-quality-gates/research.md`

## What & Why

Wire the CI gates `test-plan.md` §5 already names as required for this rollout phase: a real typecheck gate, a deterministic chrome-free-print check (Risk #7), Supabase-in-CI for the existing test suite, and one Playwright critical-path smoke test (sign-in → open pattern → print) — the narrow exception the `test-plan-refresh-2026-09-13` change added to the project's no-broad-e2e stance.

## Starting Point

`ci.yml` is a single flat job today: lint, `npm audit`, build — no typecheck, no tests, no Supabase, no e2e. Phase 1/2 of this rollout already wrote real test code (`patternEstimator.test.ts`, `test/integration/*.test.ts`) but it only runs locally. `print.astro` is already structurally chrome-free (no `AppHeader`, `print:hidden` on the two interactive elements, a working `@media print` block) — untested, not unimplemented. No pattern is seeded, and no Playwright dependency exists yet.

## Desired End State

Every PR to `main` runs four CI jobs — `lint-and-typecheck`, `print-check`, `test`, `e2e` — each gating exactly what `test-plan.md` §5 says it should. A developer opening a PR that breaks print output, typechecking, an integration test, or the critical sign-in→print path sees a red, specific job, not a green build hiding the regression.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| CI scope | Actually edit `ci.yml` (not defer) | User explicitly chose to include CI wiring in this plan after being shown the CLAUDE.md lesson-boundary tension | Plan (confirmed in interview) |
| Service-role key | Hardcode the well-known local demo key in `ci.yml` | Confirmed via `npx supabase status` that it's a fixed, public, non-project-specific value — not a real secret | Plan (confirmed in interview) |
| E2E test data | Seed one fixed pattern in `seed.sql` | Matches the literal "sign-in → open → print" path decided during the refresh; avoids adding pattern-creation to the critical path | Plan (confirmed in interview) |
| Web server for Playwright | `astro dev`, not built Cloudflare/workerd | Avoids build + wrangler-secret complexity for a single smoke test; sufficient to exercise real SSR + Supabase calls | Plan (confirmed in interview) |
| Print-step assertion | Assert `/print` renders correctly only | Simpler; the separate deterministic print-CSS test already covers chrome exclusion, so this doesn't duplicate it | Plan (confirmed in interview) |
| CI failure mode | No retry around `supabase start` | Matches how every other gate already behaves; deferring Supabase-in-CI to a follow-up remains the agreed fallback | Plan (confirmed in interview) |
| Supabase CLI in CI | `npx supabase start` directly, no `supabase/setup-cli` Action | `supabase` is already an npm devDependency, installed by `npm ci` | Plan (research-derived) |

## Scope

**In scope:**
- `package.json` `typecheck` script; `ci.yml` split into 4 jobs
- One co-located print-CSS source-text test (`print.test.ts`)
- Supabase-in-CI (fresh stack per job, hardcoded local dev keys written to `.dev.vars`/`.env.test`)
- One seeded fixture pattern
- One Playwright spec + config
- `test-plan.md` §6 cookbook fill-in + README Scripts table + L-02 stale-claim sweep

**Out of scope:**
- Promoting the AI-native visual spot-check to a CI gate (stays manual)
- Retry logic around Supabase startup
- Testing against the real Cloudflare Workers runtime
- Verifying `window.print()` actually fires
- Fixing the pre-existing missing `prerender = false` in `signin.ts`

## Architecture / Approach

Four parallel GitHub Actions jobs in one workflow file, ordered cheapest/fastest-to-fail first: `lint-and-typecheck` and `print-check` need no infra; `test` and `e2e` each independently start their own local Supabase stack (jobs are isolated VMs — no sharing without a composite action, out of scope here).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Typecheck gate | `astro check` wired into CI | None significant — additive, no infra |
| 2. Print-CSS check | Source-text test + `print-check` job | Source-text assertions are fragile to unrelated refactors of `print.astro` |
| 3. Supabase-in-CI | `test` job with local Supabase stack | Cold-runner `supabase start` timing (~1.5–3 min) is unverified until it actually runs in CI |
| 4. Seed fixture pattern | One pattern seeded for the test user | None significant |
| 5. Playwright e2e | `e2e` job + one spec | Selector brittleness if `PatternDashboard`/`PatternEditor` markup changes; no fixed test ids exist today |
| 6. Docs sync | Cookbook + README + L-02 sweep | None significant |

**Prerequisites:** None — all inputs already exist (refreshed `test-plan.md`, `research.md`, this plan's own interview decisions).
**Estimated effort:** ~1 session across 6 phases; Phases 3 and 5 carry the most CI-wiring risk and may need iteration once real GitHub Actions runs surface timing/config issues.

## Open Risks & Assumptions

- `supabase start` cold-start timing in GitHub Actions is an assumption (1.5–3 min), not yet benchmarked against this repo's actual CI.
- The Playwright test's generic pattern-row selector (`a[href^="/patterns/"]` excluding `/print`) assumes exactly one seeded pattern exists; if that invariant breaks (e.g. a future seed adds more), the test may need a more specific selector.

## Success Criteria (Summary)

- All four CI jobs run on every PR and each fails only for its own kind of regression
- A developer can reproduce every gate locally with a single documented command
- `test-plan.md` §5's gate table is now fully accurate, closing the "green build, real bug" gap that started this refresh
