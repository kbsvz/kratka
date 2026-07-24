---
project: "kratka"
version: 1
status: draft
created: 2026-06-12
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# kratka — Product Requirements Document

## Vision & Problem Statement

Crafters who design their own grid patterns — primarily cross-stitch designers creating
original schemes — currently improvise with spreadsheets or graph paper. Neither understands
a stitch grid: colors are clumsy to manage, and producing a clean, printable pattern is
painful. There is no simple, free, browser-based tool focused purely on drawing a grid
pattern from scratch, without photo-to-pattern conversion or a heavy professional UI.

The insight: the grid-drawing core is craft-agnostic — the same act of painting a schema
cell by cell serves cross-stitch, mosaic, carpet drafting, and any pixel-grid craft. What
differs between crafts is only the estimator: how required resources (e.g. thread lengths)
and completion time are counted. Building the editor generic and the estimator as the
craft-specific layer means the cross-stitch MVP is also the foundation for other crafts
later — extension is "add a new estimator," not "rebuild the editor."

## User & Persona

**Primary persona — the cross-stitch designer.** A crafter who designs their *own*
cross-stitch patterns (not a beginner buying ready-made patterns). They reach for kratka the
moment they sit down to draft a new scheme from scratch and want a clean, fast, browser tool
to draw, save, and print it. They value a focused drawing surface, easy color management, and
a clean printout over feature breadth.

### Secondary persona
Other pixel-grid crafters (mosaic, carpet, general pixel craft) are an explicit post-MVP
extension path, served by swapping in a craft-specific estimator over the same editor — not a
co-equal MVP persona.

## Success Criteria

### Primary
- A cross-stitch designer completes both MVP flows end-to-end: draw a pattern → save it →
  reopen it → produce a clean color printout whose legend shows each color's thread-count and
  the pattern's total time estimate. The printout's thread/time figures are correct for the
  drawn grid.

### Secondary
- B&W / symbol export (nice-to-have) is available.
- The live per-color cell tally in the editor helps the designer track palette usage while
  drawing.

### Guardrails
- A user never sees or edits another user's patterns (per-user data isolation).
- The printout is clean — no app UI appears on the printed page.
- Saving reliably persists a pattern, and the user is not left unaware of unsaved changes
  (manual Save in the MVP; auto-save is post-MVP).
- The 3-pattern cap is enforced server-side, not just in the UI.

## User Stories

### US-01: Draw and save a pattern

- **Given** a logged-in cross-stitch designer with fewer than 3 saved patterns
- **When** they create a new pattern, set its grid size and palette, paint cells, and click Save
- **Then** the pattern persists and appears in their pattern list with its name, grid size, and last-updated time

#### Acceptance Criteria
- Attempting to create a 4th pattern is blocked with an explanation, enforced server-side.
- A saved pattern reopens with the exact grid, palette, and dimensions as drawn.
- Selecting a palette color and clicking/dragging fills cells; the eraser clears them back to empty.

### US-02: Export a pattern to a color printout

- **Given** a logged-in designer with a saved pattern
- **When** they open the pattern's print view and print via the browser
- **Then** they get a clean color page showing the grid, a legend of each color with its thread count, and the total time estimate — with no app UI on the page

#### Acceptance Criteria
- Thread count per color and total time match the drawn grid using the fixed constants (45 cm/stitch, 150 stitches/hour).
- No app chrome (toolbars, buttons, sidebar) appears on the printed page.
- The chart shows a heavier gridline every 10th row/column with edge numbers (10, 20, 30, …) for counting.

## Functional Requirements

### Authentication & access
- FR-001: A user can register with email + password. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.
- FR-002: A user can log in with email + password. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.
- FR-003: An unauthenticated visitor can only view the landing page; all other routes require sign-in. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.

### Pattern management
- FR-004: A user can create a new pattern by setting grid width (20–100) and height (20–100). Priority: must-have
  > Socratic: Counter-argument considered: "min 20 is too large for small motifs; max 100 too small for ambitious projects." Resolution: kept; the 100-cell ceiling is a deliberate free-tier boundary (larger grids are the future paid tier) and also protects rendering/print performance (100×100 = 10k cells).
- FR-005: A user can own at most 3 saved patterns; "New pattern" is disabled with an explanation at the limit, enforced server-side. Priority: must-have
  > Socratic: Counter-argument considered: "3 is too low; engaged designers will hit it and bounce." Resolution: kept; 3 is a deliberate free-tier limit — more patterns are the future paid tier. Reversible.
- FR-006: A pattern's name is auto-generated on creation (`pattern-1`, `pattern-2`, …). Priority: must-have
  > Socratic: No domain counter-argument; stands as written (inline rename was cut to the post-MVP scope).
- FR-007: A user can define a palette of up to 30 colors via color picker / hex input. Priority: must-have
  > Socratic: Counter-argument considered: "10 colors is too few for real cross-stitch (designs routinely use 20–40 shades), making the tool unusable for the target designer." Resolution: cap raised from 10 to 30 — a usability requirement, not a free/paid lever.
- FR-008: A user can paint cells by selecting a palette color and clicking or dragging. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.
- FR-009: A user can erase cells (click or drag) back to empty. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.
- FR-010: A user can save the current pattern via a Save button. Priority: must-have
  > Socratic: Counter-argument considered: "users expect auto-save; a manual Save risks lost work if they forget." Resolution: accepted for MVP as a deliberate 3-week scope cut; a guardrail warns of unsaved changes, and auto-save is the first post-MVP addition.
- FR-011: A user can list all their saved patterns (name, grid size, last updated). Priority: must-have
  > Socratic: No domain counter-argument; stands as written.
- FR-012: A user can open and edit an existing pattern. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.
- FR-013: A user can delete a pattern. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.

### Estimator & tallies
- FR-014: The editor shows a live per-color cell count as the user draws. Priority: must-have
  > Socratic: Counter-argument considered: "without the live thread/time math, a raw cell count is noise." Resolution: kept; it's nearly free to compute and gives the designer immediate, visible feedback on palette usage while drawing.

### Export / print
- FR-015: A user can open a dedicated color print view for a saved pattern, showing the grid, a palette legend with per-color thread counts, and a total time-estimate footer. Priority: must-have
  > Socratic: No domain counter-argument; stands as written (this is the MVP payoff surface).
- FR-016: On the print view, only the grid and legend appear on the printed page — no app UI. Priority: must-have
  > Socratic: No domain counter-argument; stands as written.
- FR-017: A user can print via the browser's native print dialog; no file is generated. Priority: must-have
  > Socratic: No domain counter-argument; stands as written (proper PDF generation is explicitly post-MVP).
- FR-018: A user can switch the print view to a B&W/symbol version (each color → unique symbol, symbol legend with thread counts). Priority: nice-to-have
  > Socratic: Counter-argument considered: "B&W symbol charts are the standard cross-stitch working format, so B&W — not color — should be the must-have." Resolution: kept as nice-to-have; the user judged color-first correct (designers proof in color), B&W is a later convenience.

### Grid display
- FR-019: The grid shows a heavier gridline every 10th row and column with edge numbering (10, 20, 30, …), in both the editor and the print view. Priority: must-have
  > Socratic: Counter-argument considered: "heavy lines + numbers add visual clutter and rendering cost on large grids, and grids whose size isn't a multiple of 10 end on a partial block." Resolution: kept; the 10-count grid with edge numbers is the standard cross-stitch charting convention essential for counting while stitching — emphasis lines fall at every 10th boundary and the final partial block is normal and expected.

## Non-Functional Requirements

- A user can never see, open, or modify another user's patterns under any circumstance.
- Painting or erasing a cell produces visible feedback within 100 ms, and the editor remains
  responsive while drawing on a grid as large as 100×100 (10,000 cells).
- The per-color thread lengths and total time estimate shown on the printout exactly match the
  drawn grid and the fixed rate constants — figures are reproducible, with no discrepancy
  between what is drawn and what is printed.
- The product is usable on the current versions of the mainstream desktop browsers; mobile and
  touch input are out of scope for the MVP.

## Business Logic

Given a completed grid pattern, kratka computes — per palette color — the thread length
required (the count of cells using that color × a fixed length-per-stitch) and the pattern's
total completion time (total filled cells ÷ a fixed stitches-per-hour rate), and presents both
on the printable pattern.

The rule consumes two user-facing inputs: the drawn grid (which cells are filled with which
palette color) and the palette itself. Its outputs are a per-color thread-length figure and a
single total time estimate. In the MVP the two rate constants are fixed defaults — 45 cm of
thread per stitch and 150 stitches per hour — not user-configurable (per-pattern
configurability is post-MVP). The user encounters the result on the color print view: the
palette legend lists each color with its thread length, and a footer shows the total time
estimate. A lighter live per-color cell count also appears in the editor while drawing, but the
thread/time computation itself surfaces only on the printout.

## Access Control

Multi-user, but a flat single role. Every authenticated user is an identical owner: they can
create, view, edit, and delete only their own patterns. There is no admin role, no shared/team
access, and no public visibility.

- **Sign-up / sign-in**: email + password registration and login.
- **Ownership**: each pattern belongs to exactly one authenticated user; a user can only see
  and act on patterns they own.
- **Unauthenticated access**: an unauthenticated visitor sees only the landing page. Any gated
  route (pattern list, editor, print view) requires sign-in.

## Non-Goals

Confirmed scope avoids:
- **No photo-to-pattern conversion** — kratka is for drawing from scratch; auto-converting a
  photo to a grid is explicitly not the product (core positioning).
- **No PDF file generation** — export is browser-print only; a downloadable PDF file is post-MVP.
- **No payment / paid-tier unlock** — freemium is the intent, but billing and unlocking higher
  limits is out of MVP scope; the 3-pattern cap and 100-cell ceiling are simply fixed.
- **No sharing / public gallery** — patterns are private to their owner; sharing, public
  galleries, and team workspaces are out (single-tenant lock).

Deferred editor capabilities (post-MVP):
- **No auto-save** — MVP uses a manual Save button (cut for the ~3-week target).
- **No inline rename** — patterns keep their auto-generated names in the MVP.
- **No background-color picker** — empty cells default to white.
- **No per-pattern constant configuration** — thread-length and stitches/hour are fixed defaults.
- **No undo / redo, no layers** — editor polish deferred.
- **No grid resize / add-rows after creation** — grid dimensions are fixed at creation.

Deferred reach & integrations (post-MVP):
- **No mobile app or touch support** — desktop browser only.
- **No DMC / Anchor thread-brand integration** — palette colors are free-form, not mapped to a
  thread catalogue.
- **No custom export symbols** — the B&W symbol set (if built) is the fixed built-in set.
- **No grids larger than 100×100** — that's the free-tier ceiling.

Non-functional non-goal:
- **No offline support** — kratka is an online tool; offline editing is not a goal.

## Open Questions

No blocking open questions at this time. The shaping session resolved every gray area it
surfaced (recorded in `shape-notes.md`), and the quality cross-check found no gaps. Forward-
looking items (paid-tier mechanics, post-MVP editor capabilities) are captured as Non-Goals,
not open questions.
