# Print Correctness + Quality-Gates Wiring — Implementation Plan

## Overview

Ships rollout Phase 3 of `context/foundation/test-plan.md`: a real typecheck gate, a deterministic print-CSS check for chrome-free printing (Risk #7), Supabase-in-CI for the existing unit+integration suite, and one Playwright critical-path e2e smoke test (sign-in → open pattern → print) — the narrow, explicit exception to the no-broad-e2e stance added by `test-plan-refresh-2026-09-13`. Each of the six phases below is independently shippable.

## Current State Analysis

`.github/workflows/ci.yml` is a single flat job: checkout → setup-node → `npm ci` → `astro sync` → `npm run lint` → `npm audit` → `npm run build`. No typecheck step, no test step, no Supabase stack, no e2e. `package.json` has `@astrojs/check` installed but never invoked, and no `typecheck` script. Phase 1 and Phase 2 of this rollout already shipped real test code (`src/lib/patternEstimator.test.ts`, `test/integration/*.test.ts`) without ever touching `ci.yml` — those tests only run locally today.

`src/pages/patterns/[id]/print.astro` is structurally chrome-free: it never imports `AppHeader` (the app's nav), and the only two interactive elements needing suppression (`#print-button`, the "Close" link) carry Tailwind's `print:hidden` class. The `@media print` block (lines 198–214) hides the config-missing banner, zeroes margins, forces color-adjust, and sets a 1cm page margin. No print test exists. The Astro Container API is confirmed infeasible for this project (Phase 2's cookbook note, `test-plan.md` §6.5) — the `@astrojs/cloudflare` adapter's config hooks need a real Worker context vitest can't provide — so any print-correctness test must work against `print.astro`'s source text, not a rendered component.

`supabase/seed.sql` seeds exactly one user (`test@example.com`), no pattern. The editor page (`PatternEditor.tsx:257-265`) has its own "Print" link to `/patterns/[id]/print`, so the literal path "sign-in → open pattern → print" is reachable without detouring through the dashboard. `test/setup/load-env.ts` calls `process.loadEnvFile()` against literal `.dev.vars`/`.env.test` paths (both gitignored) — these must exist as real files or `npm test` throws at import time, in CI as much as locally.

The local Supabase dev stack (confirmed via `npx supabase status`) uses fixed, publicly-documented demo keys (`"iss":"supabase-demo"`, default CLI JWT secret, no override in `supabase/config.toml`) — the same values on every local install everywhere, not a real secret. `supabase` (`^2.23.4`) is already an npm devDependency, so `npx supabase start` works after a plain `npm ci` with no separate GitHub Action needed.

### Key Discoveries:

- [print.astro:82-88](../../../src/pages/patterns/[id]/print.astro) — Print button, `id="print-button"`, `print:hidden`.
- [print.astro:173-178](../../../src/pages/patterns/[id]/print.astro) — Close link, `print:hidden`.
- [print.astro:198-214](../../../src/pages/patterns/[id]/print.astro) — `@media print` block.
- [PatternEditor.tsx:257-265](../../../src/components/editor/PatternEditor.tsx) — editor's own "Print" link, completing the sign-in → open → print path.
- [SignInForm.tsx:44-82](../../../src/components/auth/SignInForm.tsx) — `id="email"`, `id="password"`, submit button role `Sign in`.
- [src/pages/api/auth/signin.ts:19](../../../src/pages/api/auth/signin.ts) — successful sign-in redirects to `/patterns` (real 302).
- [supabase/migrations/20260830140641_create_patterns_and_names.sql:19-49](../../../supabase/migrations/20260830140641_create_patterns_and_names.sql) — `patterns` table; a `BEFORE INSERT` trigger (`patterns_before_insert`, same file lines ~224-260) always overwrites `slot`/`seq`/`name`, so a seed insert only needs to supply `user_id`, `width`, `height` (grid/palette default to `'[]'`, which satisfies the `patterns_grid_length` check).
- [test/setup/load-env.ts](../../../test/setup/load-env.ts) — requires `.dev.vars` and `.env.test` to exist as real files.
- [test/integration/helpers/test-user.ts:5-6](../../../test/integration/helpers/test-user.ts) — reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` from `process.env`.
- [vitest.config.ts:20](../../../vitest.config.ts) — `include: ["src/**/*.test.ts", "test/**/*.test.ts"]`, so a co-located `print.test.ts` is picked up automatically; a separate CI job can still target it directly via `npx vitest run <path>`.

## Desired End State

`ci.yml` runs four jobs on every PR to `main`: `lint-and-typecheck` (lint + `astro check`), `print-check` (the deterministic print-CSS test, no Supabase needed), `test` (existing unit+integration suite against a CI-local Supabase stack), and `e2e` (one Playwright smoke test against the same stack). `package.json` has a `typecheck` script. `supabase/seed.sql` seeds one pattern alongside the test user. `test-plan.md` §6 cookbook and `README.md`'s Scripts table reflect all of the above. Verification: push a PR and confirm all four jobs run and pass; locally, `npm run typecheck`, `npx vitest run src/pages/patterns/\[id\]/print.test.ts`, and `npx playwright test` all pass against a running local Supabase stack.

## What We're NOT Doing

- Not promoting the selective AI-native visual spot-check to a CI gate — it stays a manual/local step (Claude Browser MCP, run by a developer before merging print-view changes), per the already-decided interview outcome; MCP tools aren't invocable from a GitHub Actions job.
- Not adding retry logic around `supabase start` in CI — a Docker/image-pull failure fails the job like any other check, per your answer; deferring Supabase-in-CI to a follow-up change remains the agreed fallback if it proves harder than expected.
- Not running the Playwright test against the built Cloudflare Workers runtime (`wrangler dev`/`preview`) — it runs against `astro dev`, per your answer; workerd-specific fidelity is out of scope for a single smoke test.
- Not having the e2e test create a pattern via the UI — it opens a seeded fixture pattern, per your answer; pattern creation is not part of the decided critical path.
- Not verifying `window.print()` actually fires — the test only asserts the `/print` page renders correctly, per your answer.
- Not touching `src/pages/api/auth/signin.ts`'s missing `export const prerender = false` — pre-existing, unrelated to this phase, and `output: "server"` makes it a non-issue (routes are server-rendered by default unless opted into prerendering).
- Not adding a separate `supabase/setup-cli` GitHub Action step — `supabase` is already an npm devDependency, so `npx supabase start` works after `npm ci` alone.

## Implementation Approach

Six phases, each independently mergeable and each adding exactly one gate or piece of infrastructure: typecheck → print-check → Supabase-in-CI → seed fixture → Playwright e2e → docs sync. This ordering lets the cheap, dependency-free gates (typecheck, print-check) land first, then the infra-heavy pieces (Supabase-in-CI, Playwright) build on a CI workflow that already has a job-splitting pattern established.

## Critical Implementation Details

**Env files must be written, not just exported.** `test/setup/load-env.ts` calls `process.loadEnvFile(url)` against literal `.dev.vars` and `.env.test` paths — this Node API throws `ENOENT` if the file doesn't exist, so simply setting `env:` in the GitHub Actions job (which only populates `process.env`, not these files) is not enough. Phase 3 and Phase 5's CI jobs must each write both files as an explicit step before running tests.

**The print-check test reads source text, not rendered output.** Because the Container API is confirmed infeasible for this project's Cloudflare adapter (Phase 2 cookbook note), the deterministic print-CSS check parses `print.astro`'s raw file contents (`fs.readFileSync`) and asserts against known substrings/regions (absence of `AppHeader`, presence of `print:hidden` on the two known elements, presence of the four `@media print` rules) rather than rendering the component. This is a structural/source assertion, not a browser-rendered one — call this out plainly in the test's own comments so a future reader doesn't mistake it for DOM testing.

## Phase 1: Typecheck gate

### Overview

Add a real typecheck step so `test-plan.md` §5's "lint + typecheck" row is no longer half-fictional.

### Changes Required:

#### 1. `package.json`

**File**: `package.json`

**Intent**: Add a `typecheck` script using the already-installed `@astrojs/check`, which understands `.astro` files (a raw `tsc --noEmit` would not).

**Contract**: New script `"typecheck": "astro check"` alongside the existing `scripts` block.

#### 2. `.github/workflows/ci.yml`

**File**: `.github/workflows/ci.yml`

**Intent**: Split the current single flat job into a named `lint-and-typecheck` job (this phase) that runs lint and the new typecheck step; later phases add sibling jobs.

**Contract**: Rename the existing `ci` job to `lint-and-typecheck`; keep its existing steps (checkout, setup-node, `npm ci`, `astro sync`, `npm run lint`, `npm audit`) and add `npm run typecheck` after lint. Move the `build` step here too (it doesn't depend on any later phase's infra) unless a later phase's job needs it — it doesn't, so it stays in this job.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run typecheck` exits 0 locally
- [ ] `.github/workflows/ci.yml` is valid YAML: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`
- [ ] `grep -c "typecheck" .github/workflows/ci.yml` returns ≥ 1

#### Manual Verification:

- [ ] Push a commit and confirm the `lint-and-typecheck` job appears in GitHub Actions and passes

---

## Phase 2: Deterministic print-CSS check

### Overview

Prove Risk #7 (no app chrome in print output) with a fast, infra-free test, and wire it into its own CI job so it doesn't wait on Supabase.

### Changes Required:

#### 1. Print-CSS source test

**File**: `src/pages/patterns/[id]/print.test.ts` (new, co-located with `print.astro` per the existing decision)

**Intent**: Read `print.astro`'s source text and assert: no `AppHeader` import/usage anywhere in the file; both the Print button and the Close link carry `print:hidden`; the `@media print` block contains all four expected rules (margin reset, banner hidden, color-adjust exact, `@page` margin).

**Contract**: A plain vitest file (no Astro rendering) using `node:fs` to read `import.meta.dirname + "/print.astro"` as text, then string/regex assertions per the bullet above. No Supabase, no DOM, no Container API.

#### 2. `.github/workflows/ci.yml`

**File**: `.github/workflows/ci.yml`

**Intent**: Add a `print-check` job that runs only this one test file, independent of the `test` job's Supabase dependency.

**Contract**: New job `print-check`: checkout, setup-node, `npm ci`, then `npx vitest run "src/pages/patterns/[id]/print.test.ts"`. No Supabase step, no `.dev.vars`/`.env.test` (this test needs neither).

### Success Criteria:

#### Automated Verification:

- [ ] `npx vitest run "src/pages/patterns/[id]/print.test.ts"` passes locally
- [ ] `grep -c "print-check" .github/workflows/ci.yml` returns ≥ 1

#### Manual Verification:

- [ ] Push a commit and confirm the `print-check` job appears in GitHub Actions and passes, independent of/parallel to the other jobs

---

## Phase 3: Supabase-in-CI for unit + integration tests

### Overview

Wire the existing `npm test` suite (unit + integration, currently local-only) into CI.

### Changes Required:

#### 1. `.github/workflows/ci.yml`

**File**: `.github/workflows/ci.yml`

**Intent**: Add a `test` job that starts a local Supabase stack (fresh per CI run, migrations + `seed.sql` apply automatically on first `start`), writes `.dev.vars`/`.env.test` with the well-known local demo keys (confirmed non-secret — same value on every local Supabase install, per Current State Analysis), then runs `npm test`.

**Contract**: New job `test`: checkout, setup-node, `npm ci`, `npx supabase start`, a step writing `.dev.vars` (`SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_KEY=<local anon key>`) and `.env.test` (`SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_SERVICE_ROLE_KEY=<local service-role key>`) via shell heredoc/echo, then `npm test`. The two key values are the fixed Supabase CLI local-dev defaults already visible in this repo's own `.dev.vars`/`.env.test` (not committed, but reproducible via `npx supabase status` on any machine) — copy them verbatim into the CI step, not from a GitHub secret.

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase start` succeeds on a clean checkout, then `npm test` passes locally against it
- [ ] `grep -c "supabase start" .github/workflows/ci.yml` returns ≥ 1

#### Manual Verification:

- [ ] Push a commit and confirm the `test` job appears in GitHub Actions, starts Supabase, and passes

---

## Phase 4: Seed fixture pattern

### Overview

Add one deterministic pattern to the seeded test user so Phase 5's e2e test has something to open — without it, "open pattern" has nothing to open.

### Changes Required:

#### 1. `supabase/seed.sql`

**File**: `supabase/seed.sql`

**Intent**: Insert one pattern owned by the seeded test user (`00000000-0000-0000-0000-000000000001`), sized well within the 20–100 bounds, with default empty grid/palette (valid per the `patterns_grid_length` check, which allows length 0). The `patterns_before_insert` trigger overwrites `slot`, `seq`, and `name` regardless of what's supplied, so only `user_id`, `width`, `height` need to be given.

**Contract**:

```sql
insert into public.patterns (user_id, width, height)
values ('00000000-0000-0000-0000-000000000001', 20, 20);
```

Appended after the existing user/identity seed in `supabase/seed.sql`, with a one-line comment noting it's the fixture pattern for the e2e smoke test (Phase 5) — no `on conflict` clause needed since `db reset` always starts from an empty `patterns` table.

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase db reset` applies cleanly and seeds exactly one row in `patterns` for the test user: `select count(*) from patterns where user_id = '00000000-0000-0000-0000-000000000001'` returns `1`
- [ ] `npx supabase test db` (existing pgTAP suite) still passes unchanged

#### Manual Verification:

- [ ] Sign in as `test@example.com` locally and confirm exactly one pattern appears on `/patterns`

---

## Phase 5: Playwright critical-path e2e smoke test

### Overview

Add the one narrow e2e exception decided during the `test-plan-refresh-2026-09-13` refresh: sign-in → open pattern → print, as a Playwright test.

### Changes Required:

#### 1. Playwright install + config

**File**: `package.json`, `playwright.config.ts` (new)

**Intent**: Add `@playwright/test` as a devDependency and a minimal config pointing Playwright's `webServer` at `astro dev` (per your decision — no build step, no Workers-runtime fidelity needed for a smoke test).

**Contract**: `playwright.config.ts` sets `testDir: "./e2e"`, `webServer: { command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: !process.env.CI }`, and `use.baseURL: "http://localhost:4321"`. Add `"test:e2e": "playwright test"` to `package.json` scripts.

#### 2. Critical-path spec

**File**: `e2e/critical-path.spec.ts` (new)

**Intent**: Drive the real UI: sign in as the seeded test user, land on `/patterns`, open the seeded fixture pattern (Phase 4) into its editor, click the editor's "Print" link, and assert the `/print` page renders (grid SVG and legend visible, no nav/toolbar present).

**Contract**: Steps — fill `#email`/`#password` with the seeded credentials, submit, `page.waitForURL('**/patterns')`; locate the pattern-open link generically (`a[href^="/patterns/"]` excluding any `/print`-suffixed href) rather than by name text, since the seeded pattern's auto-assigned name isn't a fixed literal this test should depend on; click it, wait for the editor to render; click the link with accessible name "Print"; `page.waitForURL('**/print')`; assert `#pattern-grid-svg` is visible and no nav/header element (matching `AppHeader`'s rendered markup) is present.

#### 3. `.github/workflows/ci.yml`

**File**: `.github/workflows/ci.yml`

**Intent**: Add an `e2e` job mirroring Phase 3's Supabase-in-CI steps (each GitHub Actions job is an isolated VM, so the setup can't be shared without a composite action — out of scope for a single job), then installs Playwright's browser binaries and runs the spec.

**Contract**: New job `e2e`: checkout, setup-node, `npm ci`, `npx playwright install --with-deps chromium`, `npx supabase start`, the same `.dev.vars`/`.env.test` write step as Phase 3, then `npm run test:e2e`.

### Success Criteria:

#### Automated Verification:

- [ ] `npx playwright test` passes locally against a running local Supabase stack (`npx supabase start` + `npm run dev` in another terminal, or via Playwright's own `webServer`)
- [ ] `grep -c "test:e2e\|playwright" .github/workflows/ci.yml` returns ≥ 1

#### Manual Verification:

- [ ] Push a commit and confirm the `e2e` job appears in GitHub Actions and passes
- [ ] Manually break the editor's Print link (e.g. comment it out locally) and confirm the spec fails, proving it exercises the real interaction rather than trivially passing

---

## Phase 6: Docs sync

### Overview

Bring `test-plan.md`'s cookbook and `README.md` in line with what now actually exists, and sweep for stale "doesn't exist yet" claims per lessons.md L-02.

### Changes Required:

#### 1. `context/foundation/test-plan.md` §6 Cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Fill in §6.4 ("Adding a print/visual check," currently `TBD`) with the actual location/naming/run-command for the Phase 2 print-CSS test, and add a new §6.6 for the Playwright e2e pattern (location `e2e/`, naming `<flow-name>.spec.ts`, reference test `e2e/critical-path.spec.ts`, run command `npm run test:e2e`). Append a §6.5 per-rollout-phase note for this phase (mirroring the existing §6.5 entries for Phase 2), and bump the Freshness Ledger / header date.

**Contract**: Same structure as existing §6.1–§6.3 entries (Location / Naming / Reference test / Run command).

#### 2. `README.md` Scripts table

**File**: `README.md`

**Intent**: Add rows for `npm run typecheck` and `npm run test:e2e` to the existing Scripts table.

**Contract**: Two new rows following the existing table's format.

#### 3. Stale-claim sweep (lessons.md L-02)

**File**: various (grep sweep, no fixed target)

**Intent**: Since this phase introduces the project's first CI-wired tests, first Playwright dependency, and first seeded pattern, grep for claims that any of these don't exist yet, per L-02.

**Contract**: Run `grep -rniE "no migrations|does(n't| not) exist|not yet|none required|not required" README.md context/foundation/*.md context/deployment/*.md` and correct any hit that's now false (scope limited to living docs per L-02 — skip `context/changes/*/plan.md` and `reviews/*.md`).

### Success Criteria:

#### Automated Verification:

- [ ] `grep -c "TBD" context/foundation/test-plan.md` §6.4/§6.6 no longer show `TBD` for print-check/e2e specifically (other still-pending §6 entries, if any, are unaffected)
- [ ] Stale-claim sweep command above returns no unaddressed hits in living docs

#### Manual Verification:

- [ ] Read the updated §6 entries end-to-end and confirm they'd let a future developer add a similar test without re-deriving the pattern

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `print.test.ts` — source-text assertions for chrome exclusion and print CSS (Phase 2).

### Integration Tests:

- No new integration tests — Phases 1–4 wire existing test suites into CI rather than adding new ones (except the print-check unit test itself).

### Manual Testing Steps:

1. Push a PR touching only docs and confirm all four CI jobs (`lint-and-typecheck`, `print-check`, `test`, `e2e`) run and pass.
2. Sign in locally as `test@example.com`, confirm exactly one pattern is visible, open it, click Print, confirm the print preview shows only grid + legend (no nav/toolbar) both on screen and via the browser's print preview.
3. Temporarily break something in each gate's target (a type error, a chrome-visible print rule, a failing integration assertion, a broken Print link) one at a time and confirm the corresponding CI job — and only that job — goes red.

## Performance Considerations

`supabase start` in a cold CI runner (no image cache) is expected to take roughly 1.5–3 minutes per job (Phase 3 and Phase 5 each pay this cost independently, since GitHub Actions jobs are isolated VMs). This is a one-time infrastructure cost accepted per the already-decided CI-failure-mode answer (no retry logic, treat like any other required gate).

## Migration Notes

`supabase/seed.sql`'s new pattern row (Phase 4) only affects local/CI ephemeral databases (`db reset` always starts from empty) — no production migration or backfill is involved.

## References

- Related research: `context/changes/testing-print-quality-gates/research.md`
- Refresh that authorized the e2e exception: `context/changes/test-plan-refresh-2026-09-13/plan.md`
- Strategy: `context/foundation/test-plan.md` §3 Phase 3, §4, §5, §7
- Similar cookbook entries: `context/foundation/test-plan.md` §6.1–§6.3

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Typecheck gate

#### Automated

- [x] 1.1 `npm run typecheck` exits 0 locally — b9fe358
- [x] 1.2 `.github/workflows/ci.yml` is valid YAML — b9fe358
- [x] 1.3 `grep -c "typecheck" .github/workflows/ci.yml` returns ≥ 1 — b9fe358

#### Manual

- [ ] 1.4 `lint-and-typecheck` job appears in GitHub Actions and passes

### Phase 2: Deterministic print-CSS check

#### Automated

- [x] 2.1 `npx vitest run "src/pages/patterns/[id]/print.test.ts"` passes locally — a8a0ddb (CI fix: ffc851e)
- [x] 2.2 `grep -c "print-check" .github/workflows/ci.yml` returns ≥ 1 — a8a0ddb (CI fix: ffc851e)

#### Manual

- [ ] 2.3 `print-check` job appears in GitHub Actions and passes independently

### Phase 3: Supabase-in-CI for unit + integration tests

#### Automated

- [x] 3.1 `npx supabase start` + `npm test` passes locally — 101121f
- [x] 3.2 `grep -c "supabase start" .github/workflows/ci.yml` returns ≥ 1 — 101121f

#### Manual

- [ ] 3.3 `test` job appears in GitHub Actions, starts Supabase, and passes

### Phase 4: Seed fixture pattern

#### Automated

- [x] 4.1 `npx supabase db reset` seeds exactly one pattern for the test user
- [x] 4.2 `npx supabase test db` still passes unchanged

#### Manual

- [ ] 4.3 Exactly one pattern visible on `/patterns` when signed in locally as the seeded user

### Phase 5: Playwright critical-path e2e smoke test

#### Automated

- [ ] 5.1 `npx playwright test` passes locally against a running local Supabase stack
- [ ] 5.2 `grep -c "test:e2e\|playwright" .github/workflows/ci.yml` returns ≥ 1

#### Manual

- [ ] 5.3 `e2e` job appears in GitHub Actions and passes
- [ ] 5.4 Breaking the editor's Print link locally makes the spec fail

### Phase 6: Docs sync

#### Automated

- [ ] 6.1 §6.4/§6.6 no longer read `TBD` for print-check/e2e
- [ ] 6.2 Stale-claim sweep returns no unaddressed hits in living docs

#### Manual

- [ ] 6.3 Updated §6 entries read coherently end-to-end
