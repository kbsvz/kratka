# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-12 (research backport: Risk #1 reload-path gap, Risk #3 roadmap citation)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in area Y"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`
(excluding `node_modules`, `dist`, generated types).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | A user draws/edits a pattern, saves it, and reopens it — the grid, palette, or dimensions don't match what was drawn (silent corruption, not a visible error). Research (2026-09-12) found the write path is already zod+CHECK-constraint guarded; the concrete gap is the reload path, which casts DB data with no re-validation | High | High | PRD US-01 acceptance criteria; interview Q1; hot-spot `src/components/editor/` (10 commits/30d), `src/pages/api/` (12 commits/30d); research.md 2026-09-12 (`testing-critical-path-coverage`) |
| 2 | A user reaches, views, or modifies another user's pattern via the API by manipulating a pattern id — the app-layer ownership check, not just RLS, is untested | High | Medium | PRD Access Control guardrail; PRD NFR ("never see or modify another user's patterns"); hot-spot `src/pages/api/` (12 commits/30d) — abuse lens: authorization/IDOR |
| 3 | The printed thread-count or time-estimate legend doesn't match the actual drawn grid | High | Medium | PRD Business Logic section (authoritative: 7mm/stitch, 150 stitches/hour — confirmed matching code by research 2026-09-12); PRD NFR ("no discrepancy between drawn and printed"); roadmap S-03 risk note ("must exactly match... primary correctness NFR" — note: roadmap.md's "45 cm/stitch" figure is stale/superseded, do not use it for test fixtures); hot-spot `src/lib/` (low churn, pure logic, zero tests) |
| 4 | A user creates a 4th pattern, or slot/name assignment desyncs, under concurrent create requests | Medium-High | Medium | PRD FR-005, FR-006; roadmap F-01 risk note ("misconfigured policy silently violates guardrail across all slices"); lessons.md L-03 (prior seed/schema desync incident) |
| 5 | Server accepts an out-of-bounds grid (dimensions outside 20–100, palette over 30 colors) because validation is client-side only | Medium | Medium | PRD FR-004, FR-007; PRD NFR (100×100 performance ceiling) — abuse lens: untrusted input / resource abuse |
| 6 | A soft-deleted pattern remains reachable — still shows in the list, still opens, or still prints | Medium | Medium | PRD FR-013 (deletion must be invisible to the owner); roadmap F-01 (soft delete via `deleted_at`) |
| 7 | The printed page shows app chrome (toolbar, nav, buttons) instead of only the grid and legend | Medium | Low-Medium | PRD FR-016; roadmap S-03; interview Q3 (frequent UI-layout churn raises drift likelihood) |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Saving a non-trivial grid+palette and reopening it reproduces the exact cell data, dimensions, and palette; AND a row seeded with a mismatched grid length behaves predictably (not silently truncated/padded) when read back on reload | "It rendered something on reopen" is mistaken for "it rendered the same thing"; the write path being guarded is mistaken for the reload path also being guarded | Grid encoding format, save/load API contract, partial-write handling, and specifically the reload path's lack of re-validation vs. the write path's zod schemas | integration (API round-trip against real Supabase) for the write side; a second, narrower test seeding a malformed row directly for the reload-path gap | Asserting against the implementation's own serialization instead of an independently-known input grid; testing only the well-formed happy path and missing the unvalidated-reload gap entirely |
| #2 | A second user's authenticated request against a pattern id they don't own is rejected, not just filtered from their list | "RLS covers it" — RLS is DB-layer; the API route's own ownership check is a separate, untested surface | Auth session shape, route handler's ownership-check logic, RLS interaction | integration (API test with two seeded users) | Testing only the owning user's happy path and calling it isolation coverage |
| #3 | For a known grid input, computed thread length and time exactly match hand-calculated values from the fixed constants | Comparing output to itself after a refactor instead of to an independently hand-computed expected value | The two fixed rate constants and their rounding/formatting rules | unit (pure function) | Oracle problem: asserting against current output instead of a hand-computed expected value |
| #4 | A 4th create attempt (or concurrent creates at the cap) is rejected server-side, with slot/name state left consistent | "It's disabled in the UI" is mistaken for "the server rejects it" | Partial unique index behavior, name-pool exclusion logic | integration (API + DB) | Testing only the UI-disabled state, never hitting the API directly |
| #5 | A request with out-of-range dimensions or an oversized palette is rejected with a clear error, not silently clamped or stored | Client-side validation existing is mistaken for server-side validation | zod schema bounds on the API route | unit/integration (API validation) | Trusting client-side bounds as sufficient evidence |
| #6 | A soft-deleted pattern's id returns not-found from list, open, and print routes alike | Deleting removes it from the list, and that is assumed to cover every other route | Where `deleted_at` filtering is (and isn't) applied per route | integration (API, per route) | Testing only the list endpoint and assuming other routes inherit the filter |
| #7 | Printing a pattern produces a page with only grid+legend visible under the print media query — no nav, toolbar, or buttons | A visual "looks fine" pass without checking the print media query itself | Print CSS scoping, `@media print` rules | deterministic (DOM/CSS assertion); selective AI-native visual check as a secondary layer only | Full multimodal review on every UI tweak (explicitly out of scope per interview Q3/Q5) |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap runner + critical-path coverage | Prove the save/reload round-trip and the estimator math are correct | #1, #3 | unit + integration | researched | `context/changes/testing-critical-path-coverage/` |
| 2 | Authorization & business-rule guardrails | Prove ownership checks, the 3-pattern cap, input bounds, and soft-delete invisibility hold at the API layer | #2, #4, #5, #6 | integration | not started | — |
| 3 | Print correctness + quality-gates wiring | Lock in chrome-free print output; wire required gates into CI | #7 | deterministic DOM/CSS check + selective AI-native visual spot-check | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

No standalone AI-native rollout phase — the Phase 2 interview explicitly rejected broad automated UI-path coverage (Q5), and cost×signal doesn't justify one beyond the single selective print-view check folded into Phase 3.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section are grounded in local manifests/configs;
no docs or search MCP was available in the current session.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| database | pgTAP (`npx supabase test db`) | via `supabase` CLI ^2.23.4 | Only existing test layer today — covers RLS isolation (`supabase/tests/database/patterns_rls.test.sql`) |
| unit + integration | none yet — see §3 Phase 1 | — | No vitest/jest/similar installed; Phase 1 bootstraps the runner |
| API mocking | none yet — see §3 Phase 1 | — | Integration tests should hit a real local Supabase instance per existing pgTAP convention, not mock the DB |
| e2e | none — not planned | — | Interview Q5 rejected broad automated UI-path coverage; no e2e rollout phase is scoped |
| accessibility | none — not planned | — | Not raised as a risk in discovery or interview; out of scope for this rollout |
| (optional) AI-native | Claude Browser MCP — checked: 2026-09-10 | n/a | Selective visual spot-check of the print view only (Risk #7); do NOT use for routine UI-layout iteration (interview Q3/Q5) |

**Stack grounding tools (current session):**
- Docs: none available — checked: 2026-09-10
- Search: none available — checked: 2026-09-10
- Runtime/browser: Claude Browser MCP available — possible use as the selective print-view visual check in Phase 3; checked: 2026-09-10
- Provider/platform: none connected (no Supabase/Cloudflare/GitHub MCP in this session) — checked: 2026-09-10

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI (already wired, `.github/workflows/ci.yml`) | required | syntactic / type drift |
| pgTAP (database) | local (`npx supabase test db`) | required after §3 Phase 2 | RLS/schema regressions |
| unit + integration | local + CI | required after §3 Phase 1 | save/reload and estimator regressions |
| API authorization tests | CI | required after §3 Phase 2 | ownership/IDOR, cap, validation, soft-delete regressions |
| deterministic print-CSS check | CI on PR | required after §3 Phase 3 | app chrome leaking into print output |
| multimodal visual review | CI on PR | optional, selective (print view only) | visual issues the deterministic check misses |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test
- TBD — see §3 Phase 1 (estimator math, Risk #3).

### 6.2 Adding an integration test
- TBD — see §3 Phase 1 (save/reload round-trip, Risk #1).

### 6.3 Adding an API authorization/business-rule test
- TBD — see §3 Phase 2 (ownership, cap, validation, soft-delete — Risks #2, #4, #5, #6).

### 6.4 Adding a print/visual check
- TBD — see §3 Phase 3 (chrome-free print output, Risk #7).

### 6.5 Per-rollout-phase notes
(Filled in after each phase lands.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5).

- **Exhaustive automated UI-path coverage** — the team explicitly does not want every UI path automated; where UI behavior needs a test, it should run against prepared/seeded test data rather than exploring permutations. Re-evaluate if the app grows enough user-facing complexity that manual smoke testing stops being reliable. (Source: Phase 2 interview Q5.)
- **UI layout / visual snapshot tests** — layout is iterated frequently for usability and design; snapshot tests here would break constantly and catch nothing. Re-evaluate once the visual design stabilizes. (Source: Phase 2 interview Q3.)
- **Auth page rendering (Supabase-backed logic itself)** — Supabase owns the actual auth mechanics; only the app's own ownership/authorization logic on top of it is in scope (see Risk #2). (Source: PRD Access Control section — auth mechanism is a third-party boundary, not app logic.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-10
- Stack versions last verified: 2026-09-10
- AI-native tool references last verified: 2026-09-10

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
