# My Patterns + Pattern Editor Redesign Implementation Plan

## Overview

Restyle the "Dashboard" (renamed "My Patterns") and Pattern editor pages to the new
warm/craft-oriented visual language specified in `kratka redesign.docx` and its two HTML
mockups, with no functional changes. Also renames the `/dashboard` route to `/patterns` for
label/URL consistency (user-requested, outside the redesign doc's own scope), and introduces
one shared, static `AppHeader` used by both pages.

## Current State Analysis

- Dashboard (`src/pages/dashboard.astro`) and Editor (`src/pages/editor/[id].astro`) each
  hand-roll their own header markup — no shared header component exists today.
- The Editor page is single-column (`flex flex-col items-center`,
  [PatternEditor.tsx:236](src/components/editor/PatternEditor.tsx)), with header nav as two
  `absolute`-positioned corner blocks ([PatternEditor.tsx:243-273](src/components/editor/PatternEditor.tsx))
  and no visible "unsaved changes" text (only the Save button's disabled state).
- The palette (`PalettePanel.tsx`) is a horizontal `flex flex-wrap` row, not the vertical
  sidebar list the redesign wants.
- The grid is rendered entirely via Canvas 2D draw calls
  ([PatternEditor.tsx:18-159](src/components/editor/PatternEditor.tsx)); heavy gridlines every
  10th row/col and edge-number labels **already exist** in the current draw code — only their
  hardcoded colors (`#777777`, `#dddddd`, `#ffffff`, `#000000cc`) need updating, and the
  wrapping card (`rounded border border-stone-300`, [PatternEditor.tsx:291](src/components/editor/PatternEditor.tsx))
  needs removing.
- The brand green (`oklch(0.5485 0.1061 160.41)`) is a hardcoded literal repeated 17 times
  across the app (Dashboard, Editor, Palette, landing page, sign-in, sign-up) — shadcn's own
  `--primary`/`--accent` tokens in `global.css` exist but are unused by the app.
- `/dashboard` is referenced in 9 places beyond the page file itself: `middleware.ts`
  (`PROTECTED_ROUTES`), `index.astro`, `api/auth/signin.ts`, `api/auth/signup.ts`,
  `api/patterns/index.ts` (3 redirects), `editor/[id].astro`, `PatternEditor.tsx` (Back button),
  and `Welcome.astro`.
- Dashboard's sign-out button is currently hidden once a delete call returns 401
  (`sessionExpired`, tracked in [usePatternList.ts](src/components/hooks/usePatternList.ts)) —
  this plan intentionally drops that hide-on-expiry behavior (see Key Discoveries) in exchange
  for a single static shared header.
- See `context/changes/patterns-page-ui-improvements/frame.md` for the full dimension map and
  hypothesis investigation — this plan treats its Reframed Problem Statement as settled: the
  editor page's chrome, canvas recoloring, and palette restructure are real structural/code
  changes, not a uniform CSS pass, and are phased accordingly.

## Desired End State

Both pages visually match their redesign mockups (`my-patterns-page.html`,
`pattern-editor-page.html`) using the new color tokens, with all existing functionality,
validation, ownership rules, the 3-pattern cap, manual Save, the unsaved-changes guard, and
print behavior unchanged. The route lives at `/patterns` instead of `/dashboard`.

Verification: `npm run lint`, `npx astro check`, `npm run build` all pass; manual side-by-side
comparison against both mockup HTML files for each page; full manual regression of create,
delete, paint/erase, save, and the unsaved-changes prompt.

### Key Discoveries:

- Heavy gridlines and edge-number labels are already implemented in the canvas draw code — this
  phase only recolors constants, it does not build new grid features.
- The redesign doc explicitly says "Do not put page-specific navigation or Save actions inside
  this global header" — this is why the new `AppHeader` stays fully static (just logo + email +
  sign-out) while the editor's guarded back-navigation moves into its own breadcrumb instead.
- Because `AppHeader` is fully static and server-rendered, it cannot react to the
  editor's `isDirty` state or the dashboard's `sessionExpired` state — confirmed acceptable via
  user decision (drop hide-on-expiry; native `beforeunload` still guards any real navigation,
  including a sign-out form submit, whenever `isDirty` is true).
- Astro's routing is file-based: renaming the route requires renaming
  `src/pages/dashboard.astro` → `src/pages/patterns.astro`, not just editing its contents.

## What We're NOT Doing

- No changes to paint/erase pointer handling, incremental single-cell redraw logic, the 3-pattern
  cap, save/validation logic, or RLS/ownership rules.
- No migration of the grid from Canvas 2D to DOM/CSS — the HTML mockup's grid markup is a visual
  reference only (explicitly confirmed).
- No permanent redirect from the old `/dashboard` URL — it will 404 after the rename (user
  decision).
- No new automated test tooling (e.g. Playwright) — verification is `lint`/`astro check`/`build`
  plus manual QA against the mockups (user decision), consistent with this repo having no
  existing frontend test framework.
- No restyling of the print preview (not yet built) — the redesign doc's mention of it is
  forward-looking only.
- No change to `PatternDashboard`'s sign-out hide-on-`sessionExpired` logic beyond removing it
  from the header — the separate delete-error banner and its own "Sign in" link (unrelated to
  the header) are untouched.

## Implementation Approach

Foundation work (tokens, shared header, route rename) lands first since both pages depend on it.
My Patterns is redesigned next as a self-contained, low-risk pass. The Editor page is then split
into two phases matching the frame brief's risk split: structural JSX changes (breadcrumb,
workspace layout, palette restructure) first, then the canvas/color polish pass — keeping the
riskier code-adjacent changes isolated and separately verifiable.

## Phase 1: Foundation — tokens, shared header, route rename

### Overview

Introduce the new design tokens app-wide, build the shared static header, and rename the
`/dashboard` route to `/patterns`. This phase touches files outside the two target pages
(landing, sign-in, sign-up) for color tokens only — no layout changes to those pages.

### Changes Required:

#### 1. Add new color tokens

**File**: `src/styles/global.css`

**Intent**: Add the redesign's palette as new CSS custom properties, additive to the existing
shadcn variable set (do not remove `--primary`/`--accent` etc., which remain unused by app code
but are shadcn/ui internals).

**Contract**: New variables in `:root`: `--kratka-bg: #F6F1E9`, `--kratka-paper: #FFFCF7`,
`--kratka-ink: #24201E`, `--kratka-muted: #716B65`, `--kratka-border: #E4DDD3`,
`--kratka-green: #287D57`, `--kratka-green-dark` (hover shade, derive from mockup's
`#1f6948`), `--kratka-red: #A3232B`. Expose them as Tailwind utilities via `@theme inline`
(e.g. `--color-kratka-green: var(--kratka-green)`) so they're usable as `bg-kratka-green`,
`text-kratka-ink`, etc.

#### 2. Replace hardcoded brand-color literals repo-wide

**Files**: `src/components/patterns/PatternDashboard.tsx`, `src/components/editor/PatternEditor.tsx`,
`src/components/editor/PalettePanel.tsx`, `src/components/Welcome.astro`,
`src/pages/auth/signin.astro`, `src/pages/auth/signup.astro` (and any other file matching
`oklch(0.5485_0.1061_160.41)` / `oklch(0.6085_0.1061_160.41)`)

**Intent**: Replace every occurrence of the hardcoded green literal with the new
`kratka-green` token (and its hover/dark variant), so the whole app uses one green from one
source. This phase changes color only — layout in landing/sign-in/sign-up pages is untouched.

**Contract**: `bg-[oklch(0.5485_0.1061_160.41)]` → `bg-kratka-green`,
`hover:bg-[oklch(0.6085_0.1061_160.41)]` → `hover:bg-kratka-green-dark`,
`text-[oklch(0.5485_0.1061_160.41)]` → `text-kratka-green`, and the equivalent for
`border-[oklch(...)]` selection rings in `PalettePanel.tsx`.

#### 3. Build the shared `AppHeader`

**File**: `src/components/AppHeader.astro` (new)

**Intent**: One static, server-rendered header used identically on both pages: KRATKA logo
linking to `/?home` on the left, the signed-in user's email and a "Sign out" button on the
right. No client JS, no avatar/dropdown, matches the redesign doc's global-header spec exactly.

**Contract**: Props `{ email: string }`. Sign-out is a plain `<form method="POST"
action="/api/auth/signout">` (progressive enhancement, same endpoint used today). No
`isDirty`/`sessionExpired` awareness — always visible (per user decision).

#### 4. Rename the route

**Files**: `src/pages/dashboard.astro` → `src/pages/patterns.astro`, `src/middleware.ts`,
`src/pages/index.astro`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`,
`src/pages/api/patterns/index.ts`, `src/pages/editor/[id].astro`,
`src/components/editor/PatternEditor.tsx`, `src/components/Welcome.astro`, `README.md`,
`context/deployment/deploy-plan.md`

**Intent**: Move the page file and update every `/dashboard` path reference to `/patterns`.
No redirect is added for the old path (user decision — it will 404). Per `lessons.md` L-02,
also sweep the living docs that document this route so they don't silently go stale.

**Contract**: `PROTECTED_ROUTES` in `middleware.ts` gains `/patterns` in place of `/dashboard`;
every `context.redirect("/dashboard...")` / `href="/dashboard"` call site becomes `/patterns`.
`README.md`'s routes table (`/dashboard` → Protected page) and the two `/dashboard` mentions in
`context/deployment/deploy-plan.md` (lines 119 and 178, as of this plan) are updated to
`/patterns`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- No remaining references: `grep -rn "oklch(0.5485_0.1061_160.41)\|oklch(0.6085_0.1061_160.41)\|/dashboard" src README.md context/deployment/deploy-plan.md` returns nothing

#### Manual Verification:

- Visiting `/patterns` while signed in loads the (still old-styled, pending Phase 2) page; `/dashboard` 404s
- Sign-in and sign-up redirect to `/patterns` after success
- Landing page, sign-in, and sign-up pages render with the same green as before (color unchanged, just token-driven)
- `README.md`'s routes table and `context/deployment/deploy-plan.md` reference `/patterns`, not `/dashboard`

---

## Phase 2: My Patterns page redesign

### Overview

Apply the new layout and copy to the renamed `patterns.astro` page and `PatternDashboard.tsx`,
using the `AppHeader` from Phase 1.

### Changes Required:

#### 1. Page shell and heading

**File**: `src/pages/patterns.astro`

**Intent**: Render `AppHeader` at the top, then a heading row with "My Patterns", the
supporting text "Create a new pattern or continue one you've already started.", and the
pattern-slot indicator ("N of 3 patterns" with the dot indicator from the mockup). Remove the
old absolute-positioned KRATKA link and the enclosing rounded card — the page becomes a plain
content column on the new cream background, per the mockup.

**Contract**: The slot indicator must reflect the *live* pattern count (matches the existing
cap-message pattern of reacting to client-side deletes), so it renders inside
`PatternDashboard.tsx` (which already owns the live `patterns` list), not statically in the
`.astro` frontmatter.

#### 2. Create-pattern form

**File**: `src/components/patterns/PatternDashboard.tsx`

**Intent**: Collapse the current two-line form (heading above a field row) into the mockup's
single compact horizontal row: "New pattern" label, Width field, Height field, "Create pattern"
button, all inline. Keep the existing at-cap message in the same creation area, per the
redesign doc.

**Contract**: Same `<form method="POST" action="/api/patterns">` and same field names/validation
(`width`, `height`, `min=20 max=100`) — layout only.

#### 3. Pattern table

**File**: `src/components/patterns/PatternDashboard.tsx`

**Intent**: Rename columns to "Pattern", "Grid size", "Last updated", and an untitled
right-aligned final column for Delete (no "Actions" header text). Delete becomes a low-emphasis
red text action instead of an outlined button.

**Contract**: Same `usePatternList` wiring (`requestDelete`/`confirmDelete`/`cancelDelete`,
same `AlertDialog`) — only the `TableHead` labels and the delete control's visual treatment
change.

#### 4. Remove the now-redundant inline sign-out

**File**: `src/components/patterns/PatternDashboard.tsx`

**Intent**: `AppHeader` (Phase 1) now owns the page's sign-out control, so the sign-out `<form>`
block rendered inside `PatternDashboard` becomes a duplicate. Remove it, and update the
component's docstring (which currently explains why sign-out lives here) to drop that
now-stale rationale.

**Contract**: `sessionExpired` state itself is unchanged and stays in use — the delete-error
banner's "Sign in" link still reads it. Only the dedicated `<form method="POST"
action="/api/auth/signout">` block and its conditional wrapper are deleted.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Page matches `my-patterns-page.html` mockup side-by-side (header, heading, slot indicator, form, table)
- Exactly one sign-out control appears on the page (in the header), not two
- Create pattern still works and redirects to the new pattern's editor
- Delete still shows the confirm dialog, removes the row, and un-hides the create form when going below the cap
- At the 3-pattern cap, the create form is replaced by the explanatory message in the same area
- Session-expired delete error still shows its own "Sign in" prompt (unrelated to the header)

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Editor structural redesign

### Overview

Restructure the editor's chrome and workspace layout: breadcrumb, editor action row, two-column
tools/palette + grid layout, and the palette's vertical sidebar restructure. This is the
higher-risk phase — changes sit close to the paint/save/unsaved-changes code paths, so no
interaction logic itself changes, only the JSX around it.

### Changes Required:

#### 1. Page shell

**File**: `src/pages/editor/[id].astro`

**Intent**: Render `AppHeader` (Phase 1) above the `client:load` `PatternEditor` island, using
the pattern owner's email from `Astro.locals.user`.

**Contract**: Same pattern lookup/404/redirect logic (now redirecting to `/patterns` per Phase
1) — only the added `AppHeader` render is new.

#### 2. Remove old header/back-button, add breadcrumb + action row

**File**: `src/components/editor/PatternEditor.tsx`

**Intent**: Delete the two `absolute`-positioned corner blocks (KRATKA link, "Back to
dashboard" button) — both are superseded by `AppHeader` and the new breadcrumb. Add a
breadcrumb ("My Patterns / {pattern.name}") above the title, where "My Patterns" is a real
navigation link guarded the same way the old KRATKA/back links were. Add an editor action row
above the workspace containing "Unsaved changes" status text (visible whenever `isDirty`) and
the Save button.

**Contract**: The breadcrumb's "My Patterns" link must call `attemptNavigate(() =>
(window.location.href = "/patterns"))` from the existing `useUnsavedChangesGuard`, exactly as
the removed links did — this is the one piece of navigation-with-guard logic that moves from
the (now-static) header into page content, per the redesign doc's instruction to keep
page-specific navigation out of the global header.

#### 3. Two-column workspace layout

**File**: `src/components/editor/PatternEditor.tsx`

**Intent**: Replace the single-column `flex flex-col items-center` wrapper with a two-column
layout: a narrow fixed-width sidebar (Tools + Palette) on the left, the grid workspace on the
right. The sidebar must not stretch or resize with grid dimensions.

**Contract**: A CSS grid (or flex) container with a fixed-width left column (e.g. `166px`,
matching the mockup) and a flexible right column; existing children (`PalettePanel`, the
canvas wrapper) move into these columns without changing their own internals in this step.

#### 4. Palette vertical sidebar restructure

**File**: `src/components/editor/PalettePanel.tsx`

**Intent**: Replace the horizontal `flex flex-wrap` row with a vertical layout inside the
sidebar: a "Palette N/30" heading (using `MAX_PALETTE_COLORS`), then swatches arranged to fit
roughly 3 per row across up to ~10 rows, each still showing its live count. Preserve the erase
button, add-color affordance (pending-color confirm/discard), and the at-cap message exactly as
they behave today — only the container layout and the added heading change.

**Contract**: `PalettePanelProps` is unchanged (`palette`, `tool`, `atCap`, `counts`,
`onAddColor`, `onSelectColor`, `onSelectErase`) — this is a layout-only change to the same
component.

#### 5. Add a Tools control (Paint/Erase)

**File**: `src/components/editor/PalettePanel.tsx` (or a small new sub-component within it)

**Intent**: The mockup shows a distinct "Tools" section (Paint/Erase) above the palette,
whereas today "Erase" is just the first item in the palette row and "Paint" is implicit
(selecting any color). Add a labeled "Paint" control that selects the currently-active color
(or the first palette color if none is selected) so both tools are clearly visible and labelled,
without changing the underlying `tool` state shape.

**Contract**: No changes to `usePatternGrid`'s `Tool` type or `selectColor`/`selectErase`
signatures — this is a presentational addition on top of the existing selection state.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Page structurally matches `pattern-editor-page.html` mockup (breadcrumb, action row, two-column layout, palette sidebar)
- Clicking "My Patterns" in the breadcrumb with unsaved changes shows the existing custom confirm dialog (not the native browser prompt); with no unsaved changes it navigates immediately
- Sign-out from the header still works from the editor page; with unsaved changes, the native browser "leave site" prompt appears (acceptable per Phase 1 decision)
- Paint, erase, add-color, and the 30-color cap all still work exactly as before
- Save still works; "Unsaved changes" text appears/disappears correctly with `isDirty`

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Editor visual polish (canvas + remaining tokens)

### Overview

Recolor the canvas's hardcoded draw colors to match the new palette and remove the grid's outer
card wrapper. Apply the new color tokens to the sidebar/tools/buttons built in Phase 3.

### Changes Required:

#### 1. Recolor canvas draw constants

**File**: `src/components/editor/PatternEditor.tsx`

**Intent**: Update the hardcoded gridline and edge-label colors used by `strokeCol`/`strokeRow`/
`draw` to match the new palette (e.g. heavy lines and edge-number text move from grays to a
tone consistent with `--kratka-ink`/`--kratka-muted`). Cell fills for empty cells stay white
per the existing "paper" comment — the redesign doc does not ask for that to change.

**Contract**: Only the literal color strings passed to `ctx.strokeStyle`/`ctx.fillStyle` inside
`strokeCol`, `strokeRow`, and `draw`'s edge-label block change — no changes to the
opaque-stroke/half-pixel-centering logic documented in the surrounding comments, and no changes
to `drawCell`'s incremental-redraw behavior.

#### 2. Remove the grid's card wrapper

**File**: `src/components/editor/PatternEditor.tsx`

**Intent**: Remove the `rounded border border-stone-300` wrapper around the canvas so the grid
sits directly on the board surface, per the redesign doc's "no padded inner card, no artificial
outer margin" instruction. Keep the `overflow-auto` scroll behavior for large grids.

**Contract**: The `<canvas>` element and its pointer handlers are unaffected — only the
wrapping `<div>`'s classes change.

#### 3. Apply tokens to remaining editor chrome

**File**: `src/components/editor/PatternEditor.tsx`, `src/components/editor/PalettePanel.tsx`

**Intent**: Replace any remaining raw Tailwind stone-* colors in the Save button, tools
sidebar, and palette selection rings with the new tokens from Phase 1, matching the mockup's
cream/charcoal/green palette throughout.

**Contract**: Visual-only class changes — no changes to any component's props or behavior.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Grid visually matches `pattern-editor-page.html` mockup (gridline colors, edge numbers, no outer card)
- Paint/erase on a large grid (e.g. 100×100) still redraws only the affected cell and its bordering lines — no visible flicker or full-grid repaint
- Full page matches the mockup's color palette end-to-end

**Implementation Note**: This is the final phase — after manual sign-off, the change is complete.

---

## Testing Strategy

### Unit Tests:

- None added — this repo has no frontend unit test framework; scope is layout/styling with no
  new business logic.

### Integration Tests:

- None added (see What We're NOT Doing) — existing `supabase/tests/database/` pgTAP suite is
  unaffected since no schema or RLS changes are made.

### Manual Testing Steps:

1. Sign in with the seeded test account (`test@example.com` / `password123`), land on `/patterns`.
2. Create a pattern, confirm redirect to its editor, confirm the pattern appears in the table on return.
3. Delete a pattern, confirm the slot indicator and cap message update live without reload.
4. Open a pattern, paint and erase cells including at grid edges, add a new color up to the 30-color cap.
5. Make an edit, click the "My Patterns" breadcrumb link, confirm the custom discard-changes dialog appears; confirm "Leave without saving" navigates and "Stay" cancels.
6. Save a pattern, confirm "Unsaved changes" text disappears and reopening shows the saved state.
7. Visit the old `/dashboard` URL directly, confirm a 404.
8. Sign out from both pages, confirm redirect behavior is unchanged from today.

## Performance Considerations

None — the canvas redraw strategy (full redraw on mount/resize, incremental single-cell redraw
on paint) is unchanged; only draw-call color constants change.

## Migration Notes

Not applicable — no data model or schema changes.

## References

- Frame brief: `context/changes/patterns-page-ui-improvements/frame.md`
- Redesign source: `kratka redesign.docx`, `my-patterns-page.html`, `pattern-editor-page.html`
  (`/Users/kabyshez/Library/Application Support/JetBrains/IntelliJIdea2025.3/scratches/docs/redesign/`)
- Related precedent: `context/archive/2026-09-09-editor-palette-merge/plan.md`,
  `context/archive/2026-08-31-editor-draw-save/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation — tokens, shared header, route rename

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Build succeeds: `npm run build`
- [x] 1.4 No remaining references: `grep -rn "oklch(0.5485_0.1061_160.41)\|oklch(0.6085_0.1061_160.41)\|/dashboard" src README.md context/deployment/deploy-plan.md` returns nothing

#### Manual

- [ ] 1.5 Visiting `/patterns` while signed in loads the page; `/dashboard` 404s
- [ ] 1.6 Sign-in and sign-up redirect to `/patterns` after success
- [ ] 1.7 Landing, sign-in, and sign-up pages render with the same green as before
- [ ] 1.8 `README.md` and `context/deployment/deploy-plan.md` reference `/patterns`, not `/dashboard`

### Phase 2: My Patterns page redesign

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Page matches `my-patterns-page.html` mockup side-by-side
- [ ] 2.5 Exactly one sign-out control appears on the page (in the header), not two
- [ ] 2.6 Create pattern still works and redirects to the new pattern's editor
- [ ] 2.7 Delete still shows confirm dialog, removes the row, un-hides create form below cap
- [ ] 2.8 At the 3-pattern cap, the create form is replaced by the explanatory message
- [ ] 2.9 Session-expired delete error still shows its own "Sign in" prompt

### Phase 3: Editor structural redesign

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Page structurally matches `pattern-editor-page.html` mockup
- [ ] 3.5 Breadcrumb "My Patterns" link shows custom confirm dialog when dirty, navigates immediately when clean
- [ ] 3.6 Sign-out from editor header works; native browser prompt appears when dirty
- [ ] 3.7 Paint, erase, add-color, and the 30-color cap all still work exactly as before
- [ ] 3.8 Save still works; "Unsaved changes" text tracks `isDirty` correctly

### Phase 4: Editor visual polish (canvas + remaining tokens)

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Build succeeds: `npm run build`

#### Manual

- [ ] 4.4 Grid visually matches `pattern-editor-page.html` mockup
- [ ] 4.5 Paint/erase on a large grid still redraws incrementally, no flicker or full-grid repaint
- [ ] 4.6 Full page matches the mockup's color palette end-to-end
