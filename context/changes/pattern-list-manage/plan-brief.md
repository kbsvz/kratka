# Pattern dashboard: list, create, and delete — Plan Brief

> Full plan: `context/changes/pattern-list-manage/plan.md`

## What & Why

FR-011 and FR-013 are unimplemented: a signed-in user has no way to see their saved patterns
or delete one to free a slot. This closes that gap by extending `/dashboard` with a pattern
list and a delete action. It also relocates pattern creation onto the same page — the
width/height inputs and Create button move off the standalone `/editor/new` page (deleted
entirely) — so `/dashboard` becomes the single hub for seeing, creating, and deleting
patterns, alongside S-01's editor and S-03's future print view.

## Starting Point

`dashboard.astro` today only runs a `count`-only query to gate the 3-pattern cap; it renders
no list, and creation lives on a separate `/editor/new` page that form-POSTs to
`/api/patterns`. The schema side is already built: F-01 added a `PatternListItem` type and a
dedicated index (`patterns_user_live_idx`) explicitly anticipating this slice's list query,
plus a `soft_delete_pattern` RPC. No schema or type work is needed — this is an API + UI
slice, now including a UI relocation as well as list/delete.

## Desired End State

A user visiting `/dashboard` sees a table of their live patterns (name, grid size,
relative last-updated time), most-recent first, each with a delete action behind a
confirmation prompt. Directly on the same page, under the 3-pattern cap, they see the
width/height create form; submitting it creates the pattern and navigates straight to its
grid editor, same as today's flow. At the cap, the form is replaced by the existing cap
message. `/editor/new` no longer exists. Deleting a pattern removes it from the list
immediately and frees its slot — including revealing the create form again if they were
previously at cap, without a page reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where the list and create form live | Extend `dashboard.astro`; delete `/editor/new` | Consolidates pattern management onto one hub page per the user's explicit request; no new protected route needed. |
| Create-form submission style | Keep plain form POST + redirect | Reuses the existing, already-working `/api/patterns` endpoint unchanged (only its 3 error-redirect targets move); avoids a bigger JSON/fetch rewrite the S-01 impl-review floated but didn't require. |
| Navigation after create | Unchanged — endpoint already redirects to `/editor/<id>` | Satisfies "navigate to the grid from dashboard" with zero new code. |
| List rendering | New shadcn `Table` component | Matches the project's stated convention for adding shadcn primitives; tabular data fits naturally. |
| Post-delete UX | Optimistic removal with rollback | Matches the responsive feel of the editor's existing save flow. |
| Delete route auth failure | JSON 401 | Consistent with the client-fetch-driven `PATCH` route and `usePatternGrid`'s 401 idiom; delete is invoked from client JS, not a form submit. |
| Empty state | Friendly message, create form still shown | Avoids an empty table shell; the create form (not a separate CTA link) already guides first-time users. |
| S-03 print-view space | Flexible Actions-column layout, no placeholder button | Satisfies the roadmap's "leave room" note without shipping non-functional UI. |
| Delete-already-gone (404) | Treated as client-side success | Idempotent-feeling UX for cross-tab races; RLS already prevents any real cross-user case. |
| Last-updated display | Relative time via native `Intl.RelativeTimeFormat` | More scannable, no new dependency required. |
| Cap-boundary component | Single `PatternDashboard` owns table + create-form/cap-message toggle | Both the list and the toggle need to react to the same client-side delete state — one component avoids splitting that shared state across files. |

## Scope

**In scope:**
- Pattern list on `/dashboard` (name, width×height, relative last-updated)
- Pattern creation relocated onto `/dashboard`; `/editor/new` deleted
- Delete action with confirmation dialog and optimistic removal
- New `DELETE /api/patterns/[id]` route calling the existing `soft_delete_pattern` RPC
- Cap-boundary (create form vs. cap message) reacting live to client-side deletes

**Out of scope:**
- Converting pattern creation to a client-side fetch/JSON flow
- A dedicated `/patterns` route
- Pattern rename/edit-metadata UI
- Any S-03 print-view navigation (layout only reserves space)
- Pagination/virtualization, bulk delete, undo

## Architecture / Approach

`dashboard.astro` fetches the caller's live patterns server-side (RLS + `patterns_user_live_idx`
already scope and order this correctly) and passes them, plus any `?error=` message, to a new
`PatternDashboard` client island. Phase 1 has that island render the table read-only and the
relocated create form (still a plain form-POST, full-page navigation on submit) under the
same cap boundary `dashboard.astro` used to compute server-side; `/editor/new.astro` is
deleted and `/api/patterns/index.ts`'s three error redirects retarget to `/dashboard`. Phase
2 adds a `usePatternList` hook (mirroring the editor's existing fetch/401 and confirm-dialog
idioms) that owns delete state, wires the new `DELETE` route, and swaps the cap-boundary's
data source from the static initial prop to the hook's live count.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pattern list and on-dashboard creation (read/create path) | Table + relocated create form on `/dashboard`, empty state, `/editor/new` deleted | Low — mostly relocating existing, working markup/endpoints into one page |
| 2. Delete action (write path) | Delete route + confirm dialog + optimistic removal, cap-boundary reactivity | Keeping the cap-boundary decision in sync with client-side deletes (see plan's Critical Implementation Details) |

**Prerequisites:** F-01 (done) and S-01 (done) — both already archived.
**Estimated effort:** Small — two phases, no schema changes, ~6 new/edited/deleted files total.

## Open Risks & Assumptions

- Assumes client-derived pattern count is acceptable UX-only cap signaling; server-side
  `KR001` enforcement on the create trigger remains the real authority if client state is ever
  stale (e.g. a second tab).
- Assumes no external links/bookmarks depend on `/editor/new` existing — it's deleted with no
  redirect stub, reasonable for an early-stage, not-yet-public app.
- No unit test framework exists in the repo; verification is lint/typecheck/build +
  manual browser testing, consistent with S-01's precedent.

## Success Criteria (Summary)

- A user can see every saved pattern's name, size, and last-updated time, most-recent first.
- A user can create a pattern directly from `/dashboard` and land on its grid editor, with no
  separate "New Pattern" page in the flow.
- A user can delete a pattern with one confirmation step and immediately see it gone and its
  slot freed (create form reappears at the cap boundary without reloading).
- No regression to cross-user isolation, the 3-pattern cap, or the editor's reopen route.
