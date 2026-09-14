# Bootstrap Test Runner + Critical-Path Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

kratka has no test runner and only one test file (pgTAP, RLS-only). This change bootstraps
Vitest and closes the two highest-priority risks from `context/foundation/test-plan.md` rollout
Phase 1: the estimator's thread-count/time math (Risk #3, currently zero coverage) and the
pattern save/reload round-trip plus its write-side input validation (Risk #1).

## Starting Point

`src/lib/patternEstimator.ts` (pure math, 7mm/stitch + 150 stitches/hour, confirmed matching the
PRD) and the pattern API routes (`src/pages/api/patterns/index.ts`, `[id].ts`) are plain,
directly-callable functions with zero tests today. Research found the write path is already
zod+CHECK-constraint guarded; a narrower gap (a grid value referencing an out-of-range palette
index, which only the API's zod layer catches) was considered but dropped from this phase's scope
after discussion — the realistic cause is a future editor bug, not an attacker, and
`estimatePattern` already degrades gracefully on such a value, so the stakes don't justify the
extra test right now.

## Desired End State

`npm test` runs a Vitest suite: unit tests proving the estimator's math against hand-computed
values, and integration tests proving a saved pattern reopens exactly as saved.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Integration test harness | Call route handlers in-process (no dev server) | Fast, no new runtime, still exercises real zod + real local DB | Plan |
| Invalid-fixture seeding | Dropped — test only currently-reachable states | User declined the service-role-bypass fixture | Plan |
| Write-path rejection test | Also dropped | Discussion recalibrated the actual threat model (own future editor bug, not an attacker); `estimatePattern` already degrades gracefully on an out-of-range value, so stakes don't justify the test for this app | Plan |
| CI wiring | Deferred to rollout Phase 3 | Keeps this phase scoped to writing tests; `test-plan.md` §5 corrected to match | Plan |
| Test-user strategy | Ephemeral per-test users, cleaned up | Avoids colliding with the seeded dev-convenience account (`test@example.com`) | Plan |
| Print-view boundary test | Deferred to rollout Phase 3 | That's Risk #7's territory (print correctness), not this phase's | Plan |
| Reload-path validation gap | Tests characterize current behavior only, no production fix | Keeps this a test-rollout change, not a mixed test+fix change | Plan |

## Scope

**In scope:**
- Vitest bootstrap (config, `npm test` script)
- Unit tests for `estimatePattern`/`formatDuration`
- Integration tests for pattern create/save/reload round-trip
- `test-plan.md` §6.1/§6.2 cookbook fill-in and §5 CI-timing correction

**Out of scope:**
- Fixing the reload path's missing validation
- Seeding a directly-malformed DB row
- Testing the write path's out-of-range-grid-value rejection
- CI wiring
- print.astro rendering tests
- Any client-side (React hook) test changes

## Architecture / Approach

Vitest, wired through Astro's `getViteConfig` helper for path-alias parity with the app. Unit
tests are pure function calls, no I/O. Integration tests call the exported `POST`/`PATCH` route
handlers directly with a constructed `APIContext`, against a real local Supabase instance, using
ephemeral test users created via the Admin API (service-role key, local-only, in a new
`.env.test`) and cleaned up after each test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Bootstrap + estimator tests | Vitest running, Risk #3 fully closed | Vitest/Astro Vite-config wiring may need version-specific adjustment |
| 2. Integration harness + round-trip | Risk #1 closed for the save/reload round-trip | Test-user cleanup must actually work, or repeated runs pollute local DB |
| 3. Cookbook + test-plan sync | §6.1/§6.2 filled in, §5 CI-timing corrected | None — documentation only |

**Prerequisites:** Local Supabase running (`npx supabase start`); Docker available.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Astro's `getViteConfig` helper for Vitest is assumed compatible with the pinned `astro@6.4.8` —
  verify during Phase 1 implementation; if incompatible, a plain `vitest.config.ts` with manual
  alias mapping is the fallback.
- The reload path's blind spot to an already-malformed row remains genuinely untested after this
  phase — a deliberate, documented gap, not an oversight.

## Success Criteria (Summary)

- `npm test` passes locally with `npx supabase start` running, covering both risks' reachable states.
- A future contributor can find "how do I add a unit/integration test here" in `test-plan.md` §6
  without asking anyone.
