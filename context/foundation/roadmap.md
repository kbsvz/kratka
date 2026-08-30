---
project: "kratka"
version: 1
status: draft
created: 2026-08-27
updated: 2026-08-30
prd_version: 2
main_goal: speed
top_blocker: capacity
milestone_id: first-usable-pattern
milestone_seq: 1
milestone_status: open
---

# Roadmap: kratka

> Derived from `context/foundation/prd.md` (v2) + auto-researched codebase baseline (2026-08-27).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: First Usable Pattern** — Status: open

- **Intent:** Prove that a cross-stitch designer can complete the full MVP workflow with kratka: draw a grid pattern, define a color palette, save it, manage their list of saved patterns, and produce a printable color chart showing per-color thread counts and a total time estimate.
- **Source materials:** `context/foundation/prd.md` (v2)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-017, FR-019; US-01, US-02 (all must-have FRs and both user stories from the PRD).

## Vision recap

Crafters designing original cross-stitch schemes currently improvise with spreadsheets or graph paper — neither understands a stitch grid. Kratka is a focused, browser-based grid pattern editor built on the insight that the cell-painting core is craft-agnostic: the same drawing surface serves cross-stitch, mosaic, and carpet drafting, with only the resource estimator swapping between crafts. The MVP targets cross-stitch designers specifically, delivering a clean drawing surface, palette management, and a printable chart with per-color thread counts and a total time estimate computed from fixed rate constants (45 cm/stitch, 150 stitches/hour).

## North star

**S-01: user can draw, paint a palette, and save a pattern** — the riskiest implementation unknown is whether a performant paint interaction (< 100 ms feedback on a 100×100 grid) can be delivered inside the 3-week after-hours window; if S-01 ships and feels right, the print view becomes a display-only surface reading already-validated data.

> The north star is the smallest end-to-end slice whose successful delivery proves the core product hypothesis — placed first because everything else only matters if the editor actually works at the required performance level.

## At a glance

| ID   | Change ID           | Outcome (user can …)                                                                                                                                                               | Prerequisites | PRD refs                                                                                                    | Status   |
|------|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|-------------------------------------------------------------------------------------------------------------|----------|
| F-01 | patterns-schema-rls | (foundation) patterns + pattern_names tables with owner-scoped RLS exist in Supabase; safe per-user CRUD and soft delete are possible                          | —          | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-011, FR-012, FR-013; Access Control                      | planning |
| S-01 | editor-draw-save    | create a pattern (set grid size), define a color palette, paint and erase cells with live per-color count, save it, and reopen any saved pattern to continue editing               | F-01 | FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-012, FR-014, FR-019 | proposed |
| S-02 | pattern-list-manage | see all their saved patterns (name, grid size, last updated) and delete a pattern to free a slot                                                                                   | F-01          | FR-003, FR-011, FR-013                                                                                      | proposed |
| S-03 | color-print-view    | open a clean print view for a saved pattern showing the grid, per-color thread counts, and a total time estimate; print via the browser's native dialog with no app UI on the page | S-01 | FR-003, FR-015, FR-016, FR-017, FR-019                                          | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme               | Chain                     | Note                                                                                                      |
|--------|---------------------|---------------------------|-----------------------------------------------------------------------------------------------------------|
| A      | Core editor & print | `F-01` → `S-01` → `S-03` | Critical path to the north star and the MVP payoff; both flows are required by the primary Success Criterion. |
| B      | Pattern management  | `S-02`                    | Joins Stream A at `F-01`; parallel with S-01 once F-01 lands. Delivers slot management alongside the editor. |

## Baseline

What's already in place in the codebase as of 2026-08-27 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** Present — Astro 6 + React 19 + Tailwind 4 + shadcn/ui (`src/components/ui/button.tsx` confirmed); auth pages and `dashboard.astro` exist. No grid editor or pattern UI yet.
- **Backend / API:** Partial — 3 auth API handlers (`api/auth/signin.ts`, `signup.ts`, `signout.ts`); no pattern CRUD endpoints.
- **Data:** Absent — no `supabase/migrations/`, no `patterns` table, no data queries. FR-001 and FR-002 are satisfied via the auth baseline; FR-003 is partially satisfied (middleware guards `/dashboard`; new pattern routes will extend it per S-01/S-02/S-03).
- **Auth:** Present — Supabase Auth wired (`src/lib/supabase.ts`); middleware at `src/middleware.ts` guards routes and injects `context.locals.user`; auth sign-in/sign-up/confirm-email pages and form components present.
- **Deploy / infra:** Present — `wrangler.jsonc` configured for Cloudflare Workers (named `"kratka"`); GitHub Actions CI at `.github/workflows/ci.yml` runs lint, build, and `npm audit` on push/PR to `main`.
- **Observability:** Absent — no structured logging library or error tracking; `wrangler tail` available for live debugging.

## Foundations

### F-01: Patterns schema + RLS

- **Outcome:** (foundation) A `patterns` table exists in Supabase with the correct column schema (id, user_id, seq, slot, name, width, height, palette, format, grid, created_at, updated_at, deleted_at) and owner-scoped RLS policies — a logged-in user can only read and write their own live rows; deleting is a soft delete that hides the row from its owner and frees its slot for reuse; CRUD from any downstream slice is safe without additional per-request authorization logic. A seeded `pattern_names` lookup table supplies auto-generated names.
- **Change ID:** patterns-schema-rls
- **PRD refs:** FR-001, FR-002, FR-003 (auth mechanism that RLS `auth.uid()` relies on), FR-004 (width/height columns), FR-005 (3-pattern cap enforced server-side via a partial unique index on `(user_id, slot)` scoped to live rows — race-free by construction), FR-006 (`pattern_names` pool + per-user creation ordinal `seq` driving name selection), FR-011, FR-012, FR-013 (soft delete via `deleted_at`; retention purge is a later change); Access Control section (flat single-role ownership, no cross-user visibility)
- **Unlocks:** S-01 (editor needs safe pattern create/save/load), S-02 (list and delete need the table), S-03 (print view reads saved pattern data)
- **Prerequisites:** — (Supabase project connected with `SUPABASE_URL` and `SUPABASE_KEY` configured; see `context/deployment/deploy-plan.md`)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** RLS policies enforce the primary security guardrail ("a user can never see or modify another user's patterns") at the database layer; establishing this first means every downstream slice gets isolation for free and cannot accidentally omit it. A misconfigured policy here silently violates a guardrail across all slices.
- **Status:** planning

## Slices

### S-01: Draw, save, and reopen a pattern (north star)

- **Outcome:** user can create a new pattern by setting grid dimensions (20–100 × 20–100), define a color palette of up to 30 colors via color picker or hex input, paint and erase cells on the grid with a live per-color cell count displayed in the editor, save the pattern via a Save button (with an unsaved-changes warning before navigating away), and reopen any previously saved pattern to continue editing — with the exact same grid, palette, and dimensions restored.
- **Change ID:** editor-draw-save
- **PRD refs:** FR-003 (new pattern and editor routes added to `PROTECTED_ROUTES`), FR-004 (create pattern with configurable grid dimensions 20–100), FR-005 (3-pattern cap enforced server-side; "New pattern" disabled with explanation at the limit), FR-006 (auto-generated name on creation: `pattern-1`, `pattern-2`, …), FR-007 (palette of up to 30 colors via color picker / hex input), FR-008 (paint cells by selecting a palette color and clicking or dragging), FR-009 (erase cells by clicking or dragging), FR-010 (save via Save button; unsaved-changes guardrail), FR-012 (open and continue editing an existing pattern), FR-014 (live per-color cell count updated as the user draws), FR-019 (heavy gridline every 10th row and column with edge numbers in the editor)
- **Prerequisites:** F-01
- **Parallel with:** S-02 (both depend only on F-01; neither depends on the other)
- **Blockers:** —
- **Unknowns:**
  - What rendering approach (CSS grid, canvas, SVG) achieves < 100 ms paint feedback on a 100×100 grid in the target desktop browsers without excessive memory use? — Owner: team. Block: no (plannable; technical research belongs in `/10x-plan editor-draw-save`).
  - How does a user navigate to reopen a specific saved pattern before S-02's list exists? — Owner: team. Block: no (a direct route to a known pattern ID, e.g. `/editor/<id>`, is sufficient to verify FR-012 for this slice; building any pattern list/picker UI is explicitly out of scope here — that's S-02's job).
- **Risk:** The largest slice by FR count, necessarily so — create, draw, and save are inseparable steps in one user workflow; none is independently useful. The main execution risk is grid rendering performance on large grids; this must be prototyped early within the change, not left for the end.
- **Status:** proposed

### S-02: Pattern list and slot management

- **Outcome:** user can view a list of all their saved patterns showing each pattern's name, grid size (width × height), and last-updated time; and delete any pattern to free a slot, with a brief confirmation prompt before deletion.
- **Change ID:** pattern-list-manage
- **PRD refs:** FR-003 (list and delete routes added to `PROTECTED_ROUTES`), FR-011 (list all saved patterns with name, grid size, last updated), FR-013 (delete a pattern)
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Smallest slice; low risk. The pattern list is the natural entry point for navigating to the editor (S-01) and the print view (S-03) — its layout should leave room for those navigation affordances even before those routes exist.
- **Status:** proposed

### S-03: Color print view with thread-count estimator

- **Outcome:** user can open a dedicated print view for any saved pattern showing the full grid (with heavy gridlines every 10th row and column and edge numbers), a palette legend listing each color with its computed thread length (cell count × 45 cm/stitch), and a footer with the total time estimate (total filled cells ÷ 150 stitches/hour); when they print via the browser's native print dialog, only the grid and legend appear on the printed page — all app UI is hidden via print CSS.
- **Change ID:** color-print-view
- **PRD refs:** FR-003 (print view route added to `PROTECTED_ROUTES`), FR-015 (dedicated color print view with grid, palette legend showing per-color thread counts, and total time-estimate footer), FR-016 (print CSS hides all app UI — only grid and legend print), FR-017 (browser native print dialog; no file generated), FR-019 (heavy gridlines every 10th row and column with edge numbers in the print view)
- **Prerequisites:** S-01 (print view reads a saved pattern; the save mechanism and pattern schema must be verified before print output can be trusted as correct)
- **Parallel with:** S-02 (once S-01 is done, S-02 and S-03 can proceed independently)
- **Blockers:** —
- **Unknowns:**
  - How to render the full 100×100 grid legibly on a printed A4/letter page (scaling, cell size, font size for edge numbers, color accuracy in print)? — Owner: team. Block: no (plannable; research belongs in `/10x-plan color-print-view`).
- **Risk:** The business logic (thread-count and time-estimate computation) must exactly match the drawn grid — a discrepancy between what the designer drew and what the legend shows is the primary correctness NFR. Verified by comparing saved grid data to the rendered legend values in a test pattern.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID           | Suggested issue title                                                 | Ready for `/10x-plan` | Notes                                                              |
|------------|---------------------|-----------------------------------------------------------------------|-----------------------|--------------------------------------------------------------------|
| F-01       | patterns-schema-rls | Supabase migration: patterns + pattern_names tables, owner-scoped RLS | planned               | Plan written: `context/changes/patterns-schema-rls/plan.md`. Run `/10x-implement patterns-schema-rls phase 1`. |
| S-01       | editor-draw-save    | Grid editor: create pattern, paint palette, live count, save, reopen  | no                    | Awaits F-01. Prototype grid rendering performance early within the change. |
| S-02       | pattern-list-manage | Pattern dashboard: list all patterns, delete a pattern                | no                    | Awaits F-01. Parallel with S-01 — can run as a separate agent task. |
| S-03       | color-print-view    | Print view: color grid, thread-count legend, time estimate, print CSS | no                    | Awaits S-01. Parallel with S-02 once S-01 is done.                 |

## Open Roadmap Questions

None at this time. The PRD resolved all gray areas during shaping (`shape-notes.md`: `quality_check_status: accepted`, zero open questions). Per-slice technical questions (grid rendering approach, print page layout) are captured as non-blocking Unknowns in their respective slices and are resolved during `/10x-plan`.

## Parked

From PRD `## Non-Goals` — all confirmed during shaping:

- **No photo-to-pattern conversion** — Why parked: core positioning; kratka is for drawing from scratch (PRD §Non-Goals).
- **No PDF file generation** — Why parked: export is browser-print only; PDF generation is post-MVP (PRD §Non-Goals).
- **No payment / paid-tier unlock** — Why parked: the 3-pattern cap and 100-cell grid ceiling are simply fixed in the MVP; billing is post-MVP (PRD §Non-Goals).
- **No sharing or public gallery** — Why parked: patterns are private to their owner; sharing and team workspaces are explicitly out (PRD §Non-Goals).
- **No auto-save** — Why parked: cut to fit the 3-week target; manual Save button with unsaved-changes warning is the MVP approach (PRD §Non-Goals).
- **No inline rename** — Why parked: patterns keep auto-generated names in the MVP (PRD §Non-Goals).
- **No background-color picker** — Why parked: empty cells default to white (PRD §Non-Goals).
- **No per-pattern constant configuration** — Why parked: 45 cm/stitch and 150 stitches/hour are fixed defaults; configurability is post-MVP (PRD §Non-Goals).
- **No undo / redo, no layers** — Why parked: editor polish deferred (PRD §Non-Goals).
- **No grid resize after creation** — Why parked: grid dimensions are fixed at creation time (PRD §Non-Goals).
- **No mobile or touch support** — Why parked: desktop browser only for the MVP (PRD §Non-Goals).
- **No DMC / Anchor thread-brand integration** — Why parked: palette colors are free-form hex, not mapped to a thread catalogue (PRD §Non-Goals).
- **No custom export symbols** — Why parked: the B&W symbol set, if built later, uses a fixed built-in set (PRD §Non-Goals).
- **No grids larger than 100×100** — Why parked: free-tier ceiling (PRD §Non-Goals).
- **No offline support** — Why parked: kratka is an online tool (PRD §Non-Goals).
- **FR-018: B&W / symbol export** — Why parked: explicitly nice-to-have; color-first is the correct MVP order (PRD FR-018).

## Milestone History

(Empty — this is the first milestone.)

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips the item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
