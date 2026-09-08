---
date: 2026-08-31T19:40:00+02:00
researcher: Auto (Cursor Agent)
git_commit: aa017fa17a5f429cdc37f66cda66576628d21105
branch: research-s-01
repository: kratka
topic: "Most effective grid rendering approach for MVP (100×100) and future scale (1000×1000); competitor max grid sizes"
tags:
  - research
  - codebase
  - grid-rendering
  - canvas
  - editor-draw-save
  - performance
status: complete
last_updated: 2026-08-31
last_updated_by: Auto (Cursor Agent)
---

# Research: Grid rendering approach and competitor size limits

**Date**: 2026-08-31T19:40:00+02:00
**Researcher**: Auto (Cursor Agent)
**Git Commit**: `aa017fa17a5f429cdc37f66cda66576628d21105`
**Branch**: `research-s-01`
**Repository**: kratka

## Research Question

What's the most effective way to render a grid for kratka? MVP requirement is low — 100×100 max.
Future target is probably 1000×1000. What max grid sizes do similar apps offer?

## Summary

**Recommendation for S-01 (MVP): HTML `<canvas>` with 2D context.**

Canvas satisfies the PRD NFR (< 100 ms paint feedback on 100×100), supports click/drag
painting, FR-019 gridlines (heavy line every 10th row/column + edge numbers), and incremental
redraw on cell change without DOM churn. Avoid 10,000 DOM nodes (CSS grid or one `<div>` per
cell) — workable at 100×100 but fragile and does not scale toward 1000×1000.

**For future 1000×1000:** keep `dense-json-v1` storage and use `Uint8Array` in memory; add
viewport virtualization (render only the visible window with pan/zoom). Competitors at this
scale use GPU-accelerated canvas (Stitchmate). Also requires lifting DB CHECK constraints
(currently 20–100) and accepting ~2–3 MB JSON payloads per save.

**Competitor landscape:** MVP cap of 100×100 is **conservative**. Free tiers in comparable
web apps are typically **300×300**; paid tiers reach **1000×1000–2000×2000**. Kratka's 100×100
limit is a deliberate product boundary (free tier + render/print safety), not a technical
ceiling.

## Detailed Findings

### Rendering approach comparison

| Approach | 100×100 (10k cells) | 1000×1000 (1M cells) | Paint/drag | FR-019 gridlines | Verdict |
|----------|---------------------|----------------------|------------|------------------|---------|
| **Canvas 2D** | Excellent — single `fillRect` per cell change | Needs virtualization + pan/zoom | Natural pointer → cell hit-test | Draw in same pass | **Recommended for MVP** |
| **DOM / CSS grid** | Possible but 10k nodes; layout/paint cost on drag | Impractical | Works | Per-cell or overlay complexity | Avoid |
| **SVG** | Heavy DOM (10k `<rect>`) | Impractical at 1M | Works | Straightforward | Avoid for interactive editor |
| **WebGL** | Overkill for MVP | Best raw throughput at 1M+ | More setup | Shader/grid overlay | Future option if canvas virtualization insufficient |

**MVP architecture sketch:**

- React island owns editor state: `PatternGrid` (prefer `Uint8Array` in memory, indices 0–30),
  palette, dirty flag, per-color counts.
- Canvas ref for render layer; redraw affected cells (or full grid on zoom/resize).
- Pointer events: `pointerdown` → `pointermove` (while button down) → map client coords to
  `(col, row)` via cell size + scroll offset.
- Separate render concerns from data: a thin `GridRenderer` interface so the backing store can
  stay stable if the draw layer upgrades later (virtualized canvas, WebGL).

### Codebase constraints (what the renderer must respect)

**Data model** (`src/types.ts`):

- `PatternGrid`: row-major `number[]`; **0 = empty**, 1..N = palette index.
- Empty `[]` from DB means "created but never saved" — treat as all-empty grid, do not index
  (`src/types.ts:9-16`).
- Client-writable fields on update: `palette` and `grid` only (`src/types.ts:39`).

**Schema limits** (`supabase/migrations/20260830140641_create_patterns_and_names.sql`):

- `width`, `height`: **20–100** (CHECK constraints, lines 34–35).
- `palette`: max **30** colors (line 36).
- `grid`: length **0** or exactly `width × height` (lines 37–42).
- `format`: default `'dense-json-v1'` — flat JSONB array of palette indices (line 28).

**Performance NFR** (`context/foundation/prd.md:164-165`):

- Paint/erase feedback within **100 ms**.
- Editor responsive on **100×100 (10,000 cells)**.

**Display FR-019** (`context/foundation/prd.md:158-159`):

- Heavier gridline every **10th row and column**.
- Edge numbering: **10, 20, 30, …**
- Required in **editor and print view** (print is S-03; editor is S-01).

**Interaction requirements** (S-01 / US-01):

- Click **and drag** to paint (FR-008) and erase (FR-009).
- Live **per-color cell count** while drawing (FR-014) — counts only; thread/time math is
  print-only.
- Manual Save + unsaved-changes warning (FR-010).

**No rendering code exists yet.** `PROTECTED_ROUTES` is only `["/dashboard"]`
(`src/middleware.ts:4`). No editor routes, pattern API, or grid components under `src/`.

### Payload and memory estimates (dense-json-v1)

| Grid | Cells | JSON wire (all zeros) | JSON wire (worst case) | In-memory `Uint8Array` |
|------|-------|----------------------|------------------------|------------------------|
| 100×100 | 10,000 | ~20 KB | ~30 KB | ~10 KB |
| 1000×1000 | 1,000,000 | ~2.0 MB | ~3.0 MB | ~1 MB |

Create flow optimization: empty `grid = []` on insert avoids posting a 10k zero array on
pattern creation (archive plan Fix B).

### Competitor max grid sizes (web and desktop)

Sources: official help/pricing pages where available; comparison articles where not.
Verify before product decisions — third-party comparisons may lag official docs.

| App | Type | Max grid (documented) | Free tier | Paid / notes |
|-----|------|----------------------|-----------|--------------|
| [Stitch Fiddle](https://www.stitchfiddle.com/en/help/1pdu-83sepg/size-rows-columns) | Web | **300×300** free; **1000×1000** premium | 300×300, 15 charts, 50 colors | Premium ~$2.75/mo: 1000×1000, 250 colors, unlimited charts |
| [Stitchmate](https://stitchmate.app/features) | Web | **2000×2000** | Free tier exists (smaller) | GPU-accelerated canvas; 10×10 overlay |
| [Stitchfully](https://stitchfully.com/tools/image-to-cross-stitch-pattern) | Web | **1200×1200** | Photo-to-pattern focus | PDF export |
| [CSPM](https://crossstitchpatternsmaker.com/) | Web | **500×500** | Free, unlimited patterns | 10×10 gridlines, multi-page PDF |
| FlossCross | Web | **300×300** | Free | Basic tools |
| WinStitch / MacStitch | Desktop | **999×999** (comparison sources) | Paid (~$48) | 200 colors; specialty stitches |
| **kratka MVP** | Web | **100×100** | 3 patterns, 30 colors | Deliberate conservative cap (PRD FR-004) |

**Stitch Fiddle** is the closest reference for a **1000×1000** paid-tier target — their
official docs state 1,000×1,000 (1,000,000 stitches) on Premium
([pricing](https://www.stitchfiddle.com/en/premium/pricing),
[download limits](https://www.stitchfiddle.com/en/help/1pe3-3svb1t/download-print)).

**Stitchmate** goes further (2000×2000) and explicitly cites GPU-accelerated rendering for
large patterns — evidence that canvas + GPU (or highly optimized canvas virtualization) is the
industry direction for browser editors at megacell scale.

### kratka positioning vs competitors

- **100×100 MVP cap** is below every major free web competitor (typically 300×300). This is
  intentional per PRD: free-tier boundary and render/print performance guardrail
  (`context/foundation/prd.md:105`, `:224`).
- **1000×1000 future** aligns with Stitch Fiddle Premium — a credible paid-tier ceiling, not
  exotic.
- **30-color palette** is tighter than Stitch Fiddle free (50) but sufficient for many designs
  per PRD shaping.

## Code References

- `src/types.ts:9-16` — `PatternGrid` encoding (row-major, 0 = empty, empty array semantics)
- `src/types.ts:39` — `PatternUpdate`: only `palette` and `grid` client-writable
- `supabase/migrations/20260830140641_create_patterns_and_names.sql:34-42` — dimension and grid CHECK constraints
- `src/middleware.ts:4` — `PROTECTED_ROUTES` (editor routes not yet added)
- `context/foundation/prd.md:164-165` — 100 ms / 100×100 NFR
- `context/foundation/prd.md:158-159` — FR-019 gridlines and edge numbers
- `context/foundation/roadmap.md:96-98` — S-01 open unknown: CSS grid vs canvas vs SVG

## Architecture Insights

1. **Separate data from render layer.** Grid state (`dense-json-v1` / `Uint8Array`) should not
   be tied to DOM structure so S-03 print view can reuse the same data with different output
   (print CSS, static canvas, or SVG export later).
2. **Prototype early.** Roadmap flags grid rendering performance as the main S-01 execution
   risk; validate drag-paint on 100×100 in the first implementation phase, not the last.
3. **Counts are cheap.** Live per-color counts are a `Map<paletteIndex, count>` updated on
   each cell change — O(1) per paint operation, no full-grid scan needed if counts are
   maintained incrementally.
4. **FR-019 can be render-only.** Ten-count lines and edge numbers are draw-time concerns;
   they do not belong in stored grid data.
5. **Future 1000×1000 needs schema migration.** `patterns_width_range` / `patterns_height_range`
   CHECK caps at 100; lifting this is a separate foundation change, not S-01 scope.

## Historical Context (from prior changes)

- `context/archive/2026-08-30-patterns-schema-rls/plan.md` — grid encoding decision:
  dense JSONB palette indices, `format = 'dense-json-v1'`; no tiled/binary encoding in MVP.
- `context/archive/2026-08-30-patterns-schema-rls/reviews/plan-review.md` — Fix B: `grid`
  defaults to `[]` so create does not require posting ~20–30 KB of zeros.
- `context/archive/2026-08-30-patterns-schema-rls/change.md` — references
  `notes/grid-storage-design.md` (file not present in repo at time of research).
- `context/foundation/roadmap.md:36` — north star risk: < 100 ms paint on 100×100 within
  3-week after-hours budget.

## Related Research

- None yet under `context/changes/` or `context/archive/` for grid rendering specifically.
- F-01 archive covers storage only, not UI rendering.

## Open Questions

1. **Cell size and zoom for MVP** — fixed cell pixel size with scroll, or zoom controls from
   day one? (Affects canvas viewport math; not blocking canvas choice.)
2. **Print view renderer (S-03)** — same canvas draw path vs dedicated static renderer for
   print CSS? Can defer to S-03 plan; editor canvas choice does not block it.
3. **Exact Stitch Fiddle / Stitchmate free-tier limits** — comparison article cited 2000×2000
   for Stitch Fiddle premium in one source; official Stitch Fiddle docs say 1000×1000. Prefer
   official docs for product benchmarking.
4. **Prototyping gate** — run a minimal 100×100 drag-paint canvas spike before `/10x-plan`
   finalizes component structure? Recommended given roadmap risk rating.

## Recommendation for `/10x-plan`

| Phase | Decision |
|-------|----------|
| S-01 MVP | Canvas 2D, React island, incremental cell redraw, pointer drag painting |
| S-01 data | `Uint8Array` or `number[]` in editor state; serialize to `PatternGrid` on save |
| S-03 print | Reuse grid data; separate print layout (may share draw helpers) |
| Post-MVP scale | Virtualized canvas viewport; consider WebGL only if profiling shows need |
| Product | Keep 100×100 for MVP; plan paid-tier migration path toward 1000×1000 with schema + payload work |
