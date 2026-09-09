# Editor: merge palette picker and color counts — Implementation Plan

> **Note**: written retroactively — the change was implemented directly in conversation at
> the user's request, then documented here so it has a real plan to be reviewed against.

## Overview

Merge the editor's two side-by-side panels — `PalettePanel` (color picker/erase/add-color)
and `ColorCounts` (a separate live-count list) — into one panel where each swatch shows its
own count directly underneath it.

## Current State Analysis

- `src/components/editor/PalettePanel.tsx` rendered the erase button, each palette swatch,
  and the add-color control in a single `flex flex-wrap` row, capped at `max-w-sm`.
- `src/components/editor/ColorCounts.tsx` rendered a separate `max-w-sm` panel listing each
  palette color's live count (from `usePatternGrid`'s `counts: Map<number, number>`),
  side by side with `PalettePanel` in `PatternEditor.tsx` via a `flex ... gap-12` wrapper.
- The palette cap (`MAX_PALETTE_COLORS = 30`, `usePatternGrid.ts:5`, FR-007) is unaffected —
  this change is display-only.

## Desired End State

One panel: each swatch (plus the erase button and add-color control, for row alignment) is a
small column — the button on top, its live count underneath. The panel is wide enough
(`max-w-3xl`) to fit ~15 swatch columns per row before wrapping.

## What We're NOT Doing

- No change to the 30-color palette cap (FR-007) — layout only.
- No change to paint/erase/add-color interaction logic — only where the count is displayed.

## Implementation Approach

Extend `PalettePanel`'s props with `counts: Map<number, number>` (already computed by
`usePatternGrid` and previously passed only to `ColorCounts`). Wrap each existing
button (erase, swatch, add-color) in a `flex flex-col items-center` column with a count
`<span>` below it — an invisible placeholder count for erase/add-color keeps row alignment.
Delete `ColorCounts.tsx` and update `PatternEditor.tsx` to render the single panel.

## Phase 1: Merge the panels

### Changes Required:

#### 1. Extend `PalettePanel`

**File**: `src/components/editor/PalettePanel.tsx`

**Intent**: Accept a `counts` prop and render each swatch/erase/add-color control as a
column with its count underneath instead of a flat row of circles. Widen the panel to
`max-w-3xl` to fit ~15 columns per row.

**Contract**: `PalettePanelProps` gains `counts: Map<number, number>`. Each palette swatch's
column renders `<span className="text-xs tabular-nums text-stone-600">{counts.get(colorIndex) ?? 0}</span>`
beneath its button; the erase button and add-color control get an `invisible` placeholder
span of the same shape, to keep all columns the same height.

#### 2. Delete `ColorCounts`

**File**: `src/components/editor/ColorCounts.tsx` (deleted)

**Intent**: Its rendering is now inline in `PalettePanel`.

**Contract**: Delete the file.

#### 3. Update `PatternEditor`

**File**: `src/components/editor/PatternEditor.tsx`

**Intent**: Render one `PalettePanel` (passing `counts`) instead of `PalettePanel` +
`ColorCounts` side by side.

**Contract**: Remove the `ColorCounts` import and element; remove the now-single-child
`flex ... gap-12` wrapper's multi-panel layout (simplify to a plain centered `flex`).

### Success Criteria:

#### Automated Verification:

- [x] Lint passes: `npm run lint`
- [x] Type-check passes: `npx astro check`
- [x] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] Each swatch shows its live count directly underneath it, updating as cells are painted/erased
- [ ] Erase button and add-color control stay vertically aligned with the swatch columns (no jump from missing count text)
- [ ] ~15 swatches fit per row before wrapping at the panel's width
- [ ] Palette cap behavior (30 colors, "Palette is full" message) is unchanged

## Testing Strategy

No unit test framework in this repo (consistent with S-01's precedent). Automated checks are
lint/typecheck/build; manual checks are visual, listed above.

## Performance Considerations

None — same data (`counts` map) already computed by `usePatternGrid`, just rendered in one
place instead of two.

## Migration Notes

None — no schema/data changes, UI-only.

## References

- Prior components: `context/archive/2026-08-31-editor-draw-save/plan.md` (original
  `PalettePanel`/`ColorCounts` split)
- `usePatternGrid.ts` (`counts`, `MAX_PALETTE_COLORS`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Merge the panels

#### Automated

- [x] 1.1 Lint passes
- [x] 1.2 Type-check passes
- [x] 1.3 Build succeeds

#### Manual

- [ ] 1.4 Each swatch shows its live count directly underneath it, updating as cells are painted/erased
- [ ] 1.5 Erase button and add-color control stay vertically aligned with the swatch columns
- [ ] 1.6 ~15 swatches fit per row before wrapping at the panel's width
- [ ] 1.7 Palette cap behavior (30 colors, "Palette is full" message) is unchanged
