# Grid editor: draw, save, reopen — Implementation Plan

## Overview

Build S-01 end-to-end: a logged-in user creates a pattern, defines a palette,
paints and erases cells on a grid with a live per-color count, saves via a
Save button (guarded against unsaved-changes loss), and reopens a saved
pattern later with the exact grid/palette/dimensions restored. Two phases,
sequenced plumbing-then-paint per the frame brief's recommendation: prove the
DB round-trip against real grid data first, then layer the higher-risk
drag-paint interaction on top of an already-proven foundation.

## Current State Analysis

- No editor/pattern code exists in `src/` (verified against the live repo
  during both `/10x-frame` and this planning pass).
- F-01 (`patterns-schema-rls`) is done and pgTAP-tested: `patterns` table
  with owner-scoped RLS, a race-free 3-pattern cap (partial unique index on
  `(user_id, slot)` where `deleted_at is null`), soft delete via an RPC, and
  system-assigned naming via a `BEFORE INSERT` trigger. The client-writable
  surface is deliberately narrow: create needs only `{user_id, width,
  height}` (`src/types.ts:29`); update touches only `{palette, grid}`
  (`src/types.ts:39`) — everything else (`name`, `seq`, `slot`, `user_id`,
  `created_at`) is pinned by a `BEFORE UPDATE` trigger
  (`supabase/migrations/20260830140641_create_patterns_and_names.sql:326-340`).
- Grid storage: `grid` is a row-major `jsonb` array of palette indices,
  `0` = empty; length is either `0` (never-saved) or exactly `width × height`
  — enforced by a CHECK constraint
  (`supabase/migrations/20260830140641_create_patterns_and_names.sql:39-42`),
  which is the authoritative round-trip-fidelity guard. `palette` is a
  `jsonb` array capped at 30 entries (same file, line 36).
- No client-side delete is needed in this slice — `soft_delete_pattern` is
  S-02's job.
- Zod is mandated by `CLAUDE.md` for API-route validation but is not an
  installed dependency anywhere in the repo (`package.json` has no `zod`
  entry). The existing auth routes (`signin.ts`, `signup.ts`, `signout.ts`)
  use form-encoded POST + redirect, not JSON — this plan introduces the
  repo's first JSON+zod API surface.
- The component library is nearly empty: only `src/components/ui/button.tsx`
  exists from shadcn. `dashboard.astro` is a static welcome+sign-out page
  with zero pattern-related UI.
- No frontend test framework exists — only pgTAP for the DB layer
  (`npx supabase test db`).
- `PROTECTED_ROUTES` in `src/middleware.ts:4` currently guards only
  `"/dashboard"`.
- The frame brief (`context/changes/editor-draw-save/frame.md`) independently
  verified: (a) bundling create+palette+paint+save+reopen into one change is
  correct — splitting would defer the roadmap's named risk rather than
  retire it; (b) Canvas 2D is the correct rendering technology, confirmed
  against external sources with no dominant alternative; (c) three concrete
  implementation gaps in the original research are real: devicePixelRatio
  (DPR)-aware canvas sizing, pointer-path interpolation for fast drags
  (browsers coalesce `pointermove` below input sampling rate), and an
  explicit canvas-pixel/React-state boundary, including a React 19
  StrictMode double-invoke trap on canvas init.

## Desired End State

A logged-in user clicks "New Pattern" on the dashboard (disabled with an
explanation at the 3-pattern cap), sets width/height (20–100), lands in the
editor, defines a palette of up to 30 colors, paints and erases cells by
click or drag with a live per-color count, sees heavy gridlines every 10th
row/column with edge numbers, is warned before losing unsaved work whether
navigating in-app or closing the tab, saves via a Save button, and reopens
the pattern later with the exact grid, palette, and dimensions restored.
Verified by a full manual walkthrough of the flow (Phase 1's minimal
interaction, then Phase 2's full paint experience) plus a DevTools
performance profile of a fast 100×100 drag session.

### Key Discoveries:

- `src/types.ts:29,39` — client-writable surface: create = `{user_id, width,
  height}` only; update = `{palette, grid}` only.
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:39-42` —
  grid CHECK constraint is the authoritative round-trip-fidelity guard.
- Same file, lines 222–260 — `BEFORE INSERT` trigger derives slot/seq/name;
  the API must not attempt to supply them.
- `src/middleware.ts:4` — `PROTECTED_ROUTES` needs `"/editor"` added.
- `package.json` — no `zod`, no frontend test framework; only `button.tsx`
  exists under `src/components/ui/`.
- `context/changes/editor-draw-save/frame.md` — Hypothesis Investigation
  table; confirms scope and tech choice, names the 3 implementation gaps.
- `context/changes/editor-draw-save/research.md:56-71` — Canvas 2D
  comparison table and MVP architecture sketch (React island + ref +
  incremental redraw).

## What We're NOT Doing

- Pattern list/picker UI (S-02) — reopening a specific pattern in this slice
  goes through a direct route to a known pattern ID (`/editor/<id>`), per
  the roadmap's own resolution of this exact question (`roadmap.md:97`).
- Print view (S-03).
- Grids beyond 100×100, or any viewport virtualization/WebGL for
  million-cell scale — explicit PRD Non-Goal; this plan targets the MVP
  ceiling only.
- Auto-save — manual Save button + guardrail only, per PRD Non-Goals.
- Undo/redo, layers, grid resize after creation, inline rename,
  background-color picker, DMC/Anchor thread integration, mobile/touch
  support — all explicit PRD Non-Goals.
- An automated frontend test suite (Vitest/RTL) — deferred by user decision;
  manual verification only in this plan (see Testing Strategy for the
  follow-up note).
- A separate throwaway rendering spike — by user decision, the Phase 2
  canvas/paint layer is built once, as the real implementation, not
  discarded and rewritten.

## Implementation Approach

Two phases, sequenced plumbing-then-paint so the DB round-trip is proven
against real (if minimal) grid data before the higher-risk drag-paint
interaction is layered on top — this directly implements the frame brief's
recommendation and the roadmap's "prototype early" mandate. Phase 1 builds
the full vertical slice (routes, API, canvas renderer, save/guardrail/
reopen) but limits interaction to single-click, single-color toggling.
Phase 2 replaces the interaction layer with full palette + drag paint/erase
+ live count, without changing the API contract, the DPR canvas setup, or
the ref-based grid-state boundary Phase 1 establishes.

## Critical Implementation Details

**Timing & lifecycle.** React 19 StrictMode double-invokes mount effects in
development. Canvas initialization (creating the 2D context, computing and
applying the devicePixelRatio scale) must be guarded so it runs its sizing
math exactly once per logical mount — an unguarded effect would apply the
DPR scale twice and mis-size the backing store.

**Performance constraints.** The <100ms feedback / 100×100-responsiveness
NFR is only met if redraws are incremental (per-cell or per-interpolated-path,
never a full-grid redraw on each pointer event) and if the grid buffer lives
outside React state (see State sequencing) so painting never triggers a
React re-render of anything but the live-count panel.

**State sequencing.** The grid buffer lives in a ref (row-major array
matching `PatternGrid`), mutated directly on paint/erase — not in
`useState`. Putting it in `useState` is the obvious-but-wrong choice: a
state-driven full-grid redraw on every cell change directly conflicts with
the performance constraint above. Only the dirty flag and the live
per-color count `Map` are React state, because those two specifically need
to trigger a re-render (of the Save button and the count panel,
respectively).

## Phase 1: Data & round-trip plumbing

### Overview

Stand up the pattern API (create/get/save), protect the editor routes, add a
"New Pattern" entry point to the dashboard that respects the 3-pattern cap,
and build a DPR-aware canvas renderer with FR-019 gridlines and a
single-click/single-color toggle interaction — enough real interaction to
prove the save/reopen round-trip against actual palette-index-encoded grid
data, not an empty stub. Both unsaved-changes guardrail mechanisms are wired
here since Save exists from this phase on.

### Changes Required:

#### 1. Add zod

**File**: `package.json`

**Intent**: Add zod so the new pattern API routes can validate input, per
`CLAUDE.md`'s API-route convention — the first route in the repo to actually
follow it.

**Contract**: `npm install zod`.

#### 2. Pattern validation schemas

**File**: `src/lib/patterns.ts` (new)

**Intent**: Central zod schemas for the two request shapes the API accepts:
create (`width`/`height`, each 20–100) and save (`palette`: array of hex
strings, max 30; `grid`: array of non-negative integers).

**Contract**: Export a create schema and a save schema whose parsed types
line up with `PatternCreate`/`PatternUpdate` from `src/types.ts`. The
grid-length-matches-dimensions invariant is already enforced by the DB CHECK
constraint (migration lines 39–42); the schema validates shape and ranges,
not that invariant — a mismatch surfaces as a failed insert/update, which is
acceptable since it can only originate from a non-conforming client.

#### 3. Pattern API routes

**Files**: `src/pages/api/patterns/index.ts` (new),
`src/pages/api/patterns/[id].ts` (new)

**Intent**: `index.ts` exports `POST` — creates a pattern for the current
user from `{width, height}`, returns the new row's id. `[id].ts` exports
`GET` (fetch one owned pattern, for reopen) and `PATCH` (update `palette`/
`grid` on an owned pattern, for Save). Both export `const prerender = false`.

**Contract**: All three handlers use `createClient` from `src/lib/
supabase.ts` (the existing auth-route pattern), validate the body with the
Step-2 schemas, and rely on RLS for ownership scoping — `patterns_select`/
`patterns_update` already filter to `auth.uid()`. On the insert trigger's
3-pattern-cap exception (errcode `KR001`), `POST` returns a 4xx surfacing
the trigger's hint message, since FR-005 requires the limit to be enforced
server-side with an explanation.

**Addendum (impl-review, 2026-09-08)**: `index.ts` is a plain form-POST
handler (per item 6's `editor/new.astro`), so on the cap exception it
redirects to `/editor/new?error=...` with a fixed message instead of
returning JSON — consistent with every other form-POST route in the repo
(`signin.ts`, `signup.ts`). Cap detection checks `error.code === "KR001"`.
`[id].ts`'s planned `GET` handler was removed as dead code: `editor/[id].astro`
loads the pattern server-side via its own inline query for reopen (item 7)
and nothing ever called the JSON `GET` route — only `PATCH` remains.

#### 4. Protect editor routes

**File**: `src/middleware.ts`

**Intent**: Extend route protection to the new editor pages.

**Contract**: `PROTECTED_ROUTES` gains `"/editor"` alongside the existing
`"/dashboard"` (`src/middleware.ts:4`) — the middleware's existing
`startsWith` check already covers both `/editor/new` and `/editor/<id>`.

#### 5. Dashboard "New Pattern" entry

**File**: `src/pages/dashboard.astro`

**Intent**: Add a "New Pattern" link; render it disabled with an explanation
when the signed-in user already owns 3 live patterns (FR-005).

**Contract**: Server-side, in the Astro frontmatter, count the user's live
patterns via the existing `createClient` pattern; render an enabled link to
`/editor/new` under the cap, a disabled control with explanatory text at the
cap.

#### 6. Create-pattern page

**File**: `src/pages/editor/new.astro` (new)

**Intent**: A minimal form collecting width and height (FR-004), submitting
to the new `POST` route, then redirecting to `/editor/<id>` on success.

**Contract**: Two number inputs (min 20, max 100, step 1) using the plain
form-POST-and-redirect pattern already established by `signup.astro`/
`signin.astro` — this page has no in-memory state to preserve across
navigation, so the simpler existing convention applies here even though the
editor pages below use JSON+fetch.

#### 7. Editor page (server shell)

**File**: `src/pages/editor/[id].astro` (new)

**Intent**: Load the pattern server-side (ownership enforced by RLS),
redirect if not found or not owned, and mount the React editor island with
the loaded pattern as props.

**Contract**: Passes `{id, width, height, palette, grid}` to the island; the
empty-grid convention (`grid: []` means never-saved) is handled inside the
island, not this page.

#### 8. Editor React island — canvas renderer + minimal interaction

**Files**: `src/components/editor/PatternEditor.tsx` (new),
`src/components/hooks/usePatternGrid.ts` (new)

**Intent**: Render the grid on a DPR-aware `<canvas>` with FR-019 heavy
gridlines every 10th row/column and edge numbers; support click-to-toggle a
single hardcoded color per cell; track a dirty flag wired to both guardrail
mechanisms; wire Save to the `PATCH` route and initial render to the
server-shell props.

**Contract**: `usePatternGrid` owns the grid ref, the dirty flag, and the
save/load calls; `PatternEditor` owns the canvas element and pointer
handlers. Canvas backing-store size = CSS size × `devicePixelRatio`, with
`ctx.scale(dpr, dpr)` applied — see Critical Implementation Details for the
StrictMode guard this needs.

#### 9. Unsaved-changes guardrail

**File**: `src/components/hooks/useUnsavedChangesGuard.ts` (new)

**Intent**: Given the dirty flag, block both tab-close/refresh (native
`beforeunload`) and in-app navigation away from the editor, per the decision
to cover both paths.

**Contract**: Exposes a hook registering a `beforeunload` listener keyed on
the dirty flag, plus an `attemptNavigate(to: () => void)` helper that the
editor's own navigation controls call instead of navigating directly —
showing a confirm dialog (shadcn `AlertDialog`) when dirty, proceeding
straight through when clean.

#### 10. Install shadcn components

**Command**: `npx shadcn@latest add input alert-dialog label`

**Intent**: `input` (dimension fields; hex entry in Phase 2), `alert-dialog`
(guardrail confirm), `label` (form accessibility) — the three this phase's
surface needs.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type-check passes: `npx astro check`
- Build succeeds: `npm run build`
- DB tests still pass (regression check, no schema changes this phase):
  `npx supabase test db`

#### Manual Verification:

- Sign in, land on the dashboard, see an enabled "New Pattern" entry.
- Create a pattern at each dimension boundary (20×20 and 100×100); both
  land in the editor.
- Submitting dimensions outside 20–100 is rejected client-side.
- Click several cells to toggle the single hardcoded color on/off, click
  Save, then reload (or navigate directly to `/editor/<id>` again) — the
  exact same cells are filled.
- Trigger the guardrail two ways with unsaved changes present: in-app
  navigation shows a confirm dialog; closing/refreshing the tab shows the
  native browser warning.
- As a user who already owns 3 patterns, confirm the dashboard shows the
  disabled state with an explanation, and that a direct `POST` to the
  create route also fails (server-side enforcement, not just a UI gate).
- Confirm the heavier gridline and edge numbers land on every 10th row and
  column, including the partial block on a grid size not divisible by 10.
- On a high-DPI display, confirm gridlines and edge-number text render
  crisp, not blurry.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Full paint interaction

### Overview

Replace Phase 1's single-color click-toggle with the full paint experience:
palette management, multi-color drag paint/erase with fast-drag continuity,
and a live per-color count — without changing the API contract, the canvas
DPR setup, or the ref-based grid-state boundary Phase 1 established.

### Changes Required:

#### 1. Palette UI

**File**: `src/components/editor/PalettePanel.tsx` (new)

**Intent**: Let the user build a palette of up to 30 colors (FR-007) via a
native color picker plus a hex text input, and select one as the active
paint color.

**Contract**: Palette is `string[]` of hex values (matches
`PatternPalette`); the 30-color cap is enforced client-side as a UX nicety,
with the DB CHECK constraint as the authoritative backstop. Selecting a
swatch sets the active paint color the canvas pointer handlers read.

#### 2. Drag paint/erase with interpolation

**Files**: `src/components/editor/PatternEditor.tsx`,
`src/components/hooks/usePatternGrid.ts`

**Intent**: Extend the Phase 1 click handler into full click-and-drag paint
(FR-008) and erase (FR-009), filling every cell along the pointer's path —
not just the cells that happen to receive a discrete `pointermove` event.

**Contract**: On each `pointermove`, read `event.getCoalescedEvents()`
(falling back to `[event]` where unsupported); for each coalesced point, map
to `(col, row)` and fill the straight-line path between the previous and
current `(col, row)` with a Bresenham/DDA line-fill rather than only the
endpoint — the concrete fix for the fast-drag gap the frame brief
identified. Each newly-filled cell updates the ref-backed grid and triggers
only that cell's canvas redraw plus the live-count delta.

#### 3. Live per-color count

**Files**: `src/components/editor/ColorCounts.tsx` (new),
`src/components/hooks/usePatternGrid.ts`

**Intent**: Show a running count of filled cells per palette color while
drawing (FR-014).

**Contract**: `usePatternGrid` maintains a `Map<paletteIndex, count>` in
React state (deliberately not the ref — this one needs to trigger
re-renders), updated incrementally (±1 per cell change) rather than
rescanning the grid on every paint event.

#### 4. Erase tool

**File**: `src/components/editor/PatternEditor.tsx`

**Intent**: A visible way to switch from "paint with the active color" to
"erase" (FR-009) — a dedicated eraser tool alongside the palette swatches.

**Contract**: Erase writes palette index `0` (empty) through the same
drag/interpolation path used for painting.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type-check passes: `npx astro check`
- Build succeeds: `npm run build`
- DB tests still pass (no schema changes this phase): `npx supabase test db`

#### Manual Verification:

- Build a palette of 5+ colors via both the picker and hex input; reaching
  30 disables adding more.
- Fast diagonal and fast straight drags at typical mouse speed leave no
  gaps in the painted line, on both a standard and a high-DPI display.
- Live counts stay correct through a rapid multi-color drag session
  (spot-check against a manual recount on a small test grid).
- Erase restores cells to empty (background render, count decrements).
- Save persists the full palette + grid; reopening restores the exact
  palette and grid.
- A DevTools Performance profile of a fast, sustained 100×100 drag-paint
  session shows per-frame work comfortably under the 100ms feedback budget
  — record the observed figure in this phase's manual sign-off.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

None automated in this plan — manual verification only, by decision (no
frontend test framework exists yet in this repo). If a follow-up change
introduces Vitest + React Testing Library, the highest-value first targets
are the Bresenham/DDA interpolation function and the live-count
increment/decrement logic: both are pure functions with no canvas/DOM
dependency, and both are exactly the kind of silent-drift bug (off-by-one in
coordinate mapping, count skew) that manual testing is least likely to
catch reliably.

### Integration Tests:

None automated in this plan.

### Manual Testing Steps:

1. Full happy path: sign in → New Pattern (100×100) → build a palette →
   drag-paint a shape spanning multiple quadrants quickly → verify counts →
   Save → navigate away and back → reopen → verify exact restoration.
2. Cap enforcement: as a user with 3 patterns, confirm New Pattern is
   disabled with an explanation, and that a direct API call is also
   rejected.
3. Guardrail: with unsaved changes present, try in-app navigation (confirm
   dialog appears; cancelling keeps you on the page) and tab close (native
   browser warning appears).
4. High-DPI: repeat the drag-paint step on a retina/high-DPI display and
   confirm gridlines/text stay crisp and drags stay gap-free.
5. Boundary sizes: confirm 20×20 and 100×100 both create, save, and reopen
   correctly.

## Performance Considerations

The <100ms feedback / 100×100-responsiveness NFR is met by (a) incremental
per-cell/per-interpolated-path canvas redraws instead of full-grid redraws,
(b) keeping the grid buffer out of React state so painting never triggers a
re-render of anything but the live-count panel, and (c) coalesced-event
batching so a single `pointermove` handler call — not one call per cell —
drives each interpolated fill. This is verified manually via DevTools
profiling (Phase 2's gate) rather than an automated benchmark: a synthetic
benchmark can't exercise real pointer-coalescing/DPR behavior, which is
exactly where the frame brief's gaps were found.

## Migration Notes

None — no schema changes in this plan. F-01's existing schema already
supports everything this plan needs.

## References

- Frame brief: `context/changes/editor-draw-save/frame.md`
- Research: `context/changes/editor-draw-save/research.md`
- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-003–FR-010, FR-012, FR-014, FR-019)
- Schema: `supabase/migrations/20260830140641_create_patterns_and_names.sql`
- Types: `src/types.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a
> step lands. Do not rename step titles.

### Phase 1: Data & round-trip plumbing

#### Automated

- [x] 1.1 Lint passes — 23cd3b6
- [x] 1.2 Type-check passes — 23cd3b6
- [x] 1.3 Build succeeds — 23cd3b6
- [x] 1.4 DB tests still pass — 23cd3b6

#### Manual

- [x] 1.5 New Pattern entry enabled and reachable under the cap — 23cd3b6
- [x] 1.6 Boundary sizes (20×20, 100×100) create successfully — 23cd3b6
- [x] 1.7 Out-of-range dimensions rejected client-side — 23cd3b6
- [x] 1.8 Click-toggle + Save + reopen round-trip is exact — 23cd3b6
- [x] 1.9 Guardrail fires on both in-app nav and tab close — 23cd3b6
- [x] 1.10 4th-pattern creation blocked server-side with explanation — 23cd3b6
- [x] 1.11 Gridlines/edge numbers correct, including partial block — 23cd3b6
- [x] 1.12 Gridlines/text crisp on a high-DPI display — 23cd3b6

### Phase 2: Full paint interaction

#### Automated

- [x] 2.1 Lint, type-check, and build pass — 72d80d5
- [x] 2.2 DB tests still pass — 72d80d5

#### Manual

- [x] 2.3 Palette build (picker only, no hex input — accepted MVP tradeoff, see change.md 2026-09-04) and 30-color cap enforced — 72d80d5
- [x] 2.4 Fast drags leave no gaps, standard and high-DPI displays — 72d80d5
- [x] 2.5 Live counts correct through rapid multi-color drag — 72d80d5
- [x] 2.6 Erase restores cells to empty and decrements counts — 72d80d5
- [x] 2.7 Save/reopen restores exact palette and grid — 72d80d5
- [x] 2.8 DevTools profile under the 100ms budget, figure recorded — 72d80d5
