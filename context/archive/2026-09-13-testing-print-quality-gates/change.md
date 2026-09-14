---
change_id: testing-print-quality-gates
title: Print correctness + quality-gates wiring
status: archived
created: 2026-09-13
updated: 2026-09-14
archived_at: 2026-09-14T15:39:29Z
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Print correctness + quality-gates wiring".
Risks covered: #7 (printed page shows app chrome instead of only grid+legend). Test types planned: deterministic DOM/CSS check + selective AI-native visual spot-check.
Risk response intent: #7 — prove printing a pattern produces a page with only grid+legend visible under the print media query (no nav, toolbar, or buttons); challenge the assumption that a visual "looks fine" pass is enough without checking the print media query itself directly; avoid full multimodal review on every UI tweak (explicitly out of scope per interview Q3/Q5) — the AI-native layer is a secondary, selective spot-check only.
This phase also wires the required quality gates (lint, typecheck, unit+integration, e2e on critical flows) into CI per §5 of the test plan.

## /10x-plan interview (2026-09-13) — paused pending test-plan refresh

`research.md` surfaced that "e2e on critical flows" doesn't match test-plan §5's actual rows (deterministic print-CSS check + optional multimodal review, no e2e row). Decision: open `/10x-test-plan --refresh` to reconcile the strategy before finalizing this plan, rather than reinterpreting the wording unilaterally. `/10x-plan` should resume from here once the refresh lands, without re-asking the below.

Decisions already made in the interview (still valid regardless of the refresh outcome):
- **Print-media assertion**: static class/CSS assertion (parse SSR-rendered HTML for `print:hidden` classes + the `@media print` block's rules as text/AST) — no new browser-test dependency, no Playwright.
- **Test placement**: co-locate as a unit test next to `print.astro` (not `test/integration/`) — this is pure rendering output, no real Supabase/auth dependency, unlike the existing per-risk integration tests.
- **Supabase-in-CI**: `supabase/setup-cli` GitHub Action + local `supabase start` (Docker-based) inside the CI job, mirroring the existing local dev workflow.
- **Selective visual spot-check**: stays a manual/local step (run via Claude Browser MCP by a developer/agent before merging print-view changes) — not a CI gate, since MCP tools aren't invocable from a GitHub Actions job.
- **CI structure**: split into parallel jobs in the same `ci.yml` workflow (`lint-and-typecheck`, `test`, `print-check`) rather than one flat sequential job.
- **Secret provisioning**: plan will include an explicit manual action item (with exact `gh secret set` command) for provisioning `SUPABASE_SERVICE_ROLE_KEY`, rather than assuming it or deriving it silently.
- **Priority if infra work overruns**: print-check + typecheck gate are must-have; Supabase-in-CI (unit+integration gate) may slip to a fast-follow change if it proves harder than expected.
