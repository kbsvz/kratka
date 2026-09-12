# Bootstrap Test Runner + Critical-Path Coverage — Implementation Plan

## Overview

Bootstrap Vitest (no test runner exists in this project beyond pgTAP) and cover rollout
Phase 1's two risks from `context/foundation/test-plan.md`: the thread-count/time estimator's
pure math (Risk #3) and the pattern save/reload round-trip (Risk #1). Integration tests call the
existing API route handlers in-process against a local Supabase instance, using ephemeral
per-test users — no dev server, no mocking of the database.

## Current State Analysis

- **No JS/TS test runner exists.** `package.json` has no `test` script and no vitest/jest
  dependency. The only test asset in the repo is `supabase/tests/database/patterns_rls.test.sql`
  (pgTAP), run via `npx supabase test db`.
- **`src/lib/patternEstimator.ts`** exports `estimatePattern` and `formatDuration`, using fixed
  constants `MM_PER_STITCH = 7` and `STITCHES_PER_HOUR = 150` — confirmed matching
  `context/foundation/prd.md`'s Business Logic section exactly.
  Zero test coverage today; `src/pages/patterns/[id]/print.astro` is the sole consumer.
- **Pattern API routes** (`src/pages/api/patterns/index.ts` POST, `src/pages/api/patterns/[id].ts`
  PATCH/DELETE) are plain exported `async` functions taking an Astro `APIContext` — callable
  directly in a test without a running server, as confirmed by their shape (`context.locals.user`,
  `context.request`, `context.params`).
- **`savePatternSchema`** (`src/lib/patterns.ts:18-26`) validates `palette` (max 30 hex colors) and
  `grid` (non-negative ints), with a `.refine` rejecting any grid value `> palette.length`. It does
  **not** check `grid.length === width * height` — that invariant is enforced entirely by the DB's
  `patterns_grid_length` CHECK constraint (`supabase/migrations/20260830140641_create_patterns_and_names.sql:39-42`),
  which applies unconditionally (CHECK constraints aren't bypassable by role, including a
  service-role client) — so a length-mismatched grid cannot be persisted by any client. This
  corrects `research.md`'s original framing: the reload path's *reachable* gap is a grid cell
  value referencing an out-of-range palette index (no DB constraint covers this), not a
  length mismatch.
- **Reload has no schema validation.** `src/pages/patterns/[id].astro:20-36` selects
  `palette`/`grid` from Supabase and casts them with `as unknown as` — no zod re-parse, unlike
  every write path. Per this session's scope decision, this plan does not seed a directly-invalid
  row to exercise that blind spot (would require a service-role bypass) and does not patch the
  reload path — it is a documented, untested gap (see "What We're NOT Doing").
- **Local Supabase is already running via Docker** (`npx supabase start`) with a seeded dev
  convenience account (`supabase/seed.sql`, `test@example.com` / `password123`, fixed id
  `00000000-...0001`) — reserved for manual dev use; this plan creates its own ephemeral test
  users instead (per this session's scope decision) to avoid colliding with it.
- **CI** (`.github/workflows/ci.yml`) currently runs lint + `npm audit` + build only, against no
  local Supabase instance. Per this session's scope decision, wiring the new test suite into CI is
  deferred to test-plan.md rollout Phase 3 ("Print correctness + quality-gates wiring") — this
  plan's final phase corrects `test-plan.md` §5's timing to match.

## Desired End State

- `npm test` runs a Vitest suite covering `estimatePattern`/`formatDuration` (unit) and the
  pattern create/save/reload round-trip (integration, against local Supabase).
- Both suites pass locally (`npx supabase start` running) and are excluded from CI for now
  (corrected in `test-plan.md` §5, wired in rollout Phase 3).
- `context/foundation/test-plan.md` §3 Phase 1 row can move to `implementing` as sub-phases land,
  and its §6.1/§6.2 cookbook entries are filled in.

### Key Discoveries:

- Route handlers are directly callable — `src/pages/api/patterns/[id].ts:8` (`export const PATCH:
  APIRoute = async (context) => {...}`) needs only a constructed `APIContext`-shaped object, not a
  running server.
- `formatDuration`'s minute-rounding (`src/lib/patternEstimator.ts:47`, `Math.round(hours * 60)`)
  has an untested boundary at exactly 60 minutes (e.g. an input just under 1 hour rounding up to
  `1h`) — worth a dedicated case since it's a zero-coverage function.

## What We're NOT Doing

- Not fixing `src/pages/patterns/[id].astro`'s missing reload-path validation — tests only, per
  this session's scope decision. Revisit if a future change adds a write path that bypasses
  `savePatternSchema` (the one precondition that would let a truly malformed row exist).
- Not seeding a directly-malformed DB row (grid value referencing an out-of-range palette index)
  to test the reload path's blind spot — this would require a service-role-key bypass, and per
  this session's decision that fixture is dropped. The reload path's behavior on an
  already-malformed row remains untested and undocumented in code (only documented here and in
  `research.md`).
- Not wiring the new tests into CI — deferred to `test-plan.md` rollout Phase 3, corrected in
  Phase 3 of this plan.
- Not testing `print.astro`'s rendering boundary (`Math.ceil` display) — deferred to rollout
  Phase 3 (Risk #7's territory).
- Not building a dev-server/wrangler-based test harness — route handlers are called in-process.
- Not touching `usePatternGrid.ts` or any client-side React code — this phase covers the API layer
  and pure functions only.
- Not testing the write path's rejection of an out-of-range grid value. `savePatternSchema`'s
  `.refine` does reject it today (see `src/lib/patterns.ts:23-25`), and it would be a cheap test to
  add — but per this session's discussion, the realistic cause here is a future editor bug, not an
  attacker, and `estimatePattern` already degrades gracefully on such a value (skips it via `value
  > palette.length` at `src/lib/patternEstimator.ts`), so this project's actual stakes don't
  justify the extra test right now. Revisit if this ever becomes a multi-user or higher-stakes
  product.

## Implementation Approach

Vitest is the natural runner choice: Astro's tooling is Vite-based, and Astro ships a documented
`getViteConfig` helper (`astro/config`) specifically for wiring Vitest to an Astro project's Vite
config. Integration tests call the exported route handlers directly with a constructed
`APIContext`, using the real `@supabase/supabase-js` client pointed at the local instance
(`.dev.vars`'s `SUPABASE_URL`) — no mocking, matching the existing pgTAP convention of testing
against a real database. Each integration test creates its own throwaway user via the Supabase
Admin API (service-role key, local-only) and tears it down afterward, so tests never touch the
seeded dev-convenience account and can run repeatedly without collision.

## Critical Implementation Details

**Local-only service-role key.** Integration tests need a `SUPABASE_SERVICE_ROLE_KEY` to create
and delete ephemeral test users via the Admin API — this key must come from the local stack only
(`npx supabase status` prints it) and must never be read from `.dev.vars`'s production-pointed
values or committed. Add it to a separate `.env.test` (gitignored, alongside the existing
`.dev.vars` pattern) so it's structurally impossible to confuse with the app's runtime env.

## Phase 1: Bootstrap Vitest and cover the estimator

### Overview

Add Vitest to the project and write unit tests for `estimatePattern`/`formatDuration` — the
cheapest possible layer for Risk #3, no I/O required.

### Changes Required:

#### 1. Add Vitest

**File**: `package.json`, new `vitest.config.ts`

**Intent**: Install `vitest` as a devDependency and add a `test` script. Wire the Vitest config
through Astro's `getViteConfig` helper so path aliases (`@/*`) and the Vite plugins already
configured in `astro.config.mjs` resolve identically in tests.

**Contract**: `npm test` runs Vitest once (CI-style, no watch) via `vitest run`; `npm run
test:watch` runs it in watch mode. Test files match `**/*.test.ts`.

#### 2. Estimator unit tests

**File**: `src/lib/patternEstimator.test.ts`

**Intent**: Prove `estimatePattern` and `formatDuration` compute correctly against
hand-computed expected values — never copied from the functions' own output.

**Contract**: Cases to cover, each asserting a hand-computed expected value (not a value derived
by running the code once and pasting its output):
- A small multi-color grid: known cell counts per color → expected `threadCm` per color
  (`7mm × cellCount / 10`) and expected `totalHours` (`totalFilledCells / 150`).
- Empty grid (`grid: []`) → all colors filtered out (zero `cellCount`), `totalFilledCells: 0`,
  `totalHours: 0` — matches the documented never-painted sentinel behavior.
- A grid value exactly at the valid boundary (`value === palette.length`, the highest legal
  index) → correctly attributed to the last palette color, not dropped or miscounted.
- `formatDuration` boundary: an hours value whose minutes round to exactly a whole hour (e.g.
  `0.991h` → `59.46min` → rounds to `59min`; and a value that rounds up to the next hour, e.g.
  `0.999h` → `59.94min` → rounds to `60min` → must render as `"1h"` per the `m === 0` branch, not
  `"0h 60min"`).
- `formatDuration(0)` → `"0min"`.

### Success Criteria:

#### Automated Verification:

- `npm test` runs and all estimator tests pass
- `npm run typecheck` (or `npx astro check`) passes with the new files
- `npm run lint` passes

#### Manual Verification:

- Spot-check one hand-computed expected value against the PRD's stated constants by hand

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Integration test harness + save/reload round-trip

### Overview

Build a minimal fixture helper for ephemeral test users, then cover Risk #1: the write-side
round-trip (create → save → reload matches exactly).

### Changes Required:

#### 1. Test-only environment file

**File**: `.env.test` (new, gitignored)

**Intent**: Hold the local Supabase URL and the local-only `SUPABASE_SERVICE_ROLE_KEY` (from
`npx supabase status`) for the integration suite's fixture helper — kept separate from
`.dev.vars` so it can never be mistaken for a production-pointed value.

**Contract**: Loaded only by the integration test setup file, never by app code.

#### 2. Test fixture helper

**File**: `test/integration/helpers/test-user.ts`

**Intent**: Create a throwaway authenticated user via the Supabase Admin API (service-role
client) before each test that needs one, and delete the user (cascading to their patterns) after.

**Contract**: Exposes something like `createTestUser()` returning a user id plus an
`APIContext`-shaped `locals.user`, and `cleanupTestUser(id)`. Used from `beforeEach`/`afterEach` in
the integration spec, not a global fixture, so tests stay independent.

#### 3. Save/reload round-trip integration test

**File**: `test/integration/patterns-round-trip.test.ts`

**Intent**: Prove that a saved pattern reopens with the exact grid, palette, and dimensions that
were saved — using an independently-constructed input, not a value derived from the save call's
own response.

**Contract**: For a test user, call the exported `POST` handler (`src/pages/api/patterns/index.ts`)
to create a pattern, then the exported `PATCH` handler (`src/pages/api/patterns/[id].ts`) with a
hand-written non-trivial `palette`/`grid` payload, then perform the same `select("id, name, width,
height, palette, grid")` query `src/pages/patterns/[id].astro:20-26` uses, and assert the reloaded
`palette`/`grid`/`width`/`height` deep-equal the exact values passed to `PATCH` — not values
re-derived from the save response. Include:
- A grid value at the exact valid boundary (`value === palette.length`) round-trips correctly.
- Dimensions set at creation remain unchanged after a save (save only ever sends `palette`/`grid`).

### Success Criteria:

#### Automated Verification:

- `npm test` runs and all integration tests pass with `npx supabase start` running locally
- `npm run typecheck` passes
- `npm run lint` passes
- Test users created during the run are confirmed cleaned up (no leftover rows after the suite
  exits — verified by a final count query in the test teardown)

#### Manual Verification:

- Run `npm test` twice in a row locally and confirm no state leaks between runs (proves cleanup
  actually works, not just that it was called)

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Cookbook sync + test-plan correction

### Overview

Fill in `context/foundation/test-plan.md` §6.1 (unit test cookbook) and §6.2 (integration test
cookbook) with what this phase actually established, and correct §5's CI-gate timing to match this
session's decision to defer CI wiring to rollout Phase 3.

### Changes Required:

#### 1. Cookbook entries

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 1` placeholders in §6.1 and §6.2 with the concrete
location, naming convention, reference test, and run command this phase established, so a future
contributor (or `/10x-tdd`) knows exactly where to add the next unit or integration test.

**Contract**: §6.1 points to `src/lib/patternEstimator.test.ts` as the reference unit test
(co-located `*.test.ts` next to the module under test, run via `npm test`). §6.2 points to
`test/integration/patterns-round-trip.test.ts` as the reference integration test (separate
`test/integration/` tree, using the `test/integration/helpers/test-user.ts` fixture pattern, no
mocking of the database, run via `npm test` with `npx supabase start` running).

#### 2. §5 CI-gate timing correction

**File**: `context/foundation/test-plan.md`

**Intent**: §5 currently reads "unit + integration | ... | required after §3 Phase 1" — this
session decided CI wiring is deferred to rollout Phase 3, not delivered by Phase 1. Correct the
"Required?" cell so the guide doesn't claim a gate is enforced before it actually is.

**Contract**: Change the unit+integration row's "Required?" cell from `required after §3 Phase 1`
to `required after §3 Phase 3` (matching the print-correctness/quality-gates-wiring phase, which
now wires both this suite and the print-CSS check into CI together).

#### 3. §3 status update

**File**: `context/foundation/test-plan.md`

**Intent**: Once Phases 1–2's checkboxes are complete, the rollout table's Phase 1 row should
reflect that work is done, pending `/10x-test-plan`'s own reconciliation on next invocation.

**Contract**: No manual edit needed here — `/10x-test-plan`'s lazy reconciliation (Phase 6) flips
Status to `complete` once this plan's `## Progress` is fully checked. This step is a no-op placed
here only to document that expectation.

### Success Criteria:

#### Automated Verification:

- `grep -c "TBD — see §3 Phase 1" context/foundation/test-plan.md` returns `0` for the two entries
  this phase fills in (6.1, 6.2 — other TBDs for Phases 2/3 remain by design)

#### Manual Verification:

- Read the updated §6.1/§6.2 and §5 sections and confirm they read as accurate, current guidance

**Implementation Note**: After completing this phase and all automated verification passes, this
rollout phase is done — no further manual confirmation needed before `/10x-test-plan` is re-run to
advance to Phase 2 of the rollout.

---

## Testing Strategy

### Unit Tests:

- `estimatePattern`/`formatDuration` against hand-computed expected values (see Phase 1).

### Integration Tests:

- Pattern create → save → reload round-trip against local Supabase, in-process route handlers
  (see Phase 2).

### Manual Testing Steps:

1. Run `npx supabase start`, then `npm test` — confirm all unit and integration tests pass.
2. Run `npm test` a second time immediately after — confirm no leftover test-user state causes
   failures or duplication.
3. Deliberately break `estimatePattern`'s constant (e.g., change `MM_PER_STITCH` to `8` locally)
   and confirm the unit test fails — proves the test isn't tautological.

## Performance Considerations

None — the estimator is a pure in-memory function, and the integration suite runs against local
Supabase only, not CI or production.

## Migration Notes

Not applicable — no schema changes in this phase.

## References

- Related research: `context/changes/testing-critical-path-coverage/research.md`
- Test-plan strategy: `context/foundation/test-plan.md`
- Route handlers under test: `src/pages/api/patterns/index.ts`, `src/pages/api/patterns/[id].ts`
- Reload path (documented gap, not modified): `src/pages/patterns/[id].astro:20-36`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles.

### Phase 1: Bootstrap Vitest and cover the estimator

#### Automated

- [x] 1.1 npm test runs and all estimator tests pass — 8ea9c6b
- [x] 1.2 npm run typecheck passes with the new files — 8ea9c6b
- [x] 1.3 npm run lint passes — 8ea9c6b

#### Manual

- [x] 1.4 Spot-check one hand-computed expected value against the PRD's stated constants by hand — 2bf32de

### Phase 2: Integration test harness + save/reload round-trip

#### Automated

- [x] 2.1 npm test runs and all integration tests pass with npx supabase start running locally — 1efc30e
- [x] 2.2 npm run typecheck passes — 1efc30e
- [x] 2.3 npm run lint passes — 1efc30e
- [x] 2.4 Test users created during the run are confirmed cleaned up — 1efc30e

#### Manual

- [x] 2.5 Run npm test twice in a row locally and confirm no state leaks between runs — 1efc30e

### Phase 3: Cookbook sync + test-plan correction

#### Automated

- [x] 3.1 grep confirms the two Phase-1 TBD placeholders (6.1, 6.2) are filled in — c3b55e2

#### Manual

- [x] 3.2 Read the updated §6.1/§6.2 and §5 sections and confirm they read as accurate, current guidance — c3b55e2
