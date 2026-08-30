# Patterns Schema + Owner-Scoped RLS — Implementation Plan

## Overview

Create the `patterns` table and a seeded `pattern_names` lookup pool in Supabase, protected by
owner-scoped Row-Level Security, with a race-free 3-pattern cap, soft delete, and database-level
invariants that make a desynced grid impossible to store. Prove isolation with pgTAP tests, then
surface the schema to TypeScript via generated types.

This is roadmap foundation `F-01`. It unlocks S-01 (editor), S-02 (pattern list), and S-03
(print view) — none of which can safely touch pattern data until this lands.

## Current State Analysis

- **No migrations exist.** `supabase/config.toml` is present from the starter (Postgres 17,
  `[db.migrations] enabled = true`, `project_id = "10x-astro-starter"`), but there is no
  `supabase/migrations/` directory, no `supabase link` (`supabase/.temp/` absent), and the local
  stack is not running. Docker is running and the `supabase` CLI is a devDependency (`^2.23.4`).
- **`.dev.vars` points at a hosted Supabase project** (populated `SUPABASE_URL` / `SUPABASE_KEY`).
- **No test runner.** `package.json` exposes only `lint`, `build`, `format`. There is no
  vitest/jest/playwright, so RLS has no existing verification path.
- **Auth is wired and working.** `src/lib/supabase.ts:5` exports `createClient()` which returns
  `null` when env vars are absent — every call site must handle that. `src/middleware.ts:4`
  guards `PROTECTED_ROUTES` and sets `Cache-Control: private, no-store` on protected responses.
  `src/env.d.ts:3` types `App.Locals.user`.
- **`src/types.ts` does not exist** despite CLAUDE.md naming it the shared-types home.
- **`zod` is not installed** despite CLAUDE.md mandating it for API route validation. No API
  routes are in scope here, so it stays out.
- **Grid encoding is already decided** — dense JSONB array of palette indices, per
  `notes/grid-storage-design.md`.

## Desired End State

A `patterns` table exists locally and on the hosted project with owner-scoped RLS such that:

- A logged-in user can read, insert, and update only their own live rows.
- A user cannot hold more than 3 live patterns, enforced by a unique index rather than a count.
- Deleting is a soft delete; deleted rows are invisible even to their owner, and free their slot.
- A row whose `grid` length disagrees with `width × height` cannot be stored at all.
- `npx supabase test db` passes a pgTAP suite asserting all of the above.
- `src/types.ts` exports typed `Pattern` entities derived from the real schema, so `astro check`
  verifies downstream code against it.

Verify by running `npx supabase db reset && npx supabase test db` from a clean state.

### Key Discoveries

- A `BEFORE INSERT` trigger counting rows is **not** race-free under READ COMMITTED — two
  concurrent inserts can both observe 2 and both succeed. A unique index is.
- With soft delete retaining history, a per-user monotonic `seq` reaches values > 3, which makes
  the `pattern_names` pool beyond id 3 genuinely reachable. Under hard delete it would have been
  dead code.
- A primary key that auto-increments is global across all users, so it cannot express a per-user
  creation ordinal. `id` (identity) and `seq` (ordinal) are necessarily separate columns.
- JSONB stores array length in its value header, so `jsonb_array_length(grid) = width * height`
  is a near-free CHECK even on a 10,000-element array.

## What We're NOT Doing

- No API endpoints (`src/pages/api/patterns/*`) — S-01 and S-02 own those.
- No UI, no editor, no pattern list.
- No `src/lib/services/patterns.ts` data-access module — deferred until S-01 gives it a real
  consumer, to avoid guessing shapes.
- No `zod` install — belongs with the endpoints that need it.
- No purge/retention job. `deleted_at` is recorded; reclaiming storage is a later change.
- No restore/undelete feature.
- No tiled or binary grid encoding — `format` is recorded so that migration stays additive later.
- No change to `PROTECTED_ROUTES`; new routes are added by the slices that introduce them.

## Implementation Approach

One migration creates both tables together with RLS already enabled, so the table is never
briefly readable across users. pgTAP then proves the policies rather than trusting review. Types
are generated from the applied schema (derived, not hand-written) so they cannot drift. The
hosted push is last and isolated, because it is the only step that touches a real environment.

## Critical Implementation Details

**The UPDATE policy's `USING` and `WITH CHECK` clauses must differ.** Soft-deleting is an
`UPDATE` that sets `deleted_at`. If `WITH CHECK` also required `deleted_at IS NULL`, the row's
post-update state would violate its own policy and every delete would fail. `USING` restricts
which rows may be targeted (live, owned); `WITH CHECK` validates the resulting row (owned).

**Slot uniqueness must be a partial index.** A plain `UNIQUE (user_id, slot)` would let a
soft-deleted row hold its slot permanently, so a user who deleted a pattern could never create a
replacement. Scope the index with `WHERE deleted_at IS NULL`.

**Assignment must read past RLS — for two separate reasons.** The SELECT policy hides deleted
rows, but both `seq` and name selection need to see them: `seq` is unique across all of a user's
rows, so an invoker-rights `max(seq)` collides with a retained one; and names must exclude those
ever assigned, or a deleted pattern's name recycles onto different content. Hence the assignment
trigger is `security definer`. Both failures are narrow — the first hits only users who deleted
their most recent pattern, the second is invisible until someone notices a familiar name on
unfamiliar work — so each has its own pgTAP assertion rather than relying on incidental coverage.

**Table creation and RLS must be in the same migration file.** A migration that creates the table
and a later one that enables RLS leaves a window where the table is world-readable through
PostgREST.

**pgTAP impersonates users via JWT claims,** not by connecting as different database users. Each
test block sets `role authenticated` and `request.jwt.claims` to the target user's id, then
resets. Assertions that forget to set the role run as superuser and pass vacuously — the manual
check in Phase 2 exists to catch exactly that.

---

## Phase 1: Local Stack + Schema Migration

### Overview

Bring up the local Supabase stack, create the project's first migration, and define both tables
with all constraints, indexes, RLS policies, seed data, and the name-picker function.

### Changes Required:

#### 1. Local stack

**File**: `supabase/config.toml`

**Intent**: Align the project identifier with the actual project name so local container names
and any future `supabase link` are unambiguous.

**Contract**: `project_id = "kratka"` (currently `"10x-astro-starter"`).

#### 2. First migration

**File**: `supabase/migrations/<timestamp>_create_patterns_and_names.sql`

**Intent**: Create both tables, every invariant, and the RLS policy set in one atomic migration.
Generate the file with `npx supabase migration new create_patterns_and_names` so the timestamp
follows the `YYYYMMDDHHmmss` convention in CLAUDE.md.

**Contract**:

```sql
-- Reference pool for auto-generated names.
create table pattern_names (
  id   int  primary key,
  name text not null unique
);

create table patterns (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  seq        int         not null,      -- per-user creation ordinal, never reused
  slot       smallint    not null,      -- 1..3, reclaimed after soft delete
  name       text        not null,
  width      int         not null,
  height     int         not null,
  palette    jsonb       not null default '[]'::jsonb,
  format     text        not null default 'dense-json-v1',
  grid       jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint patterns_width_range   check (width  between 20 and 100),
  constraint patterns_height_range  check (height between 20 and 100),
  constraint patterns_palette_size  check (jsonb_array_length(palette) <= 30),
  constraint patterns_grid_length   check (jsonb_array_length(grid) = width * height),
  constraint patterns_slot_range    check (slot between 1 and 3),
  constraint patterns_seq_positive  check (seq >= 1),
  constraint patterns_user_seq_uniq unique (user_id, seq)
);

-- Race-free 3-pattern cap: only live rows occupy a slot.
create unique index patterns_user_slot_live_uniq
  on patterns (user_id, slot) where deleted_at is null;

-- Supports the S-02 list query.
create index patterns_user_live_idx
  on patterns (user_id, updated_at desc) where deleted_at is null;
```

#### 3. RLS policies

**File**: same migration

**Intent**: Enable RLS on both tables and grant per-operation, per-role access. No `DELETE`
policy is created — hard deletes are not reachable through the client; a future purge job runs
with `service_role`, which bypasses RLS.

**Contract**: policies for role `authenticated` on `patterns`:

```sql
alter table patterns      enable row level security;
alter table pattern_names enable row level security;

create policy patterns_select on patterns for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy patterns_insert on patterns for insert to authenticated
  with check (user_id = (select auth.uid()) and deleted_at is null);

-- USING gates which rows may be targeted; WITH CHECK validates the result.
-- WITH CHECK must NOT require deleted_at IS NULL, or soft delete rejects itself.
create policy patterns_update on patterns for update to authenticated
  using       (user_id = (select auth.uid()) and deleted_at is null)
  with check  (user_id = (select auth.uid()));

-- Name pool is read-only reference data.
create policy pattern_names_select on pattern_names for select to authenticated
  using (true);
```

#### 4. Seed data, seq assignment, and name picker

**File**: same migration

**Intent**: Seed the name pool with ids 1–3 as the ordinal names plus further names for when the
cap lifts, then assign `seq` and `name` automatically on insert so S-01's create path supplies
only `width`, `height`, `palette`, `grid`, and `slot`.

**Contract**: a `before insert` trigger on `patterns`, `security definer`, that sets
`NEW.seq` and `NEW.name` when they are not supplied.

`security definer` is **required, not stylistic**: `seq` is unique across all of a user's rows
including soft-deleted ones, but the SELECT policy hides deleted rows. An invoker-rights
`max(seq)` would therefore see only live rows and return a value that collides with a retained
deleted row — reproducibly breaking creation for any user who deleted their most recent pattern.
The trigger must read past RLS to compute `coalesce(max(seq), 0) + 1` over every row for that
user. Restrict it with `set search_path = ''` and fully-qualified table names, as any
`security definer` function should be.

Name selection, called by the same trigger: for `seq <= 3` return the pool name at that id.
Otherwise return a random name with `id > 3` that this user has **never been assigned** —
excluding names held by soft-deleted patterns as well as live ones, so a name is never recycled
onto different content. The `security definer` context that `seq` already requires is what makes
this possible; under invoker rights the deleted rows would be invisible and names would silently
come back.

Because names are consumed monotonically and never returned to the pool, a user with a long
delete-and-recreate history can exhaust it. Fall back to `'My Pattern ' || seq`, which is itself
collision-free since `seq` is unique per user. With 45 pool names seeded, exhaustion requires 48
lifetime creations by one user — unreachable in practice at MVP scale.

Seed data, verbatim. Ids 1–3 are the ordinals returned for a user's first three patterns and must
never be renumbered; 4–48 are the random pool. Additional names go in a *new* migration starting
at 49 — never edit this block once it has been pushed to hosted.

```sql
insert into pattern_names (id, name) values
  (1,  'My Very First Pattern'),
  (2,  'My Second Pattern'),
  (3,  'My Third Pattern'),
  (4,  'Yet Another One'),
  (5,  'Another Pattern'),
  (6,  'Here We Go Again'),
  (7,  'Untitled-ish'),
  (8,  'Definitely a Pattern'),
  (9,  'Just One More'),
  (10, 'Okay, Another One'),
  (11, 'Something Like This'),
  (12, 'Happy Day Pattern'),
  (13, 'Little Experiment'),
  (14, 'Work in Progress'),
  (15, 'Look What I Made'),
  (16, 'Whatever This Is'),
  (17, 'Future Masterpiece'),
  (18, 'Beep Boop'),
  (19, 'Oh Look'),
  (20, 'Brain Spark'),
  (21, 'A Fine Beginning'),
  (22, 'Hello Pattern'),
  (23, 'Final Final'),
  (24, 'New New Pattern'),
  (25, 'New Pattern'),
  (26, 'Art, Apparently'),
  (27, 'Masterpiece'),
  (28, 'Very Good Design'),
  (29, 'Great Design'),
  (30, 'Technically Art'),
  (31, 'Bold Choices'),
  (32, 'Grid-Based Thinking'),
  (33, 'Grid of Ideas'),
  (34, 'Name TBD'),
  (35, 'Naming Is Hard'),
  (36, 'Trust the Process'),
  (37, 'This Was Intentional'),
  (38, 'By Design'),
  (39, 'Grid-ish'),
  (40, 'Don''t Overthink It'),
  (41, 'Awaiting Inspiration'),
  (42, 'Creative Block'),
  (43, 'Creative Breakthrough'),
  (44, 'Square Business'),
  (45, 'Serious Squares'),
  (46, 'Pixel Party'),
  (47, 'Just Pixels'),
  (48, 'Pixel Picnic')
on conflict (id) do nothing;
```

#### 5. `updated_at` maintenance

**File**: same migration

**Intent**: Keep `updated_at` accurate without trusting callers, since FR-011 surfaces it in the
pattern list.

**Contract**: `set_updated_at()` trigger function plus a `before update` trigger on `patterns`.

### Success Criteria:

#### Automated Verification:

- Local stack starts: `npx supabase start`
- Migration applies cleanly from scratch: `npx supabase db reset`
- Linting passes: `npm run lint`

#### Manual Verification:

- `\d patterns` in Studio or psql shows every column, CHECK constraint, and both indexes
- Both tables report RLS enabled in Studio's table view
- `select * from pattern_names order by id limit 5` returns the three ordinal names first

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human before proceeding.

---

## Phase 2: pgTAP Isolation Tests

### Overview

Prove the policies do what they claim. This is the phase that justifies the foundation — a
reviewed-but-untested policy set is the failure mode F-01's risk note warns about.

### Changes Required:

#### 1. Test suite

**File**: `supabase/tests/patterns_rls.test.sql`

**Intent**: Assert isolation, cap enforcement, soft-delete invisibility, and constraint rejection
against two seeded users.

**Contract**: pgTAP file discovered by `supabase test db`. Creates two users in `auth.users`,
then switches identity per block:

```sql
-- Impersonation pattern used throughout; forgetting this runs as superuser
-- and every assertion passes vacuously.
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
```

Assertions to cover:
- User B cannot `select` user A's row (0 rows, not an error)
- User B cannot `update` user A's row (0 rows affected)
- A 4th live insert for one user raises a unique violation
- After soft-deleting slot 2, a new insert into slot 2 succeeds
- A soft-deleted row is invisible to its own owner
- `seq` cannot be reused for the same user
- **Soft-delete the highest-`seq` pattern, then create another — it succeeds and receives a
  strictly greater `seq`.** This is the regression test for the `security definer` requirement on
  the assignment trigger; with invoker rights it fails on a unique violation.
- **A soft-deleted pattern's name is never reissued to the same user.** Delete a pattern, create
  several more, and assert the retired name does not reappear. The second `security definer`
  regression test — under invoker rights the deleted row is invisible and the name recycles.
- Each CHECK rejects: width 10, height 200, 31-color palette, grid length ≠ width × height

### Success Criteria:

#### Automated Verification:

- Test suite passes: `npx supabase test db`
- Suite still passes from a clean database: `npx supabase db reset && npx supabase test db`

#### Manual Verification:

- Read the pgTAP output and confirm each assertion name appears and the count matches the
  planned assertions — a vacuously-passing suite (missing `set local role`) reports success too
- Deliberately break one policy locally, re-run, and confirm the suite fails

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Generated Types

### Overview

Derive TypeScript types from the applied schema and establish `src/types.ts` as the shared-types
home, giving the build something real to check downstream code against.

### Changes Required:

#### 1. Generated database types

**File**: `src/db/database.types.ts`

**Intent**: Machine-generated mirror of the schema; never hand-edited.

**Contract**: output of `npx supabase gen types typescript --local`. Add a header comment naming
the regeneration command.

#### 2. Shared domain types

**File**: `src/types.ts`

**Intent**: Re-export ergonomic entity and DTO aliases over the generated `Database` type, so
S-01/S-02/S-03 import domain names rather than reaching into generated internals.

**Contract**: exports `Pattern` (row), `PatternInsert`, `PatternUpdate`, `PatternListItem`
(the `name`/`width`/`height`/`updated_at` subset FR-011 needs), and `PaletteColor`.

#### 3. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Parameterize the existing client with the generated `Database` type so queries are
checked. Preserve the existing `null`-on-missing-env behavior — call sites depend on it.

**Contract**: `createServerClient<Database>(...)`; the exported signature is otherwise unchanged.

### Success Criteria:

#### Automated Verification:

- Types generate without error: `npx supabase gen types typescript --local`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- `src/types.ts` exports read naturally at a glance for someone writing S-01's create endpoint

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: Push to Hosted Project

### Overview

Apply the verified schema to the hosted Supabase project that `.dev.vars` already targets. Last
and isolated, because it is the only step touching a real environment.

### Changes Required:

#### 1. Link and push

**File**: none (CLI operations; `supabase/.temp/` is gitignored)

**Intent**: Connect the repo to the hosted project and apply the migration there.

**Contract**: `npx supabase link --project-ref <ref>` then `npx supabase db push`. The project ref
is the subdomain in `.dev.vars`'s `SUPABASE_URL`.

#### 2. Record execution

**File**: `context/deployment/deploy-plan.md`

**Intent**: Phase 0/1 checkboxes are stale — they claim `.dev.vars` doesn't exist and that no
Supabase project is set up, both of which are now false. Check off what is genuinely done so a
future agent reading the runbook isn't misled.

**Contract**: tick the completed Phase 0 Option A and Phase 1 boxes; leave untouched anything not
actually performed.

### Success Criteria:

#### Automated Verification:

- Link succeeds: `npx supabase link --project-ref <ref>`
- Push succeeds: `npx supabase db push`
- No schema drift remains: `npx supabase db diff --linked` reports no differences

#### Manual Verification:

- Hosted Studio shows both tables with RLS enabled and the expected policy list
- `npm run dev` against hosted credentials still signs in and reaches `/dashboard`
- Insert one row manually as a real signed-in user, confirm it is visible to that user and the
  row count cap behaves, then remove it

**Implementation Note**: This phase mutates a real environment. Confirm each step's output before
running the next.

---

## Testing Strategy

### Database Tests (pgTAP)

- Cross-user isolation on select and update
- Cap enforcement via unique violation on a 4th live row
- Slot reclamation after soft delete
- Soft-deleted rows invisible to their owner
- `seq` uniqueness per user
- Every CHECK constraint rejects at least one bad value

### Manual Testing Steps

1. `npx supabase db reset` — migration applies from scratch with no errors
2. `npx supabase test db` — all assertions pass
3. Break one RLS policy, re-run, confirm failure, restore
4. In Studio, sign in as a real user and confirm only that user's rows are visible
5. After Phase 4, repeat step 4 against the hosted project

### Not Covered

No application-level tests exist yet. S-01 introduces the first endpoints and should add
integration coverage at that point.

## Performance Considerations

`jsonb_array_length` reads the JSONB header, so the grid-length CHECK is effectively constant
time even at 10,000 cells. The partial index on `(user_id, updated_at desc) where deleted_at is
null` covers the S-02 list query without scanning deleted rows. At the MVP's 3-patterns-per-user
ceiling, no further tuning is warranted.

## Migration Notes

The migration is purely additive — new tables only, no alterations to existing objects — so
`wrangler rollback` of Worker code stays safe without a corresponding database rollback, per
`context/deployment/deploy-plan.md` Phase 6. Soft-deleted rows accumulate until a purge job is
built; at MVP scale this is negligible and is explicitly out of scope here.

## References

- Roadmap foundation: `context/foundation/roadmap.md` (F-01)
- Product requirements: `context/foundation/prd.md` (FR-004, FR-005, FR-006, FR-011, FR-013)
- Grid encoding decision: `notes/grid-storage-design.md`
- Deployment runbook: `context/deployment/deploy-plan.md` (Phase 0, Phase 6)
- Existing client pattern: `src/lib/supabase.ts:5`
- Existing route guard: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Local Stack + Schema Migration

#### Automated

- [ ] 1.1 Local stack starts: `npx supabase start`
- [ ] 1.2 Migration applies cleanly from scratch: `npx supabase db reset`
- [ ] 1.3 Linting passes: `npm run lint`

#### Manual

- [ ] 1.4 `\d patterns` shows every column, CHECK constraint, and both indexes
- [ ] 1.5 Both tables report RLS enabled in Studio
- [ ] 1.6 `pattern_names` returns the three ordinal names first

### Phase 2: pgTAP Isolation Tests

#### Automated

- [ ] 2.1 Test suite passes: `npx supabase test db`
- [ ] 2.2 Suite passes from a clean database: `npx supabase db reset && npx supabase test db`

#### Manual

- [ ] 2.3 Assertion names and count reviewed — suite is not vacuously passing
- [ ] 2.4 Deliberately broken policy causes the suite to fail

### Phase 3: Generated Types

#### Automated

- [ ] 3.1 Types generate without error: `npx supabase gen types typescript --local`
- [ ] 3.2 Type checking passes: `npx astro check`
- [ ] 3.3 Linting passes: `npm run lint`
- [ ] 3.4 Build passes: `npm run build`

#### Manual

- [ ] 3.5 `src/types.ts` exports read naturally for S-01 consumption

### Phase 4: Push to Hosted Project

#### Automated

- [ ] 4.1 Link succeeds: `npx supabase link --project-ref <ref>`
- [ ] 4.2 Push succeeds: `npx supabase db push`
- [ ] 4.3 No schema drift: `npx supabase db diff --linked`

#### Manual

- [ ] 4.4 Hosted Studio shows both tables with RLS enabled and expected policies
- [ ] 4.5 `npm run dev` against hosted credentials still signs in and reaches `/dashboard`
- [ ] 4.6 Manual row insert as a real user behaves correctly, then cleaned up
