---
change_id: editor-draw-save
title: "Grid editor: create pattern, paint palette, live count, save, reopen"
status: planned
created: 2026-08-31
updated: 2026-09-02
archived_at: null
roadmap_ref: S-01
prd_refs:
  - FR-003
  - FR-004
  - FR-005
  - FR-006
  - FR-007
  - FR-008
  - FR-009
  - FR-010
  - FR-012
  - FR-014
  - FR-019
---

# Change: Grid editor — draw, save, reopen

North-star slice `S-01` from `context/foundation/roadmap.md`.

## Why

The core product hypothesis — that a cross-stitch designer can draw, save, and reopen a pattern
with responsive paint feedback — depends on this slice. Everything else (pattern list, print view)
reads data this slice produces.

## Scope

Grid editor UI, pattern create/save/load, palette management, paint/erase interaction, live
per-color cell counts, unsaved-changes guardrail. Does not include pattern list UI (S-02) or
print view (S-03).

## Artifacts

- `research.md` — grid rendering approach and competitor size survey (2026-08-31)
- `frame.md` — verified scope bundling and Canvas 2D pick; surfaced DPR scaling, drag interpolation, and canvas/React state-boundary gaps to close before `/10x-plan` (2026-09-02)

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->
