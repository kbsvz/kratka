# Test-Plan Refresh (2026-09-13) — Plan Brief

> Full plan: `context/changes/test-plan-refresh-2026-09-13/plan.md`

## What & Why

Correct an inaccurate claim in `context/foundation/test-plan.md` §5 — it currently says "lint + typecheck" are both already wired in CI, but typecheck isn't (no script, no CI step, `@astrojs/check` installed but unused). Also record one narrow, explicit exception to the project's no-broad-e2e stance: a single Playwright critical-path smoke test (sign-in → open pattern → print), targeting the "CI can go green while a real bug ships" fear the user raised during `/10x-plan` for rollout Phase 3.

## Starting Point

`test-plan.md` §5 overstates CI coverage for typecheck. §4/§7 currently say e2e is "none — not planned" with broad automated UI-path coverage listed as a deliberate non-goal (Phase 2 interview, Q5). [research.md](../testing-print-quality-gates/research.md) (2026-09-13) independently confirmed the typecheck gap and the e2e/terminology mismatch, which is what triggered this refresh.

## Desired End State

`test-plan.md` §3, §4, §5, and §7 accurately describe: typecheck as a real Phase-3 gap (not pre-wired); one minimal Playwright smoke test as a scoped, narrow addition to the stack and to Phase 3; the no-broad-e2e exclusion preserved with a one-line carve-out. No CI YAML, `package.json`, or test code changes — this refresh is a strategy-document correction only.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope of this refresh | Document-only edit to `test-plan.md`; no CI/code changes | Module 3 Lesson 1 boundary: `/10x-plan` for a test-plan refresh corrects strategy, not CI/config | Plan |
| e2e stance | Add ONE Playwright critical-path smoke test as a narrow exception, not a reversal | Change notes: targets the exact "green build, real bug" fear without abandoning cost×signal | Change notes |
| Gate strictness | Required, CI on PR — same cadence as the print-CSS gate | One deterministic flow is cheap enough to block merges on, consistent with existing Phase-3 gate treatment | Plan (confirmed in interview) |
| §4 stack row format | "Playwright — not yet installed, see §3 Phase 3" | Matches the existing pattern for stack rows not yet built (e.g. pre-Phase-1 unit+integration row) | Plan (confirmed in interview) |
| Phase 3 goal ordering | Print correctness stays the lead clause; e2e/CI-honesty appended | Preserves Phase 3's original identity (still primarily Risk #7); change.md only asked to extend, not re-prioritize | Plan (confirmed in interview) |
| Freshness ledger | Bump "Strategy (§1–§5) last reviewed" to 2026-09-13 | §4/§5 are both being edited today; the ledger's whole purpose is flagging staleness in those sections | Plan (confirmed in interview) |

## Scope

**In scope:**
- Editing `context/foundation/test-plan.md` §3 (Phase 3 row), §4 (e2e stack row), §5 (two gate rows), §7 (exception note), §8 (freshness date), and the top-of-file header line
- Stamping this change's own `change.md` to `status: planned`

**Out of scope:**
- Installing Playwright, writing the actual smoke test, or any CI YAML / `package.json` edits (belongs to the resuming `testing-print-quality-gates` plan)
- Resolving the Supabase-in-CI or secret-provisioning open questions from research.md (change.md explicitly scoped these as already correctly stated in §5)
- Any change to the risk map (§2) — no new top-3 risk surfaced

## Architecture / Approach

Single-pass text edit across one Markdown file, applying six precisely specified changes (all wording already resolved via interview). No sub-agents, no codebase research needed beyond what research.md already established.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Correct and extend test-plan.md | All six edits landed, change.md stamped `planned` | Wording drifts from the narrow-exception intent and reads as a stance reversal |

**Prerequisites:** None — all inputs (change.md, research.md, current test-plan.md) already exist and were read in full.
**Estimated effort:** ~15 minutes, one phase, no manual testing beyond a careful re-read.

## Open Risks & Assumptions

- Assumes the resuming `testing-print-quality-gates` plan will pick up the actual Playwright install/config/CI-wiring work — this plan does not track that as a dependency, only as a forward pointer.

## Success Criteria (Summary)

- `test-plan.md` no longer claims typecheck is wired when it isn't
- The e2e exception reads as narrow and deliberate, not as a quiet reversal of the no-broad-e2e stance
- No non-documentation files were touched
