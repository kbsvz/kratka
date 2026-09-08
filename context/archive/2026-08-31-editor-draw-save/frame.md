# Frame Brief: Grid editor — scope bundling and rendering approach for S-01

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

S-01 (`editor-draw-save`) must let a user create a pattern, define a palette,
paint/erase cells by click-or-drag, see a live per-color cell count, save via
a manual Save button with an unsaved-changes guardrail, and reopen a saved
pattern with the exact grid/palette/dimensions restored — with <100ms paint
feedback on a 100×100 grid. No editor/pattern code exists in `src/` yet
(confirmed against the live repo, not just the research doc). The roadmap
names grid-rendering performance as S-01's main execution risk and states it
"must be prototyped early within the change, not left for the end"
(`context/foundation/roadmap.md:98`).

## Initial Framing (preserved)

- **User's stated cause or approach**: `research.md` (dated 2026-08-31)
  recommends Canvas 2D plus a specific architecture — React island owning
  state, `Uint8Array` grid, a `GridRenderer` abstraction, incremental redraw,
  pointer-event drag-paint — reached via a comparison table and a competitor
  survey, not a working prototype.
- **User's proposed direction**: hand `research.md` to `/10x-plan` as the
  evidence base and plan the editor around that architecture.
- **Pre-dispatch narrowing**: user directed the check at the **whole S-01
  bundle** (not just the draw core) and at the **technology pick itself**
  (not "not yet tried" or "interaction correctness" framings); certainty was
  "routine, no specific worry" — no incident driving this, a sanity pass
  before committing.

## Dimension Map

1. **Scope/bundling** — is create+palette+paint+save+reopen the right single
   unit given `top_blocker: capacity` and a 3-week after-hours budget? ←
   user's primary focus
2. **Rendering technology correctness** — does Canvas 2D hold up under the
   full constraint set (drag-paint, live count, gridlines, 100×100 now /
   1000×1000 later), not just the generic comparison table? ← user's primary
   focus
3. **Prototype-vs-compare gap** — research.md is analytical, not a spike;
   folded into (2) as a sub-check.
4. **Interaction correctness** (drag continuity, count sync) — no doc
   addresses this; folded into (2) as a sub-check.
5. **Save/reopen fidelity** — governed by the already-tested F-01 schema/RLS;
   no plausible risk found, not investigated further.
6. **Palette UX** (color picker, 30-color cap) — standard form UI, no
   flagged risk, not investigated further.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Bundling all six capabilities into one change is wrong given capacity constraints | `roadmap.md:36,38,98` — S-01 exists specifically to prove paint-interaction *feel*, not persistence; a CRUD-only first slice could report "done" while that hypothesis stays untested. `prd.md:71-80` (US-01) is one atomic Given/When/Then with no partial-value branch; an empty-grid round-trip would prove "exact grid restored" trivially without exercising palette-index encoding. `research.md:166-168` shows persistence/render decoupling is real but is better spent as an internal phase order than a second roadmap-level change | WEAK — does not overturn the bundling |
| Canvas 2D is the wrong rendering technology | `research.md:56-61` comparison table holds; external sources confirm canvas beats DOM/SVG past ~5k objects and that the commonly-cited "canvas degrades above 10k elements" claim applies to continuously-re-rendered workloads, not a static grid with ~1-cell incremental redraws. No alternative (OffscreenCanvas, Konva/Fabric, WebGL) dominates at this scale | NONE — confirmed |
| The proposed architecture sketch is complete as specified | `research.md` never mentions `devicePixelRatio` (needed for crisp gridlines/edge-numbers on retina displays, FR-019); never mentions pointer-path interpolation (browsers coalesce `pointermove` roughly to refresh rate, so fast drags can skip cells between events — standard fix is `getCoalescedEvents()` + Bresenham/DDA interpolation); only partially addresses the canvas-ref-vs-React-state boundary that FR-014's live count requires, and doesn't flag React 19 StrictMode's double-invoke-on-mount trap for canvas init | STRONG — real, verified gaps |

## Narrowing Signals

- User pointed the check at "whole bundle" and "technology pick itself" —
  both were investigated directly rather than the framer's own first
  instinct (interaction-correctness as a named risk, prototype-vs-compare
  sequencing).
- User's "routine, no specific worry" certainty matches the outcome: no
  dramatic reframe surfaced, but the technology-pick investigation still
  found concrete, previously undocumented gaps — confirming the check was
  worth running even without a specific incident behind it.

## Cross-System Convention

Canvas-based grid painting is the documented industry direction for browser
pattern editors at this scale (Stitch Fiddle, Stitchmate, per research.md's
own competitor survey). DPR-aware canvas sizing and pointer-path
interpolation are standard, well-documented techniques for canvas drawing
apps generally (web.dev's HiDPI canvas guide, MDN's `getCoalescedEvents`) —
kratka isn't missing anything unusual, it's missing two textbook steps that
don't surface until the canvas is actually used on a real high-DPI display
with a fast pointer flick. That is exactly the class of bug the roadmap's
"prototype early, not at the end" risk note anticipated.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: not "which rendering technology"
> (settled — Canvas 2D confirmed) and not "is the bundling wrong" (settled —
> it isn't), but closing three specific, verified gaps in the architecture
> sketch — DPR-aware sizing, drag-path interpolation, and an explicit
> canvas-pixels/React-state boundary — before `/10x-plan` treats
> `research.md` as a complete input, and sequencing the plan internally as
> plumbing-phase-then-paint-phase rather than leaving "prototype early" as an
> unresolved intention.

Both dimensions the user flagged (bundling, technology pick) held up under
independent stress-testing — this is not a reframe of *what* to build. The
value is narrowing *how* `/10x-plan` should scope its phases and which
implementation details must be named up front rather than discovered
mid-build, on a retina laptop, with a fast mouse flick, after the rest of
the editor is already built on top of an incomplete canvas layer.

## Confidence

**HIGH** — two independently dispatched investigations converged with
file:line and external-source citations; no contradicting evidence found;
the technology-pick finding matches documented industry convention rather
than resting on an untested prior.

## What Changes for `/10x-plan`

`/10x-plan` should: (1) structure phases as CRUD/plumbing → paint/render, not
paint-first or monolithic; (2) explicitly scope DPR-aware canvas sizing,
pointer-path interpolation (coalesced events + Bresenham/DDA), and the
canvas-ref/React-state boundary as named implementation tasks in the paint
phase, not incidental details; (3) treat the roadmap's "prototype early"
mandate as satisfied only by a working spike that exercises drag-paint on a
real high-DPI display with a fast pointer flick — not by comparison-table
research alone.

## References

- Source files: `context/foundation/roadmap.md:36,38,44,83,98,168`;
  `context/foundation/prd.md:51-55,71-80,158-159`;
  `context/changes/editor-draw-save/research.md:56-71,166-173,214`;
  `src/types.ts`;
  `supabase/migrations/20260830140641_create_patterns_and_names.sql:34-42`
- External: web.dev HiDPI canvas guide; MDN `getCoalescedEvents`;
  kirupa.com / usefulangle.com on crisp 1px canvas lines;
  github.com/facebook/react/issues/26315 (StrictMode double-invoke);
  velt.dev canvas-vs-DOM/SVG comparison; konvajs.org FAQ; digitaladblog.com
  canvas-vs-WebGL chart performance
- Related research: `context/changes/editor-draw-save/research.md`
- Investigation tasks: "Stress-test S-01 scope bundling" (scope/bundling
  hypothesis); "Independently verify Canvas 2D recommendation" (rendering
  technology hypothesis)
