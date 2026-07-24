App Name: kratka

## Project summary

Kratka is a web-based grid pattern designer. Users draw patterns cell by cell on a configurable grid using a custom color palette. Patterns are saved to their account and can be exported as a printable PDF in color or black-and-white (with symbols). The app also calculates an estimated thread count and completion time for the pattern.

Primary use case: designing cross-stitch schemes. Secondary use cases: mosaic planning, carpet pattern drafting, any pixel-grid craft.

---

## Problem statement

Crafters who design their own patterns currently improvise with Excel spreadsheets or graph paper. Both are clunky: Excel has no concept of a stitch grid, colors are hard to manage, and printing a clean pattern is painful. There is no simple, free, browser-based tool focused purely on drawing a grid pattern from scratch without photo conversion or a complex professional UI.

---

## Target user

A crafter (primarily cross-stitch) who designs original patterns and wants a clean, fast, web tool to draw, save, and print their schemes. Not a beginner buying patterns — a creator making their own.

---

## Business logic 

Given a completed grid pattern, Kratka calculates the number of thread lengths required per color (based on stitch count and a configurable thread-length-per-stitch constant) and estimates total completion time (based on stitch count and a configurable stitches-per-hour rate).

---

## MVP scope

The MVP covers exactly two user flows:

**Flow 1 — Draw and save a pattern**
User logs in → creates a new pattern (sets grid size and palette) → draws on the grid → saves the pattern → pattern appears in their pattern list.

**Flow 2 — Export a pattern**
User opens a saved pattern → requests export → receives a printable PDF in color or black-and-white (colors replaced by symbols), including thread count estimate and time estimate.

Everything else is post-MVP.

---

## Functional requirements

### Authentication
- Email + password registration and login via Supabase Auth.
- Each pattern belongs to the authenticated user (row-level security).
- Unauthenticated users see a landing page only.

### Pattern management
- Create a new pattern: set grid width (20–100 cells) and grid height (20–100 cells). A user may have a maximum of 3 saved patterns. The "New pattern" button is disabled and shows an explanation when the limit is reached.
- Pattern name is auto-generated on creation (e.g. `pattern-1`, `pattern-2`). The user can rename it at any time by clicking the name inline in the editor — a simple text input, confirmed on blur or Enter.
- Define a palette of up to 10 colors (color picker, hex input).
- Draw on the grid: select a color from the palette, click or drag to fill cells.
- Eraser tool: click or drag to clear cells back to empty.
- Background color: set a default fill color for empty cells (used in export).
- Grid state is auto-saved with a 2-second debounce after the last cell interaction. A subtle status indicator in the editor shows "Saving…" / "Saved" / "Unsaved changes".
- List all saved patterns (name, grid size, last updated).
- Open / edit an existing pattern.
- Delete a pattern.

### Business logic — pattern limit
- A user may own at most 3 patterns. This is enforced both in the UI (button disabled with message) and on the server (Supabase RLS policy or API endpoint check rejects insert if count ≥ 3).

### Business logic — estimator
- Thread count per color: `stitch_count × thread_length_constant` (default: 45 cm per stitch, configurable per pattern).
- Time estimate: `total_stitch_count / stitches_per_hour` (default: 150 stitches/hour, configurable per pattern).
- Both values are displayed live in the editor sidebar as the user draws.

### Export — print view
- A dedicated `/patterns/:id/print` page rendered with `@media print` CSS — all app UI hidden, only the grid and legend visible.
- Color version: grid rendered with filled cell colors, palette legend with color names and thread counts, time estimate footer.
- Black-and-white version: each color replaced by a unique symbol (✕ ○ △ ◆ ▲ ● ■ ◇ ★ ▼), symbol legend with thread counts, time estimate footer.
- User switches between color and B&W via a toggle visible on screen but hidden when printing.
- User prints via browser Ctrl+P / Cmd+P — no file generation needed.

---

## Out of scope for MVP

- Layers
- Undo / redo (nice to have post-MVP)
- Add rows/columns from any side of an existing grid (pad with empty cells)
- Resize grid after creation — expand or shrink, with a warning when shrinking would delete filled cells
- PDF file generation (proper PDF export — v2 feature)
- Pattern sharing or public gallery
- Mobile app
- DMC / Anchor thread brand integration
- Custom symbols in export
- Grid sizes above 100×100

---

## Data model

### `profiles`
| column | type | notes |
|---|---|---|
| id | uuid | references auth.users |
| display_name | text | |
| created_at | timestamptz | |

### `patterns`
| column | type | notes |
|---|---|---|
| id | uuid | primary key |
| user_id | uuid | FK → profiles.id |
| name | text | |
| width | integer | 20–100 |
| height | integer | 20–100 |
| grid | jsonb | 2D array of color indices, e.g. `[[0,1,null],[2,0,1]]` |
| palette | jsonb | array of `{hex, name}` objects, max 10 |
| background_color | text | hex string, default `#ffffff` |
| thread_length_cm | integer | default 45 |
| stitches_per_hour | integer | default 150 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

## Tech stack

| Layer | Choice |
|---|---|
| Meta-framework | Astro 6 |
| UI components | React 19 (grid editor island) |
| Types | TypeScript |
| Styling | Tailwind CSS 4 |
| Backend + DB | Supabase (Postgres + Auth + RLS) |
| Deployment | Cloudflare Pages |

---

## Key screens

1. **Landing page** — app description, login / register CTA.
2. **Pattern list** — grid of pattern cards (name, size, last updated), "New pattern" button.
3. **Editor** — full-width grid canvas, palette selector, tool selector (paint / erase / background), estimator sidebar, save button, export button.
4. **Print view** — clean full-page layout at `/patterns/:id/print`, color/B&W toggle, grid + legend + estimates, everything else hidden via `@media print`.

---
