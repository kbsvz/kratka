# Patterns Schema + Owner-Scoped RLS — Plan Brief

> Full plan: `context/changes/patterns-schema-rls/plan.md`

## What & Why

Create the `patterns` table with owner-scoped Row-Level Security so every downstream slice
inherits per-user isolation from the database instead of re-implementing it. This is roadmap
foundation `F-01`. A misconfigured policy here would silently violate the PRD's primary
guardrail — "a user can never see, open, or modify another user's patterns" — across S-01, S-02,
and S-03 simultaneously, which is why it ships with tests rather than review alone.

## Starting Point

Auth is fully wired (Supabase SSR client, middleware guarding `PROTECTED_ROUTES`), but there is
no data layer at all: no `supabase/migrations/` directory, no linked project, no local stack
running, and no test runner of any kind. `.dev.vars` already holds working hosted credentials.
This change creates the project's first migration and its first automated verification path.

## Desired End State

A `patterns` table exists locally and on the hosted project. A signed-in user can read and write
only their own live rows, can never hold more than 3 patterns at once, and deleting one hides it
while freeing its slot for reuse. A grid whose length disagrees with its declared dimensions
cannot be stored at all. `npx supabase test db` proves each of these from a clean database.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Migration workflow | Local Docker first, then `db push` to hosted | RLS iteration needs repeated destructive resets, which are unsafe against a live project. |
| RLS verification | pgTAP via `supabase test db` | The CLI is already installed and it tests at the layer where RLS is actually enforced — no new test stack. |
| TypeScript scope | Migration + generated types, no service module | Types derived from the real schema make `astro check` meaningful; a data-access layer written before S-01 exists would be guesswork. |
| 3-pattern cap | `slot` column + partial `UNIQUE (user_id, slot)` | Race-free by construction; a trigger counting rows is not, under READ COMMITTED. |
| Delete semantics | Soft delete via `deleted_at` | User requirement — retain records for a period; single nullable timestamp beats a boolean + date pair that can desync. |
| Deleted-row visibility | RLS excludes them | Makes it structurally impossible for a downstream query to leak a deleted pattern by forgetting a filter. |
| Identity vs ordinal | `uuid id` + per-user `seq` | An auto-incrementing key is global, so it cannot express "this user's third pattern"; uuid also avoids exposing platform-wide row counts. |
| Naming | `pattern_names` pool; `seq` 1–3 ordinal, ≥4 random from never-assigned | Soft delete keeps `seq` climbing past 3, making the pool reachable; excluding ever-assigned names stops one being recycled onto different work. |
| Constraints | Dims, palette size, and `grid length = width × height` | The grid-length CHECK makes drawn-vs-printed mismatch — the PRD's top correctness risk — impossible to store. |
| Retention purge | Deferred to a later change | At 3 patterns per user, unpurged rows cost nothing; a purge job needs scheduling infrastructure this foundation shouldn't carry. |

## Scope

**In scope:** `patterns` and `pattern_names` tables; CHECK constraints; partial unique indexes;
RLS policies for select/insert/update; `pick_pattern_name()` SQL function; `updated_at` trigger;
pgTAP suite; generated types wired into `src/types.ts`; hosted push.

**Out of scope:** API endpoints, UI, `zod`, a data-access service module, purge/retention jobs,
restore/undelete, tiled grid encoding, changes to `PROTECTED_ROUTES`.

## Architecture / Approach

One migration creates both tables with RLS already enabled, so the table is never briefly
world-readable. Three per-user numbers do distinct jobs: `id` identifies the row, `slot` (1–3,
reclaimed on delete) enforces the cap via a partial unique index, and `seq` (monotonic, never
reused) drives naming. pgTAP then proves the policies rather than trusting review, and types are
generated from the applied schema so they cannot drift from it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Local stack + migration | Both tables, constraints, indexes, policies, seed, functions | Getting the UPDATE policy's USING/WITH CHECK split wrong breaks soft delete |
| 2. pgTAP tests | Proof of isolation, cap, soft delete, constraints | A suite missing `set local role` passes vacuously and proves nothing |
| 3. Generated types | `src/db/database.types.ts` + `src/types.ts`, typed client | Type generation must run against the applied schema, not a stale one |
| 4. Hosted push | Same schema live on the hosted project | Only step touching a real environment; drift if link targets the wrong ref |

**Prerequisites:** Docker running (confirmed); `supabase` CLI installed (confirmed, devDependency);
hosted project credentials in `.dev.vars` (confirmed).
**Estimated effort:** ~1–2 sessions; Phases 1–2 carry most of the work, 3–4 are short.

## Open Risks & Assumptions

- pgTAP impersonation via `request.jwt.claims` is the assumed mechanism; if it misbehaves in this
  CLI version, Phase 2's manual "deliberately break a policy" check is the backstop that catches
  a vacuous suite.
- The hosted project is assumed empty of a prior `patterns` table; `db push` would surface a
  conflict if not.
- **Retention is intent, not enforcement.** PRD v2 FR-013 commits to keeping deleted records "for
  a period" but names no window, and no purge job exists — so in the MVP nothing is ever actually
  deleted. Harmless at this scale; becomes a real obligation the moment account deletion or any
  privacy commitment enters scope.
- Names are consumed monotonically and never returned, so the pool is finite per user. 56 pool
  names are seeded, meaning exhaustion needs 59 lifetime creations by one person — unreachable at
  MVP scale, but the `'My Pattern N'` fallback exists for it.
- Both `seq` and name assignment depend on a `security definer` trigger to read past RLS. Drop
  that qualifier in a future refactor and two narrow failures appear: creation breaks for users
  who deleted their most recent pattern, and retired names start recycling. Phase 2 pins each with
  its own assertion.

## Success Criteria (Summary)

- `npx supabase db reset && npx supabase test db` passes from a clean database.
- A user cannot read, update, or hold more than three of anything that isn't theirs.
- `npm run build` and `npx astro check` pass with the generated types wired in.
