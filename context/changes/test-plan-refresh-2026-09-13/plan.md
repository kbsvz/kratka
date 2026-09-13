# Test-Plan Refresh (2026-09-13) — Implementation Plan

## Overview

Correct an inaccurate CI-gate claim in `context/foundation/test-plan.md` §5, and record one narrow, explicit exception to the project's no-broad-e2e stance: a single Playwright critical-path smoke test (sign-in → open pattern → print). This is a strategy-document correction only — no CI YAML, `package.json`, or test code changes. Those land later, in the resuming `/10x-plan` for `testing-print-quality-gates`.

## Current State Analysis

`context/foundation/test-plan.md` currently states (§5) that "lint + typecheck" are "already wired (`.github/workflows/ci.yml`)". [research.md](../testing-print-quality-gates/research.md) (2026-09-13) confirmed this is only half true: lint is wired, but there is no `typecheck` script, no CI step, and no pre-commit check invoking `@astrojs/check` (installed but unused). §4/§7 currently state e2e is "none — not planned" and list "exhaustive automated UI-path coverage" as a deliberate non-goal, per the Phase 2 interview (Q5).

The refresh's own `change.md` (`context/changes/test-plan-refresh-2026-09-13/change.md`) already records the interview outcome: correct the typecheck claim, and add one minimal Playwright critical-path e2e smoke test as a narrow exception — not a reversal — to the no-broad-e2e stance. This plan turns those decisions into the specific text edits.

### Key Discoveries:

- [test-plan.md:109](../../foundation/test-plan.md) — the exact inaccurate line to correct.
- [test-plan.md:91](../../foundation/test-plan.md) — current e2e stack row ("none — not planned").
- [test-plan.md:73](../../foundation/test-plan.md) — Phase 3 row: goal and "Test types" column to extend.
- [test-plan.md:150](../../foundation/test-plan.md) — §7 non-goal line to append a narrow-exception note to, without removing the underlying exclusion.
- [test-plan.md:157](../../foundation/test-plan.md) — Freshness Ledger's "Strategy (§1–§5) last reviewed" date, to bump alongside the §4/§5 edits.
- No Playwright/Cypress dependency exists anywhere in the repo yet (confirmed by research.md) — the new §4 row must reflect "not yet installed," matching the existing pattern used for other not-yet-built stack rows (e.g. the pre-Phase-1 "unit + integration" row).

## Desired End State

`test-plan.md` §3, §4, §5, and §7 accurately reflect: (a) typecheck is a real gap Phase 3 must wire, not a pre-existing gate; (b) one minimal Playwright critical-path smoke test is an explicit, narrow addition to the stack and to Phase 3's scope; (c) the no-broad-e2e stance in §7 is preserved with a one-line carve-out noting this single exception. §8's freshness date reflects today's edit. Verification: read the four sections and the top-of-file header back and confirm they match the edits below; no code or CI changes exist anywhere in the working tree.

## What We're NOT Doing

- Not writing or wiring the actual Playwright test, config, or dependency — that's the resuming `testing-print-quality-gates` plan's job.
- Not touching `.github/workflows/ci.yml`, `package.json`, or any test code.
- Not resolving the still-open Supabase-in-CI or secret-provisioning questions from research.md — change.md explicitly scopes those as already correctly stated in §5 ("required after §3 Phase 3") and out of this refresh.
- Not changing the risk map (§2) — the hot-spot re-scan in change.md found no new top-3 risk.
- Not re-prioritizing Phase 3's identity — print correctness (Risk #7) remains the lead clause of the Phase 3 goal; the e2e and CI-honesty items are appended, not promoted above it.

## Implementation Approach

Single pass over `context/foundation/test-plan.md`, editing the four sections change.md named plus two mechanical freshness touches (top-of-file "Last updated" line and §8 ledger date). All wording decisions were resolved via the interview above; no further user input is required to write the diff.

## Phase 1: Correct and extend test-plan.md

### Overview

Apply all six edits to `context/foundation/test-plan.md` in one pass, then update this change's own `change.md` status.

### Changes Required:

#### 1. Top-of-file header

**File**: `context/foundation/test-plan.md`

**Intent**: Update the "Last updated" line to record this refresh.

**Contract**: The line starting `> Last updated: 2026-09-13 (Phase 3 change folder opened: testing-print-quality-gates)` gains a second parenthetical noting the refresh, e.g. `> Last updated: 2026-09-13 (test-plan-refresh-2026-09-13: CI-gate honesty + e2e smoke-test exception)`.

#### 2. §3 Phased Rollout — Phase 3 row

**File**: `context/foundation/test-plan.md`

**Intent**: Extend the Phase 3 row's "Goal" and "Test types" columns to cover the e2e smoke test and the CI-gate wiring, without displacing print correctness as the phase's lead concern.

**Contract**: Goal cell becomes: "Lock in chrome-free print output; add one critical-path e2e smoke test; wire required gates (incl. typecheck) into CI." Test types cell becomes: "deterministic DOM/CSS check + selective AI-native visual spot-check + one Playwright critical-path e2e smoke test." Risks-covered column (`#7`) and Status (`change opened`) stay unchanged.

#### 3. §4 Stack — e2e row

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "none — not planned" e2e row with a scoped, not-yet-installed Playwright entry, following the same pattern §4 already uses for stack items that exist in strategy but aren't built yet.

**Contract**: New row: `e2e | Playwright — not yet installed, see §3 Phase 3 | — | checked: 2026-09-13 — one minimal critical-path smoke test (sign-in → open pattern → print), a narrow exception to the no-broad-e2e stance (§7); not for general UI-path coverage`. Keep the row's column structure identical to the table's existing four columns (Layer / Tool / Version / Notes).

#### 4. §5 Quality Gates — two row edits

**File**: `context/foundation/test-plan.md`

**Intent**: Correct the lint+typecheck row to state the real, split status, and add a new row for the e2e smoke-test gate at the confirmed strictness (required, CI on PR — same cadence as the print-CSS gate).

**Contract**: `lint + typecheck` row's "Where" cell changes from `local + CI (already wired, .github/workflows/ci.yml)` to `lint: local + CI (wired); typecheck: not yet wired — see §3 Phase 3`; "Required?" stays `required`. New row appended: `critical-path e2e smoke test | CI on PR | required after §3 Phase 3 | regressions in the sign-in → open pattern → print flow that unit/integration/deterministic checks wouldn't catch`.

#### 5. §7 What We Deliberately Don't Test

**File**: `context/foundation/test-plan.md`

**Intent**: Preserve the existing "exhaustive automated UI-path coverage" exclusion verbatim, and append a one-line note naming the single e2e smoke test as a deliberate, narrow exception decided during this refresh — not a reversal of the exclusion.

**Contract**: Append to the end of the "Exhaustive automated UI-path coverage" bullet (same bullet, not a new one): ` One narrow exception was added during the 2026-09-13 refresh: a single Playwright smoke test for the sign-in → open pattern → print flow (see §3 Phase 3, §4, §5) — this is a targeted addition for the one flow that matters most, not a reversal of the broader exclusion.`

#### 6. §8 Freshness Ledger

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that §4/§5 (part of the frozen strategy §1–§5) were touched today.

**Contract**: `- Strategy (§1–§5) last reviewed: 2026-09-10` becomes `- Strategy (§1–§5) last reviewed: 2026-09-13`.

#### 7. This change's own `change.md`

**File**: `context/changes/test-plan-refresh-2026-09-13/change.md`

**Intent**: Stamp the change as planned, per standard `/10x-plan` convention.

**Contract**: `status: new` → `status: planned`; `updated: 2026-09-13` stays (already today's date).

### Success Criteria:

#### Automated Verification:

- [ ] `grep -c "not yet wired" context/foundation/test-plan.md` returns ≥ 1 (typecheck correction present)
- [ ] `grep -c "critical-path e2e smoke test" context/foundation/test-plan.md` returns ≥ 2 (§4 and §5 rows both present)
- [ ] `grep -c "2026-09-13" context/foundation/test-plan.md` includes the ledger line (confirm via `grep -n "Strategy (§1–§5) last reviewed" context/foundation/test-plan.md` shows `2026-09-13`)
- [ ] No other files in the working tree are modified: `git status --porcelain` shows only `context/foundation/test-plan.md` and `context/changes/test-plan-refresh-2026-09-13/change.md` (plus this plan/brief as new files)

#### Manual Verification:

- [ ] Read §3 Phase 3 row, §4 e2e row, §5 both rows, and §7's appended note end-to-end and confirm they read coherently as one narrative (not just mechanically inserted fragments)
- [ ] Confirm no CI YAML, `package.json`, or test code was touched

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to hand back to the resuming `testing-print-quality-gates` plan.

---

## Testing Strategy

### Unit Tests:

N/A — documentation-only change.

### Integration Tests:

N/A.

### Manual Testing Steps:

1. Open `context/foundation/test-plan.md` and read §3, §4, §5, §7, §8, and the top-of-file header top to bottom.
2. Confirm the print-correctness framing of Phase 3 is preserved as the lead clause, with the e2e/CI-gate items appended.
3. Confirm §7's exclusion is preserved verbatim with only the narrow-exception note appended.

## Performance Considerations

None — documentation-only change.

## Migration Notes

None.

## References

- Change notes: `context/changes/test-plan-refresh-2026-09-13/change.md`
- Triggering research: `context/changes/testing-print-quality-gates/research.md`
- Document under edit: `context/foundation/test-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Correct and extend test-plan.md

#### Automated

- [x] 1.1 `grep -c "not yet wired" context/foundation/test-plan.md` returns ≥ 1
- [x] 1.2 `grep -c "critical-path e2e smoke test" context/foundation/test-plan.md` returns ≥ 2
- [x] 1.3 Freshness Ledger line shows `2026-09-13`
- [x] 1.4 Only the expected files are modified/added in `git status --porcelain`

#### Manual

- [ ] 1.5 §3/§4/§5/§7 read coherently end-to-end
- [ ] 1.6 No CI YAML, `package.json`, or test code touched
