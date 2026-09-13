---
change_id: test-plan-refresh-2026-09-13
title: Refresh test-plan.md — CI gate honesty + one critical-path e2e smoke test
status: implementing
created: 2026-09-13
updated: 2026-09-13
archived_at: null
---

## Notes

Refresh context/foundation/test-plan.md triggered by user concern surfaced during /10x-plan for rollout Phase 3 (testing-print-quality-gates): "CI can go green while a real bug ships" — because several gates the plan already scopes for this phase aren't actually enforced in CI yet (typecheck, unit+integration/Supabase-in-CI). research.md (context/changes/testing-print-quality-gates/research.md) already diagnosed the concrete gaps:
- §5 line "lint + typecheck | local + CI (already wired, .github/workflows/ci.yml) | required" is factually wrong for the typecheck half — no `typecheck` script, no CI step, no pre-commit check invokes `@astrojs/check` (installed but unused).
- Unit+integration tests can't run in CI at all today (no Supabase-in-CI stack, missing SUPABASE_SERVICE_ROLE_KEY secret) — §5 already correctly scopes this as "required after §3 Phase 3", not claimed as wired, so this line is fine as-is.

New decision from this refresh interview: the user wants ONE minimal Playwright critical-path e2e smoke test (e.g. sign-in → open pattern → print) added as a narrow, explicit exception to the existing "no broad e2e" stance (§4/§7) — not a reversal of it. This directly targets the "green build, real bug" fear for the single flow that matters most, while keeping cost×signal intact (one flow, not broad UI automation).

Refresh should update:
1. §4 Stack — change the `e2e` row from "none — not planned" to a minimal Playwright critical-path smoke test, scoped explicitly to one flow, with a `checked:` date.
2. §5 Quality Gates — correct the `lint + typecheck` row to state lint is wired but typecheck is not, required after §3 Phase 3. Add a new gate row for the critical-path e2e smoke test, required after §3 Phase 3.
3. §3 Phase 3 — update the "Test types" column and one-line goal to include the minimal e2e smoke test alongside the existing deterministic DOM/CSS check + selective visual spot-check.
4. §7 "What we deliberately don't test" — keep the "no exhaustive automated UI-path coverage" exclusion, but add a one-line note that the single critical-path smoke test is a deliberate, narrow exception decided during this refresh, not a reversal.

Hot-spot scan re-run during this refresh found no new top-churn directory beyond what §2 already reflects (editor/API/dashboard still lead) — no risk-map changes needed.

This change folder's plan.md (or the resuming /10x-plan for testing-print-quality-gates) is responsible for writing these corrections into context/foundation/test-plan.md, then that same plan should hand back to finalizing the Phase 3 (`testing-print-quality-gates`) plan, since that is the change this refresh was blocking.
