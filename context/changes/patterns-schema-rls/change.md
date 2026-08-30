---
change_id: patterns-schema-rls
title: "Patterns schema + owner-scoped RLS"
status: impl_reviewed
created: 2026-08-30
updated: 2026-08-30
roadmap_ref: F-01
prd_refs:
  - FR-001
  - FR-002
  - FR-003
  - FR-004
  - FR-005
  - FR-006
  - FR-011
  - FR-012
  - FR-013
---

# Change: Patterns schema + owner-scoped RLS

Foundation `F-01` from `context/foundation/roadmap.md`.

## Why

Every downstream slice (S-01 editor, S-02 pattern list, S-03 print view) reads and writes
pattern rows. Establishing the table plus owner-scoped Row-Level Security first means each
slice inherits per-user isolation from the database layer and cannot accidentally omit it.
A misconfigured policy here silently violates the PRD's primary guardrail — "a user can never
see, open, or modify another user's patterns" — across all three slices at once.

## Scope

Creates the `patterns` table, a seeded `pattern_names` lookup pool, RLS policies, CHECK
constraints, and generated TypeScript types. No API endpoints and no UI — those belong to
S-01/S-02/S-03.

## Artifacts

- `plan.md` — implementation contract
- `plan-brief.md` — two-page handoff
- `reviews/plan-review.md` — pre-code readiness check (9 findings, all fixed)
- `reviews/impl-review.md` — post-implementation review (1 warning, 2 observations)

## Links

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md`
- Grid encoding decision: `notes/grid-storage-design.md`
- Deployment runbook: `context/deployment/deploy-plan.md`
