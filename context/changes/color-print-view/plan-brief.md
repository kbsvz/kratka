# Color Print View — Plan Brief

> Full plan: `context/changes/color-print-view/plan.md`

## What & Why

Cross-stitch designers need a clean, printable version of their pattern showing thread counts per
color and a total time estimate — this is the MVP's payoff surface (US-02, FR-015–FR-019). Today a
designer can draw and save a pattern (S-01) and manage a list of them (S-02), but there is no way to
turn a saved pattern into a printable chart.

## Starting Point

The grid/palette data model is already stable and typed (`PatternGrid`, `PatternPalette` in
`src/types.ts`). The editor (`PatternEditor.tsx`) renders the grid on an interactive canvas with the
heavy-gridline/edge-number convention (FR-019) built in, but that logic isn't extracted for reuse.
No print CSS, no thread/time calculation, and no route for a print view exist anywhere in the
codebase yet.

## Desired End State

A user opens a saved pattern's print view from the dashboard, sees the grid with heavy 10th-row/col
gridlines and edge numbers, a legend of colors actually used with thread lengths, and a total-time
footer — then prints it via their browser's native dialog and gets exactly that, in color, on one
page, with no app chrome.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Grid rendering | Fresh static SVG, not the editor's canvas | Print has no drag/paint state to manage; SVG scales to fit the page for free and doesn't need canvas DPR/print-color workarounds. | Plan |
| Page layout for large grids | Shrink-to-fit single page, no manual size control | A user-adjustable cell size (3–10mm) would force multi-page column tiling — cut as out of scope for this slice. | Plan |
| Route path | `/patterns/[id]/print` (nested) | Matches the shape-notes draft path; reads clearly as "the print view of this pattern." | Plan |
| Legend scope | Only colors with cellCount > 0 | Showing 0-thread rows for defined-but-unused palette colors is noise on the MVP's payoff surface. | Plan |
| Print color fidelity | Force exact colors (`print-color-adjust: exact`) | Browsers strip background colors from print by default — without forcing this, the color payoff could print blank. | Plan |
| Formula verification | Manual only, no new test runner | Repo has no JS test framework yet (only pgTAP); `estimatePattern` is a pure function trivial to hand-verify. | Plan |
| Dashboard entry point | Wire the already-reserved Actions-column slot | Without a link, a real user has no way to discover the print view. | Plan |

## Scope

**In scope:**
- New protected route `/patterns/[id]/print`
- Thread-length/time-estimate calculation (`src/lib/patternEstimator.ts`)
- Static SVG grid render with FR-019 gridlines/edge numbers
- Print CSS (chrome hidden, exact colors, one-page fit)
- Dashboard "Print" link

**Out of scope:**
- Manual cell-size control / multi-page tiling
- B&W/symbol export (FR-018)
- PDF file generation
- Automated tests for the estimator
- Any change to the editor's canvas rendering

## Architecture / Approach

A server-rendered Astro page (`src/pages/patterns/[id]/print.astro`) fetches the pattern using the
same inline-Supabase-query + UUID-guard convention as `/editor/[id].astro`, computes thread/time
figures with a new pure `src/lib/` function, and renders the grid as an inline SVG sized by
`viewBox` for automatic shrink-to-fit. The only interactive element is a "Print" button (plain
inline `<script>`, no React island). `@media print` CSS hides the button and forces color-accurate
printing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Estimator, route, and static grid render | Working `/patterns/[id]/print` page with correct grid, legend, and footer figures | Thread/time formula must exactly match the drawn grid (correctness NFR) |
| 2. Print polish and dashboard entry point | Print CSS + dashboard link, feature is discoverable and print-ready | Cross-browser color/print-fidelity differences |

**Prerequisites:** S-01 (`editor-draw-save`) done — pattern schema and save/reopen must be trusted before print output can be trusted.
**Estimated effort:** ~1-2 sessions across 2 phases.

## Open Risks & Assumptions

- Cross-browser print rendering (especially `print-color-adjust` support and SVG print fidelity) isn't verified until manual testing in Phase 2 — no automated cross-browser check exists.
- The infra pre-mortem in `context/foundation/infrastructure.md` flags a hypothetical Cloudflare adapter upgrade risk to "the print view" via image-service bindings — not this plan's concern directly, but worth keeping the adapter pinned per `lessons.md` L-01.

## Success Criteria (Summary)

- A designer can go from dashboard → print view → browser print dialog and get a clean, color, one-page chart with no app UI.
- The legend's thread lengths and footer's total time exactly match a hand-computed expectation for a known test pattern.
- Both a 20×20 and a 100×100 pattern fit one page width in print preview.
