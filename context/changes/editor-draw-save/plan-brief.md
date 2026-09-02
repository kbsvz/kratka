# Grid editor: draw, save, reopen — Plan Brief

> Full plan: `context/changes/editor-draw-save/plan.md`
> Frame brief: `context/changes/editor-draw-save/frame.md`
> Research: `context/changes/editor-draw-save/research.md`

## What & Why

Build S-01, the north-star slice: a logged-in cross-stitch designer creates
a pattern, draws and erases on a grid with a live per-color count, saves it,
and reopens it later with everything exactly as left. The frame brief's
confirmed problem statement: both the single-change bundling and the Canvas
2D rendering choice are correct — the real work is closing three verified
gaps (DPR-aware sizing, drag-path interpolation, canvas/React state
boundary) explicitly, rather than discovering them mid-build.

## Starting Point

Auth and the `patterns` schema (F-01) are done and RLS/pgTAP-tested; no
editor, pattern API, or grid UI code exists yet. The frame brief's two
independent investigations found: bundling create+palette+paint+save+reopen
into one change holds up (splitting would defer the roadmap's named risk,
not retire it), and Canvas 2D holds up as the rendering technology (no
dominant alternative), but research.md never addressed devicePixelRatio
scaling, fast-drag pointer continuity, or the canvas-ref/React-state
boundary.

## Desired End State

A user clicks "New Pattern" on the dashboard (disabled with an explanation
at 3 patterns), sets a grid size, lands in the editor, builds a palette,
paints/erases by click or drag with a live count and correct gridlines, gets
warned before losing unsaved work, saves, and can reopen the exact same
pattern later.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope bundling | Keep as one change | Splitting would defer the roadmap's named risk rather than retire it | Frame |
| Rendering technology | Canvas 2D | Confirmed against external sources; no alternative dominates at this scale | Frame / Research |
| Phase order | Plumbing, then paint | Proves the DB round-trip before layering the risky drag-paint work on top | Frame, refined in Plan |
| Phase 1 depth | Single-click, one hardcoded color | Proves real palette-index round-trip without pulling in full paint scope | Plan |
| Paint layer build | Built once, no throwaway spike | The 3 gaps are already known and verified — a spike would mostly re-confirm known answers | Plan |
| Unsaved-changes guardrail | Both in-app nav confirm + native `beforeunload` | Covers every way a user can lose work, matching the PRD guardrail language | Plan |
| Grid-size input | Two number inputs (20–100) | Fewest moving parts; matches the existing plain-form convention | Plan |
| Frontend testing | Manual only for now; automated tests deferred, not rejected | No test framework exists yet; capacity-constrained MVP | Plan |
| Performance verification | Manual DevTools profiling gate in Phase 2 | Real hardware/input is exactly where the DPR/interpolation gaps would surface — a synthetic benchmark can't exercise that | Plan |

## Scope

**In scope:** pattern create (dimensions), zod-validated pattern API,
protected editor routes, dashboard "New Pattern" entry with 3-pattern-cap
UI, DPR-aware canvas grid with FR-019 gridlines, palette management (up to
30 colors), click/drag paint and erase with fast-drag interpolation, live
per-color count, manual Save with a two-path unsaved-changes guardrail,
reopen via direct pattern-ID route.

**Out of scope:** pattern list/picker UI (S-02), print view (S-03), grids
beyond 100×100 or 1M-cell virtualization, auto-save, undo/redo, layers,
grid resize after creation, inline rename, mobile/touch, automated frontend
tests (deferred).

## Architecture / Approach

An Astro-rendered server shell (`/editor/new`, `/editor/[id]`) loads/creates
pattern rows via RLS-scoped Supabase calls and mounts a single React island
(`PatternEditor`) that owns a canvas ref. The grid buffer lives in a ref
(not `useState`) so painting never triggers a React re-render except for the
live-count `Map` and the dirty flag, which deliberately do live in state.
Save/reopen go through two new JSON+zod API routes
(`/api/patterns`, `/api/patterns/[id]`) — the repo's first JSON+zod
surface, diverging from the form+redirect auth-route convention because the
editor has in-memory state a full-page redirect would destroy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data & round-trip plumbing | API, routes, dashboard entry, DPR-aware canvas with single-click/single-color toggle, both guardrail mechanisms | A stub too thin to prove real grid round-trip (mitigated: uses real palette-index encoding, not an empty grid) |
| 2. Full paint interaction | Palette UI, drag paint/erase with pointer interpolation, live count, erase tool | Fast-drag gaps or count drift only visible on real hardware — mitigated by the manual DevTools gate |

**Prerequisites:** F-01 (done). Supabase local stack running
(`npx supabase start`); `.dev.vars` configured.
**Estimated effort:** ~2 implementation sessions (one per phase), within the
roadmap's 3-week after-hours budget for the whole S-01 slice.

## Open Risks & Assumptions

- Manual-only testing means coordinate-mapping or count-drift bugs could
  survive into Phase 2 undetected until someone happens to trigger them —
  accepted by user decision, with automated coverage flagged as a follow-up.
- The DevTools profiling gate is a one-time manual check, not a regression
  guard — a future change could silently reintroduce a performance
  regression with nothing to catch it.
- Erase-tool UX (dedicated tool vs. modifier key) was decided by the plan
  rather than asked, as a low-stakes, reversible UI choice.

## Success Criteria (Summary)

- A user can complete the full create → palette → paint → save → reopen
  flow with exact data fidelity, on both standard and high-DPI displays.
- The 3-pattern cap and unsaved-changes guardrail hold up under direct
  API calls and both navigation paths, not just the happy-path UI.
- A fast, sustained drag-paint session on a 100×100 grid stays within the
  100ms feedback budget per a recorded DevTools profile.
