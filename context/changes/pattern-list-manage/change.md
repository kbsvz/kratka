---
change_id: pattern-list-manage
title: "Pattern dashboard: list all patterns, delete a pattern"
status: planned
created: 2026-09-08
updated: 2026-09-08
archived_at: null
roadmap_ref: S-02
prd_refs:
  - FR-003
  - FR-011
  - FR-013
---

# Change: Pattern dashboard — list and delete

Slice `S-02` from `context/foundation/roadmap.md`.

## Why

FR-011 and FR-013 are unimplemented: there is no way today for a user to see their saved
patterns or delete one to free a slot. `dashboard.astro` only checks the pattern count for
the 3-pattern cap. This slice closes that gap and completes the MVP's pattern-management
surface alongside S-01's editor and S-03's future print view.

## Scope

Extend `dashboard.astro` with a pattern list (name, grid size, last-updated) and a delete
action per row, backed by a new `DELETE /api/patterns/[id]` route calling the existing
`soft_delete_pattern` RPC. Also relocates pattern creation onto the dashboard: the
width/height inputs and Create button move from the standalone `/editor/new` page (deleted
entirely) onto `/dashboard` itself; submitting still navigates straight to the new pattern's
grid editor, unchanged from today. Does not include the print view (S-03) or any pattern
rename/edit beyond what S-01 already ships.

## Artifacts

- `plan.md` — implementation plan (2026-09-08)
- `plan-brief.md` — two-page summary (2026-09-08)

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
