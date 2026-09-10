# Frame Brief: Dashboard + Pattern editor redesign

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The Dashboard ("My Patterns") page and the Pattern editor page's current layout
is disliked. A redesign spec exists (`kratka redesign.docx` + `my-patterns-page.html`
+ `pattern-editor-page.html` at `.../scratches/docs/redesign/`) covering: global
header (logo left, email + sign-out right, no avatar/dropdown), My Patterns page
(rename from "Dashboard", slot-usage indicator, compact create-form, table list
with untitled right-aligned delete column), and Pattern editor page (breadcrumb
replacing the back button, editor-action row with unsaved-changes text + Save,
two-column tools/palette sidebar + grid workspace, bold gridlines every 10th
row/col with edge numbers, no padded inner card around the grid).

## Initial Framing (preserved)

- **User's stated cause or approach**: "I'm afraid it's too many for one scope" — a single redesign doc that touches two pages feels too large to plan/implement as one change.
- **User's proposed direction**: implement the redesign doc as specified; possibly split into more than one change; wants a difficulty estimate first.
- **Pre-dispatch narrowing**:
  - Palette: user wants the palette moved into the vertical sidebar position shown in the mockup, with a "Palette" title and a `4/30`-style counter, capped at 3 colors × 10 rows visually 
  - Split shape: by page — My Patterns first, then the editor — not by risk tier.
  - Perceived risk source: "mostly visual/CSS effort" (explicitly not perceived as structural/functional risk).

## Dimension Map

The "too big for one scope" observation, and the redesign task itself, spans these
distinct implementation surfaces:

1. **Shared design tokens** (colors, header chrome) — cross-cutting, touched by both pages.
2. **My Patterns page structure** (rename, slot indicator, create-form, table) — [dashboard.astro](src/pages/dashboard.astro), [PatternDashboard.tsx](src/components/patterns/PatternDashboard.tsx).
7. **Route rename** (`/dashboard` → `/patterns`, for label/URL consistency) — since Astro's routing is file-based, this means renaming `src/pages/dashboard.astro` → `src/pages/patterns.astro` itself, plus updating every path reference: [middleware.ts:4](src/middleware.ts), [index.astro:17](src/pages/index.astro), [api/auth/signin.ts:19](src/pages/api/auth/signin.ts), [api/auth/signup.ts:20](src/pages/api/auth/signup.ts), [api/patterns/index.ts](src/pages/api/patterns/index.ts) (3 redirects), [editor/[id].astro:42](src/pages/editor/[id].astro), [PatternEditor.tsx:260-264](src/components/editor/PatternEditor.tsx), [Welcome.astro:93-96](src/components/Welcome.astro). Not requested by the redesign doc itself — the user asked for it separately, for consistency between the new "My Patterns" label and the URL. Mechanical (rename file + update ~9 call sites), no functional-logic risk, but touches both pages' surfaces, so it belongs with whichever phase/change does the My Patterns rename.
3. **Editor page chrome** (header nav → breadcrumb, action row) — [PatternEditor.tsx:243-273](src/components/editor/PatternEditor.tsx).
4. **Editor workspace layout** (single column → two-column sidebar+grid) — [PatternEditor.tsx:236](src/components/editor/PatternEditor.tsx).
5. **Palette component restructure** (horizontal wrapping row → vertical sidebar list with title/counter) — [PalettePanel.tsx](src/components/editor/PalettePanel.tsx). ← user's pre-dispatch narrowing lands here
6. **Grid/canvas rendering** (gridline weight/color, edge numbers, no outer card) — [PatternEditor.tsx:18-159](src/components/editor/PatternEditor.tsx).

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Design tokens are the main effort | Brand green is a repeated raw OKLCH literal (`oklch(0.5485 0.1061 160.41)`) in ~6+ places across 3 files, not a CSS variable; shadcn's own `--primary`/`--accent` tokens in [global.css:6-42](src/styles/global.css) exist but are unused by the app. A tokenization pass is straightforward find/replace-and-centralize work. | STRONG (as one contained, low-risk sub-task) |
| 2. My Patterns page is "mostly CSS" | Table (shadcn `Table`), form, and delete action already exist with the right structure; changes are Tailwind classes, copy strings, and one new slot-indicator element. No canvas, no absolute positioning. Matches user's "mostly visual/CSS" framing closely. | STRONG — supports user's framing for this page |
| 3. Editor chrome is "mostly CSS" | Header nav uses `absolute top-4 left-4` / `absolute top-4 right-4` blocks stacked over a single flex column ([PatternEditor.tsx:241-273](src/components/editor/PatternEditor.tsx)) — converting to a breadcrumb + editor-action-row requires restructuring this JSX (new flex containers, moving the unsaved-changes guard's home-link logic), not just swapping classNames. Contained (~40 lines) but structural. | WEAK against "mostly CSS" — this piece is a small JSX rewrite, not a class swap |
| 4. Editor workspace (two-column) is "mostly CSS" | Currently single-column stacked (`flex flex-col items-center`, [PatternEditor.tsx:236](src/components/editor/PatternEditor.tsx)) with palette centered above the canvas. Introducing a real two-column grid (`grid-template-columns: 166px minmax(0,1fr)`) is a new wrapper structure around existing children — moderate, contained, no interaction-logic touched. | PARTIAL — new layout wrapper, but low functional risk since it only repositions existing subtrees |
| 5. Palette restructure is "mostly CSS" | Current markup is `flex flex-wrap` row, each item a column (swatch + count) — [PalettePanel.tsx:56](src/components/editor/PalettePanel.tsx). Mockup/user's answer wants a vertical sidebar list with an explicit "Palette 4/30" heading and different max-column-count (3 across × up to 10 rows vs. current ~15-per-row wrap). This is a genuine layout restructure of the component (new container, new heading, new wrap-width), not a restyle — and it directly contradicts the "no need to change the layout" clause in the original request. | STRONG evidence this contradicts "mostly CSS" framing — real structural change, though isolated to one component and no interaction logic |
| 6. Grid/canvas restyle is "mostly CSS" | Cell size, heavy-line-every-10, and edge-number gutter **already exist** in the current canvas draw code ([PatternEditor.tsx:18-20, 62-159](src/components/editor/PatternEditor.tsx)) — the redesign's grid requirements are largely already implemented. What remains is recoloring hardcoded canvas draw-call colors (`#777777`, `#dddddd`, `#ffffff`, `#000000cc`) and removing the outer `rounded border border-stone-300` card wrapper. Recoloring requires editing TypeScript constants inside `useCallback`s, not Tailwind classes — no CSS variable reaches into `ctx.fillStyle`/`ctx.strokeStyle`. Low volume, but a code change to paint logic carries real regression risk (redraw correctness on paint/erase is covered by careful incremental-redraw logic per the code comments) that a pure CSS change wouldn't. | STRONG evidence this is the one area where "mostly CSS" is actually false, despite being small in line count |

## Clarification (post-brief)

The user confirmed the grid must stay rendered via the existing Canvas 2D / TypeScript draw
code (`PatternEditor.tsx:18-159`) — the HTML mockup's `<div>`-per-cell grid markup was a
**visual reference only**, not a request to migrate the grid to DOM/CSS. This does not change
any hypothesis verdict above: hypothesis 6 already concluded the canvas recoloring is a
TypeScript edit to draw-call constants, not a CSS change, and that stands as the plan boundary.
What this clarification rules out is a heavier alternative interpretation — rewriting the grid
as HTML/CSS elements to make theming easier — which is explicitly off the table.

## Clarification (post-brief, 2)

The user wants the URL to stay consistent with the new "My Patterns" label, not just the
heading text — so `/dashboard` is being renamed to `/patterns` (chosen over `/my-patterns`
for consistency with the existing `/api/patterns` naming). This is additional scope beyond
the redesign doc (which only specified the visible label change) and should be called out
as such in the plan, with a short list of the ~9 call sites above as the checklist.

## Narrowing Signals

- User confirmed "mostly visual/CSS effort" as the perceived risk — but two of six dimensions (editor chrome, canvas grid recoloring) are not CSS at all, and a third (palette) and fourth (workspace two-column) require real JSX restructuring rather than className swaps.
- User confirmed splitting by page (My Patterns, then Editor) rather than by risk tier — this groups the two CSS-only-and-safe dimensions (tokens, My Patterns page) separately from the three editor-page dimensions that actually carry structural/code risk (chrome, workspace, palette, canvas).

## Cross-System Convention

Prior UI changes in this repo (`context/archive/2026-09-09-editor-palette-merge/plan.md`, `context/archive/2026-08-31-editor-draw-save/`) were scoped narrowly — a single component or a single interaction concern per change, with an explicit "What We're NOT Doing" section pinning down what stays untouched. The palette-merge plan, in particular, shows this team's working grain is component-sized, not page-sized. No `lessons.md` entries exist yet about redesign-scope pitfalls, so this is a new pattern to establish rather than a rule being violated.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: this is not one redesign of uneven size that merely needs a page-based split — it is a mix of two genuinely different kinds of work (low-risk visual/token restyling vs. small-but-real structural/code changes to the editor's chrome, workspace layout, palette, and canvas draw logic) that the user's own risk assessment ("mostly CSS") doesn't fully match, specifically for the editor page.

The user's page-based split (My Patterns, then Editor) is directionally right and should be kept — but within the Editor page, "chrome + workspace + palette + canvas" should not be treated as one homogeneous CSS pass. The canvas recoloring and the header→breadcrumb conversion are the two places where "restyle" quietly becomes "edit interaction-adjacent code," and that's exactly where a plan needs its own explicit "what stays untouched" boundary (paint/erase pointer handling, incremental single-cell redraw, unsaved-changes guard) to avoid scope creep into functional changes, which both the redesign doc and the user explicitly ruled out.

## Confidence

**HIGH** — every dimension has direct file:line evidence from the current codebase, the redesign doc's own "no functional changes" constraint is explicit, and the reframe (mis-sized risk assumption on the editor page) is corroborated by the user's own answer sequence (confirmed the palette needs restructuring right after saying it didn't).

## What Changes for /10x-plan

Plan the two pages as separate changes, per the user's preference, but structure the Editor-page plan with two explicit phases (or at minimum two clearly separated implementation sections) — (a) token/CSS-only changes (colors, header sign-out button, borders, spacing) and (b) structural changes (breadcrumb replacing absolute-positioned nav, two-column workspace grid, palette vertical restructure, canvas draw-color constants) — each with its own "what we're not touching" boundary around paint/erase/save/unsaved-changes logic. The canvas grid stays Canvas 2D/TypeScript — the plan should recolor draw-call constants in place, not migrate to DOM/CSS. The My Patterns page plan can proceed as a single lower-risk pass, consistent with the user's "mostly CSS" framing, since evidence supports that framing there.

## References

- Source files:
  - [src/pages/dashboard.astro](src/pages/dashboard.astro)
  - [src/components/patterns/PatternDashboard.tsx](src/components/patterns/PatternDashboard.tsx)
  - [src/pages/editor/[id].astro](src/pages/editor/[id].astro)
  - [src/components/editor/PatternEditor.tsx](src/components/editor/PatternEditor.tsx)
  - [src/components/editor/PalettePanel.tsx](src/components/editor/PalettePanel.tsx)
  - [src/styles/global.css](src/styles/global.css)
- Redesign source: `kratka redesign.docx`, `my-patterns-page.html`, `pattern-editor-page.html` (`.../scratches/docs/redesign/`)
- Related precedent: `context/archive/2026-09-09-editor-palette-merge/plan.md`, `context/archive/2026-08-31-editor-draw-save/`
- Investigation: codebase survey sub-agent (Dashboard/editor component structure)
