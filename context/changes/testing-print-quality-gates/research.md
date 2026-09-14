---
date: 2026-09-13T10:24:56+02:00
researcher: Zhanna Kabysheva
git_commit: bed12383c1bd12d69e7f6f5b83244ac8fc9d6a9b
branch: implement-test-plan-print-quality-gates
repository: kratka
topic: "Phase 3 — Print correctness (Risk #7) + quality-gates wiring"
tags: [research, codebase, print-view, ci, vitest, quality-gates]
status: complete
last_updated: 2026-09-13
last_updated_by: Zhanna Kabysheva
---

# Research: Phase 3 — Print correctness (Risk #7) + quality-gates wiring

**Date**: 2026-09-13T10:24:56+02:00
**Researcher**: Zhanna Kabysheva
**Git Commit**: bed12383c1bd12d69e7f6f5b83244ac8fc9d6a9b
**Branch**: implement-test-plan-print-quality-gates
**Repository**: kratka

## Research Question

For rollout Phase 3 of `context/foundation/test-plan.md` ("Print correctness + quality-gates wiring"):

1. Risk #7 — prove the printed page shows only grid+legend, no app chrome. Ground the deterministic DOM/CSS test approach and the selective AI-native visual spot-check.
2. Ground CI quality-gates wiring (lint, typecheck, unit+integration, e2e on critical flows) per test-plan §5, against what's actually in `.github/workflows/ci.yml` today.

## Summary

**Risk #7 chrome exclusion is structural, not CSS-hidden**, for the nav/toolbar itself: `src/pages/patterns/[id]/print.astro` never composes `AppHeader` at all — there is no nav in the DOM to hide. Only two elements local to the print page (the Print button, the Close link) plus an incidental config-missing banner are CSS-suppressed via `print:hidden` / `@media print`. This means the test needs **two different assertion strategies**: DOM-absence for the nav (no browser needed, SSR HTML is enough) and computed-style-under-print-media for the Print/Close buttons.

**The test-plan's §5 claim that "lint + typecheck" are already wired in CI is only half true.** Lint is wired; **typecheck is not** — there is no `astro check` / `tsc --noEmit` step anywhere (not in `package.json` scripts, not in `ci.yml`, not in the pre-commit hook). `@astrojs/check` is an installed dependency that is never invoked. This is a real gap Phase 3 must close, not a no-op confirmation.

**Unit+integration wiring into CI is a real gap, not a toggle**: `npm test` runs both suites together (single `vitest.config.ts`, `fileParallelism: false`) but integration tests need a live local Supabase stack + `.env.test` with `SUPABASE_SERVICE_ROLE_KEY`, and CI today has neither — no `supabase start` step, no Docker/Supabase CI action, and the two secrets already in `ci.yml` (`SUPABASE_URL`, `SUPABASE_KEY`) don't even match what integration tests need (`SUPABASE_SERVICE_ROLE_KEY` vs. `SUPABASE_KEY`/anon key).

**"e2e on critical flows" does not correspond to anything in the test-plan's own §5 table.** The plan's actual Phase 3 gates are "deterministic print-CSS check" and "multimodal visual review (optional, selective)" — there is no e2e row, and §4/§7 explicitly reject broad automated UI-path coverage (interview Q5). This phrasing likely entered via the /10x-new argument text rather than the plan itself and should be reconciled during `/10x-plan`, not treated as a mandate to add Playwright/Cypress.

## Detailed Findings

### Print view — route, DOM structure, and CSS

- The print route is a single self-contained Astro page: [src/pages/patterns/[id]/print.astro](../../../src/pages/patterns/[id]/print.astro). No React island is used — the grid is server-rendered inline SVG (lines 91–151), the legend is a plain `<ul>` (lines 153–169). Contrast with the editor route, which mounts `PatternEditor.tsx` as a `client:load` island (`src/pages/patterns/[id].astro:46`).
- The only interactivity is one inline `<script>` wiring the on-page Print button to `window.print()` (`print.astro:185-189`).
- **Chrome exclusion is structural**: `print.astro` renders inside the shared `Layout.astro` but never imports or renders `AppHeader` (`src/components/AppHeader.astro`), which is the app's nav/toolbar. `AppHeader` is only composed on `src/pages/patterns.astro:5,22` (dashboard) and `src/pages/patterns/[id].astro:5,44` (editor). `Layout.astro` itself (`src/layouts/Layout.astro:1-49`) contains no nav — just `<html>/<head>/<body>` + an optional config-missing `Banner` + `<slot />`.
- **Elements that DO exist in the print page's DOM and are CSS-hidden for print**, all in `print.astro`:
  - Print button — `print:hidden` (line 85)
  - Close link — `print:hidden` (line 175)
  - Config-missing `Banner` (from `Layout.astro`, only renders if config is missing) — hidden via `@media print { :global(.banner) { display: none } }` (lines 203–206), a defensive rule for an edge case
  - The full `@media print` block (lines 198–214) also sets `html/body { margin: 0 }`, forces `print-color-adjust: exact` on `*`, and sets `@page { margin: 1cm }`.
- `grep -rn "print:"` and `grep -rln "@media print"` across `src/` both return only this one file — no other print-specific CSS exists anywhere else in the codebase.
- No print tests exist today. No `e2e/`/`tests/e2e/` directory, no Playwright/Cypress dependency anywhere in `package.json` (the only "Playwright" hits in the repo are unrelated course notes under `notes/modules/`).

### Historical design intent (archive)

- `context/archive/2026-09-10-color-print-view/` has no `research.md`, only `change.md`, `plan-brief.md`, `plan.md`, `reviews/`.
- `plan.md`'s Current State Analysis (lines 25–30) confirms the exclusion was *intentionally* structural: "no print CSS exists anywhere... there is no persistent app-wide header/nav injected by the shared layout, so a print page built on it starts from a clean baseline rather than needing to fight existing chrome."
- Plan Phase 2, "Print polish" (lines 194–214), scoped exactly the CSS now present: `print:hidden` for non-content chrome (Print button, incidental banner) plus color-adjust/page-margin rules.
- Manual verification criteria (lines 316–319) required confirming "only the grid, legend, and footer" print, checked off manually (Progress log, lines 412–413) — explicitly **no automated test was ever written**, because no JS test runner existed in the repo at that time (lines 337–347). Phase 1 of this test-plan rollout (`testing-critical-path-coverage`) is what introduced vitest.

### CI — current state

Full contents of [.github/workflows/ci.yml](../../../.github/workflows/ci.yml):

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx astro sync
      - run: npm run lint
      - run: npm audit --audit-level=high
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
```

Single job, on `ubuntu-latest`, triggered on push/PR to `main`. Currently wired: checkout, Node 22 setup, `npm ci`, `astro sync` (regenerates Astro's generated types — not a typecheck), `npm run lint` (→ `eslint .`), `npm audit --audit-level=high`, `npm run build`.

**Missing entirely**: no test step (`npm test`/vitest), no explicit typecheck step, no pgTAP step (`npx supabase test db`), no print-CSS/e2e step.

### Typecheck — not actually wired (contradicts test-plan §5's framing)

- `package.json` scripts (lines 5–15): `dev`, `build`, `preview`, `astro`, `lint`, `lint:fix`, `format`, `test` (`vitest run`), `test:watch`. **No `typecheck` script.**
- `@astrojs/check` is a devDependency (`package.json:17`) but is never invoked by any script, by `ci.yml`, or by the pre-commit hook.
- `.husky/pre-commit` just runs `npx lint-staged`; `lint-staged` config (`package.json:65-72`) only runs `eslint --fix` / `prettier --write` — no type-checking there either.
- `context/foundation/test-plan.md` §5 states `lint + typecheck | local + CI (already wired, .github/workflows/ci.yml) | required`. This is inaccurate for the "typecheck" half — lint is wired, typecheck is not. This is a strategy-affecting correction (Phase 3 needs to actually add a typecheck step, e.g. `astro check` or `tsc --noEmit`), not a cosmetic value per [lessons.md L-04](../../foundation/lessons.md) (which covers purely descriptive stale values, not gates that a rollout phase is supposed to wire).

### Unit + integration — single vitest config, CI gap is Supabase-in-CI

- `vitest.config.ts:19-26` — one `test` block: `include: ["src/**/*.test.ts", "test/**/*.test.ts"]`, `setupFiles: ["./test/setup/load-env.ts"]`, `fileParallelism: false` (inline comment: integration files share one local Postgres, some races are timing-sensitive by construction — matches test-plan §6.3).
- Both unit (`src/lib/patternEstimator.test.ts` — the only unit test) and integration (5 files under `test/integration/`: `patterns-round-trip`, `patterns-authorization`, `patterns-concurrent-create`, `patterns-input-bounds`, `patterns-soft-delete`) run under the same `npm test` command — no tag/project separation exists to run "unit only" without also needing Supabase up, unless CI adds an explicit path filter or the config is split.
- Integration tests require a live local Supabase stack (`npx supabase start`, Docker) and `.env.test` (gitignored) with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (test-plan §6.2). **None of this is addressed in CI today**: no `supabase-cli` GitHub Action reference, no `docker-compose*.yml` anywhere in the repo, `ci.yml` never runs `supabase start` or provisions `.env.test`.
- The only Supabase secrets currently in `ci.yml` (`SUPABASE_URL`, `SUPABASE_KEY`) are scoped to the `npm run build` step and don't match what integration tests need — `SUPABASE_KEY` (anon/publishable) ≠ `SUPABASE_SERVICE_ROLE_KEY` (admin key needed for `createTestUser()` via the Admin API, per test-plan §6.2). No `SUPABASE_SERVICE_ROLE_KEY` secret exists in CI at all.
- `supabase/tests/database/patterns_rls.test.sql` (pgTAP, test-plan §4's "only existing test layer" before Phase 1) is also not wired into `ci.yml` — no `npx supabase test db` step exists.

### "e2e on critical flows" — terminology mismatch against the plan itself

- Test-plan §5's actual quality-gates rows for this phase are `deterministic print-CSS check | CI on PR | required after §3 Phase 3` and `multimodal visual review | CI on PR | optional, selective (print view only)` — there is no row literally named "e2e."
- Test-plan §4 states `e2e | none — not planned | — | Interview Q5 rejected broad automated UI-path coverage; no e2e rollout phase is scoped`, and §7 lists "Exhaustive automated UI-path coverage" as a deliberate non-goal.
- No Playwright/Cypress dependency or config exists anywhere in the repo today.
- Conclusion: the "e2e on critical flows" phrasing in this change's framing doesn't match what the frozen strategy (§1–§5) actually scopes for Phase 3. `/10x-plan` should treat the deterministic print-CSS check (plus the optional selective visual spot-check) as the actual deliverable, not introduce a new Playwright/Cypress suite — unless the user explicitly wants to amend the frozen strategy via `/10x-test-plan --refresh` first.

## Code References

- `src/pages/patterns/[id]/print.astro:78-181` — print route body; no `AppHeader` import/render anywhere in the file
- `src/pages/patterns/[id]/print.astro:82-88` — Print button, `print:hidden` on line 85
- `src/pages/patterns/[id]/print.astro:173-178` — Close link, `print:hidden` on line 175
- `src/pages/patterns/[id]/print.astro:185-189` — inline script wiring Print button to `window.print()`
- `src/pages/patterns/[id]/print.astro:198-214` — `@media print` block (margins, banner hide, color-adjust, `@page` rule)
- `src/components/AppHeader.astro` — nav/toolbar component, composed only by `src/pages/patterns.astro:5,22` and `src/pages/patterns/[id].astro:5,44`
- `src/layouts/Layout.astro:1-49` — shared layout used by all three pages; contains no nav, only an optional config-missing `Banner`
- `.github/workflows/ci.yml:1-25` — full current CI workflow
- `package.json:5-15` — scripts (`test`: `vitest run`; no `typecheck` script)
- `package.json:17` — `@astrojs/check` devDependency, never invoked
- `.husky/pre-commit` + `package.json:65-72` (`lint-staged` config) — no type-checking in the pre-commit hook
- `vitest.config.ts:19-26` — shared unit+integration config, `fileParallelism: false`
- `test/integration/` — `patterns-round-trip.test.ts`, `patterns-authorization.test.ts`, `patterns-concurrent-create.test.ts`, `patterns-input-bounds.test.ts`, `patterns-soft-delete.test.ts`
- `src/lib/patternEstimator.test.ts` — the only unit test

## Architecture Insights

- The codebase's chrome-exclusion pattern for special-purpose pages is "don't compose the nav component," not "hide it with CSS." Any future chrome-free page (if one is added) would likely follow the same convention — worth keeping in mind for the deterministic test's generality (asserting `AppHeader` markup absence, not just visual hiding).
- Test infrastructure is genuinely single-track: one vitest config, one `npm test` command, `fileParallelism: false` project-wide. Any CI wiring for "unit+integration" is effectively "wire Supabase-in-CI," not a smaller unit-only subset, unless Phase 3 chooses to split the config or add a path-filtered command.
- The existing `SUPABASE_URL`/`SUPABASE_KEY` CI secrets were provisioned for the Astro build step only; they are insufficient as-is for integration tests, which need a service-role key. This is a new secret to provision, not a reuse.

## Historical Context (from prior changes)

- `context/archive/2026-09-10-color-print-view/plan.md` — original S-03 implementation plan; confirms print-CSS scoping and structural chrome exclusion were both intentional design decisions, verified only manually (no test runner existed yet).
- `context/changes/testing-critical-path-coverage/` (Phase 1, archived reference in test-plan §3) — introduced the vitest runner and `src/lib/patternEstimator.test.ts` pattern (§6.1 cookbook).
- `context/changes/testing-authorization-guardrails/` (Phase 2, complete) — introduced the `test/integration/` pattern, two-user fixture convention (§6.3 cookbook), and the `fileParallelism: false` vitest setting.
- [lessons.md](../../foundation/lessons.md) L-04 — governs how to handle stale *cosmetic* doc values (plain replace, no narrative). Explicitly does not apply to the typecheck-gate finding above, since that's a real, unwired gate rather than a descriptive fact.

## Related Research

- None yet under `context/changes/**/research.md` specifically for print or CI — this is the first research pass covering both.

## Open Questions

1. **Typecheck gate**: test-plan §5 says "already wired" but it isn't. Should `/10x-plan` add an `astro check` (or `tsc --noEmit`) step to `ci.yml`, and should test-plan §5 be corrected to reflect this as a Phase 3 deliverable rather than a pre-existing gate?
2. **Supabase-in-CI**: standing up a local Supabase stack in GitHub Actions (Docker-based `supabase start`, or an alternative) is nontrivial and unaddressed. Is this squarely in scope for Phase 3, or should integration tests initially run against a Supabase CI Action / hosted test project, deferring full local-stack-in-CI to a later change? Needs a decision in `/10x-plan`, not assumed here.
3. **"e2e on critical flows" wording**: does not match test-plan §5's actual rows (deterministic print-CSS check + optional multimodal spot-check). Confirm with the user whether this was shorthand for the print-CSS gate, or whether the frozen strategy needs a `/10x-test-plan --refresh` before Phase 3 proceeds with something broader.
4. **Secret naming**: CI's `SUPABASE_KEY` secret (anon key, used for build) is distinct from the `SUPABASE_SERVICE_ROLE_KEY` integration tests need locally via `.env.test`. A new CI secret will need to be provisioned — confirm who owns adding repository secrets (outside `/10x-plan`'s normal scope, may need a human action item).
