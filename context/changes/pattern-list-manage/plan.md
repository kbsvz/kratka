# Pattern dashboard: list, create, and delete — Implementation Plan

## Overview

Extend `dashboard.astro` with a list of the signed-in user's saved patterns (name, grid
size, last-updated) and let them delete a pattern to free a slot, with a confirmation
prompt. Also relocate pattern creation onto the same page: the width/height inputs and
Create button move from the standalone `/editor/new` page (deleted entirely) onto
`/dashboard`, so the dashboard becomes the single hub for seeing, creating, and deleting
patterns. Two phases, sequenced read/create-then-delete: prove the list and the relocated
create flow render correctly against real data first, then layer the delete action (new API
route + client state + confirmation) on top of an already-proven foundation.

## Current State Analysis

- `dashboard.astro` (`src/pages/dashboard.astro:8-12`) only runs a `count`-only Supabase
  query to gate the 3-pattern cap; it renders no list. When under cap it shows a "New
  Pattern" link to `/editor/new` (`src/pages/dashboard.astro:26-38`); at cap it shows a
  static message instead.
- `src/pages/editor/new.astro` is a standalone Astro page: a plain `<form method="POST" action="/api/patterns">` with shadcn `Input`/`Label`/`Button`, HTML5 `min="20" max="100" required` on both fields, a `?error=` query-param banner, and a "Back to dashboard" link. This entire page is being deleted; its form markup relocates onto `/dashboard`.
- `src/pages/api/patterns/index.ts` is the single pattern-creation endpoint (`POST`,
  form-data, zod `createPatternSchema` from `src/lib/patterns.ts:4-7`). On validation
  failure, missing Supabase config, or the `KR001` 3-pattern-cap trigger exception, it
  redirects to `/editor/new?error=...` (three call sites: lines 20, 25, 48). **On success it
  already redirects to `/editor/<id>`** — this is unchanged and already satisfies "navigate
  to the grid from dashboard" once the form's origin page becomes `/dashboard`; only the
  three error-path redirect targets need to change.
- `src/types.ts:42` already defines `PatternListItem = Pick<Pattern, "id" | "name" | "width" | "height" | "updated_at">` — exactly FR-011's fields. Nothing to add to the type layer.
- F-01's migration (`supabase/migrations/20260830140641_create_patterns_and_names.sql:59-61`)
  already added `patterns_user_live_idx on patterns(user_id, updated_at desc) where deleted_at is null`,
  with a comment explicitly calling out that it "supports the S-02 list query." The `patterns_select`
  RLS policy (same file, lines 88-90) already filters `deleted_at is null`, so a plain
  `select(...).order("updated_at", { ascending: false })` with no extra predicate is both correct and
  index-backed — no new query logic to design.
- The soft-delete path is `soft_delete_pattern(p_id uuid) returns void` (same migration,
  lines 285-315), `security definer`, granted to `authenticated` only. It raises `KR003` if
  unauthenticated and `KR002` ("Pattern not found") if the row doesn't exist, isn't owned, or
  is already deleted — the three cases are indistinguishable by design (same file, lines 305-306).
  It returns nothing; the freed slot has no separate signal, it's just available to the next insert.
- No list or delete API route exists yet. `src/pages/api/patterns/[id].ts` (`PATCH` save,
  JSON, 401-on-no-session) is the convention the new `DELETE` handler on the same file
  follows, since it's invoked from client-side `fetch`, not a form submit — unlike creation,
  which stays a plain form POST (see Implementation Approach).
- `src/components/hooks/usePatternGrid.ts:144-174` (`save()`) and
  `src/components/hooks/useUnsavedChangesGuard.ts` establish the two idioms this plan mirrors:
  a `fetch` call that special-cases `response.status === 401` with a distinct session-expired
  message, and an `attempt→pending→confirm/cancel` state machine for a confirmation dialog.
  `PatternEditor.tsx:303-314` shows the matching `AlertDialog` markup for a destructive
  confirmation (discard unsaved changes) — the delete confirmation reuses the same component.
- Only `alert-dialog`, `button`, `input`, `label` are installed under `src/components/ui/`
  (`components.json` confirms shadcn "new-york" style, Tailwind, `@/components/ui` alias).
  No `table` component yet.
- `PROTECTED_ROUTES` (`src/middleware.ts:4`) is `["/dashboard", "/editor"]`. Deleting
  `/editor/new` doesn't require touching this list — `/editor/<id>` (the grid editor) still
  needs the `/editor` prefix. No new page route is added by this plan, and no new *page*
  middleware entry is needed. API routes are not covered by `PROTECTED_ROUTES` — each checks
  `context.locals.user` itself, as the new `DELETE` handler will.
- No unit test framework is configured (`package.json` has no `vitest`/`jest`); verification
  follows the same automated (lint/typecheck/build) + manual browser-testing split S-01 used.

## Desired End State

A signed-in user visiting `/dashboard` sees, in one place: a table of all their live
patterns (name, width×height, relative last-updated time, most-recently-updated first), and
— directly below or alongside it — either width/height inputs and a Create button (under
cap) or the existing cap message (at cap). Submitting the create form creates the pattern
and navigates straight to its grid editor, exactly as today's flow does, just starting from
`/dashboard` instead of `/editor/new`. The standalone `/editor/new` page file no longer
exists — that path now falls through to `/editor/[id].astro`'s catch-all, which treats
`"new"` as an unrecognized pattern id and redirects to `/dashboard`, same as any bad id (see
Key Discoveries). Each list row has a
delete action; confirming it removes the pattern immediately from the list and frees its
slot server-side. The cap-boundary section (create form vs. cap message) reacts to the
current in-browser pattern count, so deleting down from 3 patterns reveals the create form
again without a page reload.

Verify by: from zero patterns, using the on-dashboard form to create 3 patterns one at a
time (confirming each submission navigates to that pattern's grid editor), confirming the
cap message replaces the create form at 3, deleting one from the list, confirming the create
form reappears without reload and the deleted pattern is gone from the list and no longer
reachable at `/editor/<id>` (redirects to `/dashboard`), and confirming `/editor/new` returns
a genuine 404 (via `[id].astro`'s uuid-shape guard, change 5 below).

### Key Discoveries:

- `patterns_user_live_idx` and `PatternListItem` were built during F-01 anticipating this
  exact slice — this is almost purely an API + UI task, no schema or type work required.
- The cap-boundary decision (what to show under vs. at cap) currently lives in server-rendered
  Astro markup computed once at request time, and today toggles a link. Since Phase 2
  introduces client-side optimistic state for the pattern list, that same state must also
  drive the cap-boundary decision, or a delete won't reveal the create form until the page
  reloads (see Critical Implementation Details below). Phase 1 relocates the form under this
  same boundary condition (server-computed, as today); Phase 2 makes it live.
- `src/pages/editor/[id].astro` is a catch-all dynamic route — deleting `new.astro` alone
  would NOT make `/editor/new` 404; it would still match `[id].astro` with `id = "new"` and
  fall into the existing not-found branch, which 302-redirects to `/dashboard` (same as any
  nonexistent pattern id). Since `/editor/new` should genuinely not exist, `[id].astro` gets
  a small explicit fix (change 4 below): validate `id` looks like a uuid *before* querying,
  and 404 outright when it doesn't. `"new"` was never a real pattern id, so this is a correctness
  fix, not a special case — it also means the app stops spending a DB round-trip on
  obviously-malformed ids. Genuine uuids that are simply unowned/nonexistent still redirect
  to `/dashboard`, preserving FR-012's "not found and not owned look the same" property,
  which only matters for values that could plausibly be a real id in the first place.

## What We're NOT Doing

- No conversion of pattern creation to a client-side fetch/JSON API — the existing
  form-POST-and-redirect convention is preserved, just relocated onto `/dashboard`. (The
  archived S-01 impl-review floated switching this route to JSON+fetch as a possible
  follow-up; this plan explicitly does not take that up — it's a bigger contract change than
  this slice needs.)
- No redirect stub for `/editor/new` — it 404s outright via `[id].astro`'s new uuid-shape
  guard (change 4), not via a dedicated route or special-cased string check on `"new"`.
- No new page route — the list and create form live on `/dashboard`, not a dedicated
  `/patterns` page.
- No rename/edit-metadata UI — patterns keep their system-assigned names (PRD Non-Goals).
- No print-view navigation — S-03 doesn't exist yet. The list's Actions column is laid out to
  hold a future Print action without restructuring, but nothing non-functional is rendered
  today.
- No pagination/virtualization — the 3-pattern cap makes the list always tiny.
- No bulk delete, undo, or delete-history UI.
- No change to `soft_delete_pattern`, the schema, or RLS policies — all already correct.

## Implementation Approach

Phase 1 lands the read/create path: a new `PatternDashboard` client island (installed
alongside a new shadcn `Table`) renders `dashboard.astro`'s server-fetched pattern rows, an
empty state, and — under the same cap boundary `dashboard.astro` computes today — either the
relocated create form or the cap message. `/editor/new.astro` is deleted and
`src/pages/api/patterns/index.ts`'s three error redirects retarget to `/dashboard`. The
component ships with an inert list "Actions" column (no delete button yet) so Phase 2's diff
is additive, not structural. Phase 2 adds the `DELETE` API route and a `usePatternList` hook
mirroring `usePatternGrid`'s fetch/401 idiom and `useUnsavedChangesGuard`'s confirm-dialog
state machine, then swaps the cap-boundary condition from the static initial prop to this
hook's live count so it reacts to optimistic deletes.

## Critical Implementation Details

- **State sequencing**: `dashboard.astro` today decides "cap message" vs. "create
  affordance" server-side, once, from a single query. Phase 1 relocates the create form
  under this same server-computed condition (no behavior change, just a different page).
  Phase 2 must move the decision into `PatternDashboard`'s client state
  (`patterns.length >= 3`), replacing the server-rendered conditional — otherwise a
  client-side delete correctly removes the row but leaves the stale cap message in place
  until a full reload. The server-side cap enforcement in the create-pattern trigger
  (`KR001`) is unaffected and remains the real authority; this is a client-UX-only fix.

## Phase 1: Pattern list and on-dashboard creation (read/create path)

### Overview

Render the signed-in user's live patterns as a table on `/dashboard`, and relocate pattern
creation onto the same page, deleting the standalone `/editor/new` page.

### Changes Required:

#### 1. Install the shadcn Table component

**File**: `src/components/ui/table.tsx` (generated)

**Intent**: Add the `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`
primitives via the project's stated convention for adding shadcn components.

**Contract**: Run `npx shadcn@latest add table`. No manual edits to the generated file.

#### 2. Relative-time formatting helper

**File**: `src/lib/utils.ts`

**Intent**: Format a pattern's `updated_at` as a relative string ("2 hours ago") for the
list, using the native `Intl.RelativeTimeFormat` — no new dependency.

**Contract**: Add and export `formatRelativeTime(iso: string): string`, bucketing the delta
between `iso` and `Date.now()` into the largest sensible unit (minutes → hours → days →
`Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(...)`), falling back to `"just now"`
for sub-minute deltas.

#### 3. New `PatternDashboard` client component

**File**: `src/components/patterns/PatternDashboard.tsx`

**Intent**: Own everything `dashboard.astro` currently renders below the welcome/sign-out
block: the pattern table (name, width×height, relative last-updated, and an empty "Actions"
cell reserved for Phase 2's delete button and any future S-03 print action) or a "No
patterns yet" message when empty, plus — under the cap boundary — either the relocated
create form (width/height `Input`s + Create `Button`, same HTML5 constraints and `?error=`
banner `new.astro` had) or the existing cap message text. No delete interactivity in this
phase; the cap boundary in Phase 1 is decided from the `initialPatterns` prop's length, same
as today's server-computed value.

**Contract**: `export default function PatternDashboard({ initialPatterns, createError }: { initialPatterns: PatternListItem[]; createError?: string })`. The create form is a plain
`<form method="POST" action="/api/patterns">` (full-page navigation on submit, not
intercepted by JS) — React renders it, but submission behaves identically to today's
`new.astro` form. Mounted with `client:load` from `dashboard.astro` (it will own
interactive delete state starting Phase 2, so it hydrates from the start rather than
switching directives later).

#### 4. Delete the standalone create page

**File**: `src/pages/editor/new.astro` (deleted)

**Intent**: Its markup relocated into `PatternDashboard` (change 3); the page itself is
removed.

**Contract**: Delete the file. No redirect stub.

#### 5. Make `/editor/new` (and any other malformed id) genuinely 404

**File**: `src/pages/editor/[id].astro`

**Intent**: `[id].astro` is a catch-all — deleting `new.astro` alone leaves `/editor/new`
resolving via this route with `id = "new"`, falling into the existing not-found branch,
which redirects to `/dashboard`. `/editor/new` should not exist at all, so validate the id
looks like a uuid before querying; anything else 404s immediately instead of hitting the
database and redirecting.

**Contract**: Add a `UUID_RE` check on `id`; when it fails, set `Astro.response.status = 404`
instead of running the Supabase query. When it passes but the pattern is still not
found/not owned, keep the existing 302-to-`/dashboard` behavior unchanged — this only
narrows the *malformed-input* path, it doesn't touch the RLS-driven "not found and not
owned look the same" contract for genuine ids.

#### 6. Retarget creation error redirects

**File**: `src/pages/api/patterns/index.ts`

**Intent**: The three redirects that currently point validation/config/cap-exception errors
at `/editor/new?error=...` (lines 20, 25, 48) must point at `/dashboard?error=...` instead,
since that's now where the create form lives. The success path (`/editor/${data.id}`) is
unchanged.

**Contract**: Replace the `/editor/new` prefix in all three `context.redirect(...)` calls
with `/dashboard`. No other logic in this file changes.

#### 7. Extend `dashboard.astro`

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the count-only cap query with one query that fetches
`PatternListItem` rows (`id, name, width, height, updated_at`) ordered by `updated_at desc`,
covering both the cap check (`patterns.length >= 3`) and the list. Read the `error` query
param (as `new.astro` did) and pass it through. Remove the old static cap-message/New-Pattern-link
block entirely — `PatternDashboard` now owns that decision.

**Contract**: `supabase.from("patterns").select("id, name, width, height, updated_at").order("updated_at", { ascending: false })`, typed as `PatternListItem[]`. Render
`<PatternDashboard client:load initialPatterns={patterns} createError={Astro.url.searchParams.get("error") ?? undefined} />` beneath the existing welcome/sign-out markup.

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Type-check passes: `npx astro check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] Dashboard lists all of the signed-in user's live patterns with correct name,
      width×height, and a sensible relative last-updated time
- [ ] List order is most-recently-updated first
- [ ] Zero patterns shows the empty-state message, no table shell, and the on-dashboard
      create form
- [ ] Under cap, submitting the width/height form on `/dashboard` creates a pattern and
      navigates directly to its grid editor
- [ ] Invalid width/height (out of 20–100 range) shows the existing validation error message
      back on `/dashboard`, not a separate page
- [ ] At the 3-pattern cap, the cap message renders instead of the create form, alongside the
      populated list
- [ ] Visiting `/editor/new` directly returns a 404 (via `[id].astro`'s uuid-shape guard)
- [ ] Visiting any other malformed `/editor/<id>` (non-uuid) also 404s; a well-formed but
      nonexistent/not-owned uuid still redirects to `/dashboard` (unchanged)
- [ ] A second test account's patterns never appear (RLS regression check)
- [ ] Table and form render correctly at standard and high-DPI display, matching the app's
      existing visual style

---

## Phase 2: Delete action (write path)

### Overview

Add a `DELETE` API route wired to `soft_delete_pattern`, and give `PatternDashboard` the
ability to delete a row with confirmation and optimistic removal, making the cap-boundary
decision reactive to those deletes.

### Changes Required:

#### 1. `DELETE` handler

**File**: `src/pages/api/patterns/[id].ts`

**Intent**: Authenticate, call the `soft_delete_pattern` RPC for the given id, and map its
error codes to HTTP responses — mirroring the existing `PATCH` handler's structure and its
`PGRST116`→404 precedent.

**Contract**: `export const DELETE: APIRoute`. No session (`!context.locals.user`) → 401 JSON
`{error: "Not authenticated"}` (matches `PATCH`). Call
`supabase.rpc("soft_delete_pattern", { p_id: id })`. On error: `KR002` → 404 JSON
`{error: "Pattern not found"}`; `KR003` → 401 (defensive — the route's own auth check should
catch this first); any other code → 400 JSON `{error: "Delete failed"}` plus a
`console.error` server log (mirroring `PATCH`'s unexpected-failure logging). Success → `204`.

#### 2. `usePatternList` hook

**File**: `src/components/hooks/usePatternList.ts`

**Intent**: Own the client-side pattern list and the delete confirmation flow, mirroring
`useUnsavedChangesGuard`'s `attempt→pending→confirm/cancel` naming and `usePatternGrid.save()`'s
401-handling idiom.

**Contract**: `export function usePatternList(initialPatterns: PatternListItem[])` returning
`{ patterns, pendingDeleteId, deleteError, requestDelete, confirmDelete, cancelDelete }`.
`requestDelete(id)` sets `pendingDeleteId`. `confirmDelete()`: optimistically removes the
pattern from `patterns` state, clears `pendingDeleteId`, then `fetch`es
`DELETE /api/patterns/${id}`. On `401`: roll back (re-insert the row, preserving sort order)
and set `deleteError` to a session-expired message (same phrasing style as
`usePatternGrid`'s). On `404`: leave the optimistic removal in place and do NOT set
`deleteError` — the pattern is gone either way, so this is treated as success, not a failure.
On any other non-OK status or a thrown/network error: roll back and set a generic
`deleteError` ("Couldn't delete. Check your connection and try again."), matching
`usePatternGrid`'s catch-block message style. `cancelDelete()` clears `pendingDeleteId` only.

#### 3. Wire delete into `PatternDashboard`

**File**: `src/components/patterns/PatternDashboard.tsx`

**Intent**: Use `usePatternList` instead of holding `initialPatterns` directly for the table.
Render a delete button in each row's Actions cell calling `requestDelete(pattern.id)`, a
single shared `AlertDialog` (open when `pendingDeleteId` is set) with Cancel/Delete actions
wired to `cancelDelete`/`confirmDelete` — same structural pattern as
`PatternEditor.tsx:303-314`'s discard-changes dialog. Show `deleteError` as inline text below
the table when set.

#### 4. Make the cap-boundary decision reactive

**File**: `src/components/patterns/PatternDashboard.tsx`

**Intent**: Per the Critical Implementation Details note, the create-form-vs-cap-message
choice must react to live client state, not just the initial prop's length.

**Contract**: Swap the boundary condition from `initialPatterns.length >= 3` (Phase 1) to the
hook's live `patterns.length >= 3`. No markup restructuring — Phase 1 already built both
branches; only the data source driving which one renders changes.

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint`
- [ ] Type-check passes: `npx astro check`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:

- [ ] Deleting a pattern removes it from the list immediately (no visible reload/flash) and
      it no longer loads at `/editor/<id>` (redirects to `/dashboard`)
- [ ] Confirmation dialog shows before delete; Cancel leaves the pattern untouched
- [ ] Deleting down from the 3-pattern cap reveals the create form (width/height inputs +
      Create button) without a page reload
- [ ] Simulating an expired session (e.g. clearing the auth cookie) on delete shows the
      session-expired message and restores the row
- [ ] Deleting the same pattern twice in quick succession (e.g. two tabs) does not surface an
      error on the second attempt — the row simply stays gone
- [ ] A network failure during delete restores the row and shows the generic error message

---

## Testing Strategy

### Unit Tests:

None — no unit test framework is configured in this repo (consistent with S-01's precedent).

### Integration Tests:

None required — no schema, RLS, or RPC changes. The existing pgTAP suite
(`npx supabase test db`) already covers the cap/slot-reclamation/soft-delete invariants this
slice depends on; re-running it is a regression sanity check, not new coverage.

### Manual Testing Steps:

1. Sign in with zero patterns; confirm the dashboard shows the create form directly (no
   `/editor/new` involved). Create a pattern by entering width/height and submitting;
   confirm it navigates straight to that pattern's grid editor.
2. Repeat to create a 2nd and 3rd pattern the same way; confirm the cap message replaces the
   create form at 3, and the list shows all 3, most-recent first.
3. Delete one pattern from the list; confirm the row disappears immediately, the create form
   reappears without reload, and the deleted pattern's `/editor/<id>` route now redirects to
   `/dashboard`.
4. Delete the remaining patterns down to zero; confirm the empty-state message replaces the
   table (create form still shown, since under cap).
5. With the delete confirmation dialog open, click Cancel; confirm nothing changes.
6. Visit `/editor/new` directly; confirm it returns a 404. Visit `/editor/<a real pattern's
   id>` after deleting that pattern (or one you don't own); confirm that still redirects to
   `/dashboard`, not a 404.

## Performance Considerations

None of note — the list is capped at 3 rows by the existing 3-pattern limit, and the
query is backed by `patterns_user_live_idx`. No virtualization or pagination needed.

## Migration Notes

None — no schema changes. F-01's existing schema (index, RPC) already supports everything
this plan needs.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-003, FR-011, FR-013)
- F-01 plan: `context/archive/2026-08-30-patterns-schema-rls/plan.md`
- S-01 plan: `context/archive/2026-08-31-editor-draw-save/plan.md`
- S-01 impl-review (create-route redirect convention, and the floated JSON+fetch
  alternative this plan declines): `context/archive/2026-08-31-editor-draw-save/reviews/impl-review.md`
- Schema: `supabase/migrations/20260830140641_create_patterns_and_names.sql`
- Types: `src/types.ts`
- Fetch/401 idiom: `src/components/hooks/usePatternGrid.ts:144-174`
- Confirm-dialog idiom: `src/components/hooks/useUnsavedChangesGuard.ts`
- AlertDialog markup precedent: `src/components/editor/PatternEditor.tsx:303-314`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Pattern list and on-dashboard creation (read/create path)

#### Automated

- [x] 1.1 Lint passes — 24483a1
- [x] 1.2 Type-check passes — 24483a1
- [x] 1.3 Build succeeds — 24483a1

#### Manual

- [x] 1.4 Dashboard lists all live patterns with correct name, width×height, relative last-updated time — 24483a1
- [x] 1.5 List order is most-recently-updated first — 24483a1
- [x] 1.6 Zero patterns shows empty-state message, no table shell, and the on-dashboard create form — 24483a1
- [x] 1.7 Under cap, submitting the create form creates a pattern and navigates to its grid editor — 24483a1
- [x] 1.8 Invalid width/height shows the validation error back on /dashboard, not a separate page — 24483a1
- [x] 1.9 At the 3-pattern cap, cap message renders instead of the create form, alongside the populated list — 24483a1
- [x] 1.10 Visiting /editor/new returns a 404 — 24483a1
- [x] 1.11 A malformed /editor/<id> 404s; a well-formed but nonexistent/not-owned id still redirects to /dashboard — 24483a1
- [x] 1.12 A second test account's patterns never appear — 24483a1
- [x] 1.13 Table and form render correctly at standard and high-DPI display — 24483a1

### Phase 2: Delete action (write path)

#### Automated

- [x] 2.1 Lint passes
- [x] 2.2 Type-check passes
- [x] 2.3 Build succeeds

#### Manual

- [x] 2.4 Deleting a pattern removes it immediately and its editor route redirects to /dashboard
- [x] 2.5 Confirmation dialog shows before delete; Cancel leaves the pattern untouched
- [x] 2.6 Deleting down from the cap reveals the create form without a page reload
- [x] 2.7 Expired-session delete shows session-expired message and restores the row
- [x] 2.8 Double-delete (already-gone pattern) shows no error
- [x] 2.9 Network failure during delete restores the row and shows the generic error message
