# Color Print View Implementation Plan

## Overview

Add a dedicated, read-only print view for a saved pattern so a cross-stitch designer can produce a
clean, printable color chart: the full grid with FR-019 heavy gridlines/edge numbers, a legend of
colors actually used with their thread lengths, and a total-time footer — printed via the browser's
native dialog with no app chrome on the page.

## Current State Analysis

- The grid data model is already fully typed and stable: `PatternGrid` (row-major `number[]`, `0` =
  empty, `1..N` = 1-based palette index) and `PatternPalette` (`string[]` of up to 30 hex colors) in
  `src/types.ts:9-16`. `PatternEditorData` (`src/types.ts:51-54`) is the exact shape
  (`id, name, width, height, palette, grid`) a print view also needs — no new type required beyond
  narrowing what the print page selects.
- `src/pages/editor/[id].astro` is the only existing "fetch one pattern by id" implementation:
  UUID-shape pre-check, inline server-side Supabase `.select().eq("id", id).single()`, RLS collapses
  "not found" and "not owned" into the same `data === null` branch, well-formed-but-missing → 302 to
  `/dashboard`, malformed id → 404. No JSON `GET /api/patterns/[id]` endpoint exists (removed as dead
  code during S-01 — `src/pages/api/patterns/[id].ts` only exports `PATCH`/`DELETE`).
- The editor renders the grid on an interactive `<canvas>` (`src/components/editor/PatternEditor.tsx`)
  with the FR-019 heavy-line/edge-number logic (`HEAVY_LINE_EVERY = 10`, `EDGE_LABEL_SPACE`) written
  inline and coupled to the paint/pointer-drag redraw path — not extracted as a shared renderer.
- No print CSS exists anywhere in the codebase (`grep` for `@media` in `src/` is empty); Tailwind 4's
  `print:` variant is available but unused.
- `Layout.astro` (`src/layouts/Layout.astro`) is minimal — just `<html>/<head>/<body>` + an optional
  config-missing `Banner` + `<slot>`. There is no persistent app-wide header/nav injected by the
  shared layout, so a print page built on it starts from a clean baseline rather than needing to fight
  existing chrome.
- The thread-length/time-estimate formula is fully fixed at the PRD level
  (`context/foundation/prd.md:174-186`) but implemented nowhere: thread length per color = (cells
  using that color) × 45 cm; total time = (total filled cells) ÷ 150 stitches/hour. Both constants
  are non-configurable in the MVP.
- `PatternDashboard.tsx`'s Actions column was deliberately left open during S-02 for a future Print
  action (`pattern-list-manage/plan-brief.md`), and is not yet wired to anything.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/editor"]` — a new top-level segment
  must be added explicitly.
- No JS test runner exists in this repo (`package.json` has no vitest/jest/playwright dependency);
  only pgTAP covers the database layer.

## Desired End State

A signed-in owner of a saved pattern can navigate from the dashboard to `/patterns/<id>/print`, see a
clean page showing the full grid (heavy gridlines every 10th row/column, edge numbers), a legend
listing every palette color actually used on the grid with its thread length in cm, and a footer with
the total time estimate — and printing that page via the browser's native print dialog produces only
the grid, legend, and footer, in color, with no navigation or button chrome, scaled to fit the page
width on one page.

Verified by: opening the print view for a test pattern with known cell counts, confirming the
legend's thread lengths and footer time match a hand-computed expectation, and checking print preview
shows no app UI and legible colors.

### Key Discoveries:

- `src/pages/editor/[id].astro:1-46` is the exact template to follow for the new route's
  data-fetching and access-control shape.
- FR-019's heavy-line/edge-number geometry (`col % 10 === 0`, `EDGE_LABEL_SPACE` gutter) is simple
  enough to reimplement fresh for a static SVG rather than extracting the canvas version — the print
  view has no drag/paint state to reconcile.
- `PatternGrid` can have `length === 0` for a saved-but-never-painted pattern (`src/types.ts:9-16`
  comment) — the print view must treat that the same as an all-empty grid, not as an error.

## What We're NOT Doing

- No manual cell-size control or multi-page tiling — the print view always shrinks the grid to fit
  one page's width, matching the existing 100×100 free-tier ceiling that already bounds the worst
  case. (Considered and explicitly cut: a user-adjustable mm cell size forces multi-page column
  tiling, which is out of scope for this slice.)
- No B&W/symbol export (FR-018) — nice-to-have, parked in the roadmap, not part of this slice's PRD
  refs.
- No PDF file generation — browser print only (PRD Non-Goal).
- No automated unit test for the thread/time formula — manual verification only, matching this
  repo's current convention of no JS test runner.
- No changes to the editor's canvas rendering — the print view is a separate, independent renderer.
- No new database columns, migrations, or API endpoints — this is a read-only view over existing
  `patterns` data via the same inline-Supabase-query convention as the editor.

## Implementation Approach

Render the print view as a mostly static, server-rendered Astro page: fetch the pattern the same way
`/editor/[id].astro` does, compute the thread/time figures with a new pure function in `src/lib/`,
and emit the grid as an inline SVG sized by `viewBox` (so it shrinks to fit page width for free) with
heavy gridlines and edge-number text drawn directly as SVG primitives. The only client-side
interactivity needed is a "Print" button calling `window.print()`, wired with a plain inline
`<script>` — no React island required for this page. Print-specific CSS (hiding the button, forcing
exact color reproduction, setting page margins) is scoped to this page. A second phase wires the
dashboard's already-reserved Actions-column slot to link here.

## Phase 1: Estimator, route, and static grid render

### Overview

Stand up the new protected route end-to-end: fetch the pattern, compute thread/time figures, and
render the grid, legend, and footer as a static SVG-based page — viewable on screen, not yet
print-polished.

### Changes Required:

#### 1. Thread/time estimator

**File**: `src/lib/patternEstimator.ts`

**Intent**: A pure function that takes a pattern's `grid` and `palette` and returns, per used
palette color, its cell count and thread length in cm, plus the pattern's total filled-cell count
and total time in hours. No I/O, no dependency on Astro/React — trivial to hand-verify against a
small test grid.

**Contract**: Export a function
`estimatePattern(grid: PatternGrid, palette: PatternPalette): { colors: { hex: string; cellCount: number; threadCm: number }[]; totalFilledCells: number; totalHours: number }`.
`colors` includes only entries with `cellCount > 0`, in palette order. Rate constants (45 cm/stitch,
150 stitches/hour) are local `const`s in this file, not parameters — matching the PRD's "fixed
defaults, not user-configurable" decision. A `grid.length === 0` (never-painted sentinel) input
produces an empty `colors` array and zero totals, not a thrown error.

#### 2. Print route

**File**: `src/pages/patterns/[id]/print.astro`

**Intent**: Fetch the pattern by id and render the print page. Reuses the exact fetch/guard/redirect
shape of `src/pages/editor/[id].astro:1-46` (UUID pre-check, inline Supabase
`.select("id, name, width, height, palette, grid").eq("id", id).single()`, RLS-driven
404-vs-redirect handling) rather than introducing a JSON API endpoint.

**Contract**: Route path `src/pages/patterns/[id]/print.astro` → served at `/patterns/<id>/print`.
Same not-found/not-owned semantics as the editor route (malformed id → 404, well-formed-but-missing
or not-owned → 302 to `/dashboard`). Calls `estimatePattern` on the fetched `palette`/`grid` and
passes the results plus pattern data to the grid-rendering markup below.

#### 3. Protected routes

**File**: `src/middleware.ts`

**Intent**: Gate the new route behind auth, consistent with FR-003.

**Contract**: Add `"/patterns"` to the `PROTECTED_ROUTES` array (`src/middleware.ts:4`).

#### 4. SVG grid render + legend + footer

**File**: `src/pages/patterns/[id]/print.astro` (same file as #2 — markup portion)

**Intent**: Render the grid as an inline `<svg>` with one `<rect>` per filled cell (color from
`palette[value-1]`; empty cells left as page-white background, no rect needed), heavy gridlines
every 10th row/column and light lines elsewhere, and edge-number `<text>` labels every 10th
row/column — reimplemented fresh for this static context rather than extracted from
`PatternEditor.tsx`, since there's no paint/drag state to preserve here. Below the SVG, render the
legend (one row per `estimatePattern` color entry: swatch, hex, thread length in cm) and a footer
with the total time estimate. Include an on-screen-only "Print" button wired via inline `<script>`
to `window.print()`.

**Contract**: `viewBox="0 0 <width*cellUnit> <height*cellUnit>"` with the `<svg>` element styled
`width: 100%; height: auto` inside a max-width container — this is what gives the
shrink-to-fit-page-width behavior with no extra scaling logic. Heavy-line predicate mirrors the
editor's: `col % 10 === 0 || col === width` (same for rows). Edge numbers positioned in a reserved
gutter matching `EDGE_LABEL_SPACE`'s role in `PatternEditor.tsx:20` conceptually, reimplemented as
SVG `<text>` offsets.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Navigating to `/patterns/<id>/print` for an owned pattern with a known small grid (e.g. a 20×20
  test pattern with a few cells in 2-3 colors) shows the correct grid, and the legend's
  thread-length figures and footer time match hand-calculated values (cells × 45 cm; total filled ÷
  150 hr).
- Navigating to `/patterns/<id>/print` for another user's pattern id (or a well-formed but
  nonexistent id) redirects to `/dashboard`; a malformed id (e.g. `/patterns/not-a-uuid/print`)
  404s.
- A pattern with `grid.length === 0` (created but never painted) renders a blank grid with an empty
  legend and zero total time, without erroring.
- Heavy gridlines appear every 10th row/column with edge numbers (10, 20, 30, …), matching the
  editor's convention, including correct handling of the partial trailing block when a dimension
  isn't a multiple of 10.

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual testing was successful before proceeding
to the next phase.

---

## Phase 2: Print polish and dashboard entry point

### Overview

Add print-specific CSS so only the grid/legend/footer appear on paper (forcing exact color
reproduction, hiding the on-screen Print button, and constraining to one page width), then wire the
dashboard's Actions column to link here.

### Changes Required:

#### 1. Print CSS

**File**: `src/pages/patterns/[id]/print.astro` (scoped `<style>`) or `src/styles/global.css`

**Intent**: On screen, show the Print button and a comfortable reading width; when printing, hide
the button (and any config-missing `Banner` from `Layout.astro`, in the unlikely case it renders),
force background/fill colors to print as shown, and set sane page margins.

**Contract**: A `@media print` block (or Tailwind `print:hidden` utilities on the button/banner)
hiding non-content chrome, plus `print-color-adjust: exact` (and the `-webkit-` prefixed form)
applied broadly enough to cover the SVG fills and any CSS-background swatches in the legend.

#### 2. Dashboard entry point

**File**: `src/components/dashboard/PatternDashboard.tsx` (Actions column)

**Intent**: Give a user a way to reach the print view without typing a URL, completing FR-015's
end-to-end flow.

**Contract**: Add a "Print" link (`<a href={`/patterns/${pattern.id}/print`}>`) into the reserved
Actions-column slot, alongside the existing per-row actions, following the same link pattern already
used for the editor link (`PatternDashboard.tsx:120`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Print preview (browser print dialog / print-to-PDF) for a test pattern shows only the grid,
  legend, and footer — no header, nav, button, or banner — with colors visible in the preview.
- The grid fits within one page width in print preview for both a small (20×20) and a large
  (100×100) test pattern, without manual scaling.
- The dashboard's Actions column shows a working "Print" link for each pattern that navigates to its
  print view.
- Regression check: dashboard list and delete (S-02) and editor open/save/reopen (S-01) still work
  unaffected.

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual testing was successful before proceeding
to the next phase.

---

## Testing Strategy

### Unit Tests:

None automated (see What We're NOT Doing) — `estimatePattern` is verified by hand against a test
pattern with known cell counts per color.

### Integration Tests:

None automated — no test runner exists in this repo yet; covered by the Manual Verification steps
above.

### Manual Testing Steps:

1. Create or reuse a test pattern with a known, small grid and 2-3 distinct colors; note how many
   cells use each color.
2. Open its print view; confirm each legend row's thread length equals `cellCount × 45 cm` and the
   footer's total time equals `totalFilledCells ÷ 150` hours.
3. Trigger the browser's print preview; confirm no app chrome appears, colors render, and the grid
   fits one page width.
4. Repeat print preview with a 100×100 pattern to confirm shrink-to-fit still fits one page.
5. Try a not-owned pattern id and a malformed id; confirm redirect and 404 respectively.
6. Click the dashboard's new Print link for a pattern; confirm it opens the correct print view.

## Performance Considerations

An inline SVG with up to 10,000 `<rect>` elements (100×100 grid) is rendered once per page load with
no reactivity or redraw loop — unlike the editor's canvas, which must repaint on every pointer move,
this is a one-shot server-rendered static document, so DOM size is not a responsiveness concern here.

## Migration Notes

None — no schema or data changes.

## References

- Related PRD sections: `context/foundation/prd.md:147-159` (FR-015–FR-019),
  `context/foundation/prd.md:174-186` (Business Logic)
- Roadmap slice: `context/foundation/roadmap.md:113-124` (S-03)
- Prior implementation to follow: `src/pages/editor/[id].astro:1-46`,
  `src/components/editor/PatternEditor.tsx:19-159` (FR-019 reference implementation)
- Reserved dashboard slot: `src/components/dashboard/PatternDashboard.tsx` (Actions column)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Estimator, route, and static grid render

#### Automated

- [ ] 1.1 Type checking passes: `npx astro check`
- [ ] 1.2 Linting passes: `npm run lint`
- [ ] 1.3 Build succeeds: `npm run build`

#### Manual

- [ ] 1.4 Known test pattern's legend thread lengths and footer time match hand-calculated values
- [ ] 1.5 Not-owned/nonexistent id redirects to /dashboard; malformed id 404s
- [ ] 1.6 Never-painted pattern (grid.length === 0) renders blank grid with empty legend, zero time,
      no error
- [ ] 1.7 Heavy gridlines/edge numbers appear every 10th row/column, including correct partial
      trailing block

### Phase 2: Print polish and dashboard entry point

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Print preview shows only grid/legend/footer, no app chrome, colors visible
- [ ] 2.5 Grid fits one page width in print preview for both 20×20 and 100×100 test patterns
- [ ] 2.6 Dashboard Actions column shows a working Print link per pattern
- [ ] 2.7 Regression check: dashboard list/delete and editor open/save/reopen still work
