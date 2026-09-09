---
change_id: editor-palette-merge
title: "Editor: merge palette picker and color counts into one panel"
status: impl_reviewed
created: 2026-09-09
updated: 2026-09-09
archived_at: null
roadmap_ref: null
prd_refs:
  - FR-007
  - FR-014
---

# Change: Merge PalettePanel and ColorCounts

## Why

The grid editor showed the color picker (`PalettePanel`) and the live per-color counts
(`ColorCounts`) as two separate panels side by side. The user asked for one combined view:
each swatch shows its own live count directly underneath it, so picking a color and reading
its count don't require looking at two different places.

## Scope

Merge `ColorCounts` into `PalettePanel`: each swatch (and the erase/add-color controls, for
alignment) becomes a small column with the button on top and the count underneath. Widen the
panel so ~15 swatches fit per row before wrapping. The palette's actual cap (FR-007, 30
colors) is unchanged — this is a layout/display change only, not a new business rule.
`ColorCounts.tsx` is deleted; its only usage (`PatternEditor.tsx`) is updated to render one
panel instead of two.

## Artifacts

- `plan.md` — retroactive plan, written after the change was implemented (see Notes)

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-09-09 — retroactive change record.** This change was implemented directly in
  conversation (no upfront `/10x-plan`) at the user's request, then documented after the fact
  so `/10x-impl-review` has a real plan to compare against instead of treating the diff as
  unplanned scope creep.
