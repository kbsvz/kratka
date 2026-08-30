# Patterns Schema + Owner-Scoped RLS — Implementation Plan

## Overview

Create the `patterns` table and a seeded `pattern_names` lookup pool in Supabase, protected by
owner-scoped Row-Level Security, with a race-free 3-pattern cap, soft delete, and database-level
invariants that make a partially-sized grid impossible to store. Prove isolation with pgTAP, then
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
- A row's `grid` is either empty (never saved) or exactly `width × height` long — no partially
  sized grid can be stored.
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

**An empty `grid` is a legal state, and downstream slices must handle it.** `grid` defaults to
`'[]'` and the length CHECK admits either 0 or exactly `width × height`. This keeps pattern
creation to a handful of scalars rather than a 10,000-element zero array, but it means a row can
exist whose grid is not yet dimensioned. S-01 must treat length 0 as "all cells empty" when
opening a never-saved pattern, and S-03's print view must not assume the array is populated —
an unguarded index into an empty array is the failure mode here. The invariant that survives is
narrower than a strict equality: a grid is either absent or exactly right, never partially wrong.

**Soft delete must go through an RPC, not an UPDATE — discovered during Phase 2.** PostgreSQL
applies the SELECT policy's `USING` clause to the *new* row during an `UPDATE`. Our SELECT policy
requires `deleted_at is null`, so setting `deleted_at` moves the row out of its own visibility and
Postgres rejects the statement with `42501`. The two review decisions — "RLS filters out deleted
rows" and "deleting is an UPDATE that sets deleted_at" — are mutually exclusive.

Resolved with `soft_delete_pattern(p_id uuid)`, a `security definer` function granted to
`authenticated` only. RLS does not apply inside it, so its `user_id = (select auth.uid())`
predicate **is** the authorization — treat that line as load-bearing. It raises `KR002` for a
missing, already-deleted, or someone-else's pattern without distinguishing them.

The upside of the collision: `deleted_at` is now genuinely immutable from the client, so the RPC
is the single audited path to deletion. Two pgTAP assertions pin this — a direct UPDATE is
rejected, and user B cannot delete user A's pattern even when handed a valid id.

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

**Supabase's default privileges grant ALL on new `public` tables and functions to `anon` and
`authenticated` — start from deny, not from patching.** This tripped two separate Supabase
advisors during implementation, both from the same root cause:

- *Public Can Execute SECURITY DEFINER Function* — the trigger functions were executable by
  `anon`. Revoking is safe: trigger permissions are checked when the trigger is *created*, not
  when it fires, so triggers keep working with no EXECUTE grant at all.
- *Public Can See Object in GraphQL Schema* — `anon` retained SELECT on `patterns`, making the
  table discoverable to anyone holding the public anon key. RLS still denied every row (no anon
  policy), so this was schema disclosure, not data disclosure — but FR-003 says an
  unauthenticated visitor sees only the landing page, and a discoverable table contradicts that.

The migration therefore issues `revoke all ... from anon, authenticated` on both tables and all
three functions first, then grants back exactly `select, insert, update on patterns to
authenticated`. Revoking individual privileges (`revoke delete ...`) leaves the rest silently
granted — that is precisely how the second advisor slipped through the first fix.

Verify with `has_table_privilege` / `has_function_privilege` rather than reading the migration,
and re-check the Advisors tab after the Phase 4 hosted push.

**Advisor 0027 ("Signed-In Users Can See Object in GraphQL Schema") is expected — do not fix it.**
It fires because `authenticated` can SELECT `patterns`, which is required: table-level grants are
checked *before* RLS, so without the grant the `patterns_select` policy never evaluates and every
downstream slice gets `permission denied for table patterns`. Signed-in users discovering that
`patterns` exists is correct; RLS keeps them to their own rows. Its sibling 0026 (the `anon`
variant) *was* worth fixing — signed-out visitors should discover nothing (FR-003). Expect 0027
to reappear on the hosted project after Phase 4; dismiss it there too.

Noted but not acted on: `graphql_public` is an exposed schema and `pg_graphql` is installed, yet
kratka uses no GraphQL anywhere. Dropping it would remove this advisor class entirely, but that's
a project-wide API config change outside this foundation's scope.

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
  grid       jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint patterns_width_range   check (width  between 20 and 100),
  constraint patterns_height_range  check (height between 20 and 100),
  constraint patterns_palette_size  check (jsonb_array_length(palette) <= 30),
  -- Empty array = freshly created, never saved. Any other length must match
  -- the declared dimensions exactly.
  constraint patterns_grid_length   check (
    jsonb_array_length(grid) = 0 or jsonb_array_length(grid) = width * height
  ),
  constraint patterns_slot_range    check (slot between 1 and 3),
  constraint patterns_seq_positive  check (seq >= 1),
  constraint patterns_user_seq_uniq unique (user_id, seq),
  -- Enforces FR-006's never-reuse-a-name rule structurally. Spans deleted rows
  -- deliberately: a retired name stays retired.
  constraint patterns_user_name_uniq unique (user_id, name)
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

**Intent**: Enable RLS on both tables and grant per-operation, per-role access. Two deliberate
omissions: no `DELETE` policy (hard deletes are unreachable from the client; a future purge job
runs as `service_role`, which bypasses RLS), and no policy at all on `pattern_names` (RLS enabled
with zero policies denies every client read, which is correct while the only reader is the
`security definer` picker).

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

-- No policy on pattern_names: RLS is enabled with zero policies, which denies all
-- client access. The name picker reads it as owner via security definer, and no
-- product surface exposes the pool. Add a select policy only when one does.
```

#### 4. Seed data, seq assignment, and name picker

**File**: same migration

**Intent**: Seed the name pool with ids 1–3 as the ordinal names plus further names for when the
cap lifts, then derive `slot`, `seq`, and `name` automatically on insert. With `palette` and
`grid` both defaulting to `'[]'`, the MVP create request carries **`width` and `height` only** —
every other column is either defaulted or server-derived.

**Contract**: a `before insert` trigger on `patterns`, `security definer`, that sets `NEW.slot`,
`NEW.seq`, and `NEW.name` **unconditionally** — any value supplied by the caller is discarded,
not respected.

**The three derived columns need different row filters, and getting one wrong is silent.**
Because `security definer` bypasses RLS, the trigger sees every row for the user — so each query
must state its own scope explicitly:

| Column | Rows to consider | Rule |
| --- | --- | --- |
| `slot` | **live only** (`deleted_at is null`) | lowest unused value in 1–3 |
| `seq`  | **all rows**, deleted included | `max(seq) + 1` |
| `name` | **all rows**, deleted included | random pool entry never yet assigned |

Omitting `deleted_at is null` from the slot query makes deleted patterns hold their slots
forever, so the cap never frees up. Adding it to the `seq` or name query re-creates the exact
collisions those two are `security definer` to avoid. Same trigger, opposite filters.

**Slot exhaustion**: when all three live slots are taken, the trigger raises a distinct,
catchable error rather than leaving `slot` null and surfacing a `NOT NULL` violation — S-01 needs
to tell "you're at your 3-pattern limit" (FR-005's disabled-with-explanation state) apart from a
genuine fault. The unique index remains the correctness backstop: under concurrent creates two
transactions can both compute the same free slot, and the loser gets a unique violation the
caller retries once. Trigger for ergonomics, index for correctness.

This is deliberate, not defensive coding. Per FR-006 the name is always system-assigned and no
product surface accepts one as input; the MVP create request carries `width` and `height` only.
Making assignment unconditional means S-01 physically cannot get naming wrong regardless of how
its endpoint is written — a mass-assigning `insert({...body, user_id})` is a common shape, and
under conditional assignment a stray `name` in the request body would flow straight through.
It also keeps this consistent with how every other guarantee in this migration is enforced:
structurally, not by remembering to be careful at the call site.

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

`unique (user_id, name)` is the structural backstop for that rule — the trigger's SELECT chooses
a free name, the constraint guarantees it. It also closes the concurrency hole the SELECT alone
leaves open: two simultaneous creates for one user could otherwise both pick the same unused
name, and the loser now fails loudly instead of silently duplicating. Every name source satisfies
it by construction — ordinals 1–3 map to unique `seq` values, pool names are excluded once
assigned, and the `'My Pattern ' || seq` fallback embeds a per-user-unique `seq`.

Because names are consumed monotonically and never returned to the pool, a user with a long
delete-and-recreate history can exhaust it. Fall back to `'My Pattern ' || seq`, which is itself
collision-free since `seq` is unique per user. With 56 pool names seeded, exhaustion requires 59
lifetime creations by one user — unreachable in practice at MVP scale.

Seed data, verbatim. Ids 1–3 are the ordinals returned for a user's first three patterns and must
never be renumbered; 4–59 are the random pool. Additional names go in a *new* migration starting
at 60 — never edit this block once it has been pushed to hosted.

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
  (48, 'Pixel Picnic'),
  (49, 'My Best Work Yet'),
  (50, 'Another Masterpiece'),
  (51, 'Working Title'),
  (52, 'Call It Something'),
  (53, 'Placeholder Name'),
  (54, 'Ta-da'),
  (55, 'Creative Spark'),
  (56, 'Creative Moment'),
  (57, 'Creative Flow'),
  (58, 'Creative Bloom'),
  (59, 'Creative Boost')
on conflict (id) do nothing;
```

#### 5. Update guard and `updated_at` maintenance

**File**: same migration

**Intent**: Keep `updated_at` accurate without trusting callers (FR-011 surfaces it in the pattern
list), and make the system-assigned identity columns immutable so FR-006's "cannot modify it
afterwards" holds at the database rather than by endpoint discipline.

**Contract**: one `before update` trigger on `patterns` that sets `NEW.updated_at := now()` and
restores `NEW.seq := OLD.seq`, `NEW.name := OLD.name`, `NEW.user_id := OLD.user_id`.

Restoring rather than raising an exception is deliberate: a client that sends the full row back
on save — the natural shape for S-01's Save button — would otherwise fail on every update simply
for echoing values it never changed. Silently pinning them keeps that flow working while making
rename impossible. `user_id` is pinned for the same reason it matters most: the UPDATE policy's
`WITH CHECK` already prevents reassigning a row to another user, but pinning removes the question
entirely.

Note this trigger fires on soft delete too, so a deleted row's `updated_at` reflects the deletion
time — `deleted_at` remains the authoritative timestamp for when it happened.

### Success Criteria:

#### Automated Verification:

- Local stack starts: `npx supabase start`
- Migration applies cleanly from scratch: `npx supabase db reset`

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

**File**: `supabase/tests/database/patterns_rls.test.sql`

**Intent**: Assert isolation, cap enforcement, soft-delete invisibility, and constraint rejection
against two seeded users.

**Contract**: pgTAP file. `supabase test db` defaults to the `supabase/tests` directory and
recurses, so the `database/` subdirectory — Supabase's documented convention — is discovered
automatically; no path argument is needed.

The extension is created **in the test file, not in a migration**. Migrations are pushed to the
hosted project in Phase 4, and pgTAP has no business on production. Creating it outside the
transaction persists it locally while keeping it out of the migration history:

```sql
create extension if not exists pgtap with schema extensions;

begin;
select plan(<N>);          -- exact assertion count; pgTAP fails the run if it disagrees

-- ... fixtures and assertions ...

select * from finish();
rollback;                  -- fixtures never persist; the suite is re-runnable
```

**Fixtures.** `patterns.user_id` carries an FK to `auth.users(id)`, so the suite needs two real
rows there — setting a JWT claim to an arbitrary uuid is not enough. Insert them before switching
roles, while still running unrestricted:

```sql
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '<uuid-a>', 'authenticated',
        'authenticated', 'a@test.local', '', now(), now()),
       ('00000000-0000-0000-0000-000000000000', '<uuid-b>', 'authenticated',
        'authenticated', 'b@test.local', '', now(), now());
```

`instance_id`, `aud`, and `role` are NOT NULL without defaults — omitting them is the usual
first failure. Confirm the column set against the local schema (`\d auth.users`) before writing
the file, since GoTrue's table has changed shape across Supabase versions.

**Assert the fixtures first.** The suite's opening assertions should confirm both users exist.
Without that, a fixture problem and a policy problem produce similarly opaque failures, and the
first thing you'd doubt is the policy — which is the one thing this suite exists to trust.

Identity is switched per assertion block. Forgetting this runs as superuser, which bypasses RLS
and makes every isolation assertion pass vacuously:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
```

Use `reset role;` between blocks when fixture setup needs to run unrestricted.

Assertions to cover:
- User B cannot `select` user A's row (0 rows, not an error)
- User B cannot `update` user A's row (0 rows affected)
- A 4th live insert for one user raises the trigger's distinct slot-exhaustion error (not a
  `NOT NULL` violation), and the row count stays at 3
- Inserts land in slots 1, 2, 3 in order without the caller specifying one
- After soft-deleting the pattern in slot 2, the next insert reclaims slot 2 — the regression test
  for the `deleted_at is null` filter on the slot query
- A soft-deleted row is invisible to its own owner
- `seq` cannot be reused for the same user
- **Soft-delete the highest-`seq` pattern, then create another — it succeeds and receives a
  strictly greater `seq`.** This is the regression test for the `security definer` requirement on
  the assignment trigger; with invoker rights it fails on a unique violation.
- **A soft-deleted pattern's name is never reissued to the same user.** Delete a pattern, create
  several more, and assert the retired name does not reappear. The second `security definer`
  regression test — under invoker rights the deleted row is invisible and the name recycles.
- Each CHECK rejects: width 10, height 200, 31-color palette
- Grid length CHECK: an empty array is **accepted** (freshly created), a full `width × height`
  array is accepted, and any other length — including off-by-one — is rejected
- An insert supplying `seq` and `name` has both values discarded and replaced by the trigger
- An update attempting to change `name` or `seq` leaves the stored values unchanged

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

**File**: `src/lib/database.types.ts`

**Intent**: Machine-generated mirror of the schema; never hand-edited.

**Contract**: output of `npx supabase gen types typescript --local`. Add a header comment naming
the regeneration command.

#### 2. Shared domain types

**File**: `src/types.ts`

**Intent**: Re-export ergonomic entity and DTO aliases over the generated `Database` type, so
S-01/S-02/S-03 import domain names rather than reaching into generated internals.

**Contract**: exports `Pattern` (the row), `PatternCreate`, `PatternUpdate`, `PatternListItem`
(the subset FR-011 renders), `PaletteColor`, `PatternPalette`, and `PatternGrid`.

`PatternCreate` and `PatternUpdate` are deliberately narrower than the generated `Insert`/`Update`
shapes, which describe columns but not the triggers wrapped around them. The generator marks a
column optional only when it is nullable or carries a `DEFAULT`; it does not read triggers. So the
generated `Insert` reports `name`, `seq` and `slot` as *required* when in truth the BEFORE INSERT
trigger discards whatever is supplied, and the generated `Update` offers columns the BEFORE UPDATE
trigger pins. The raw shapes are not re-exported — `Database[...]["Insert"]` remains reachable
directly for the rare caller that wants it.

#### 3. Exclude the generated file from formatters

**File**: `eslint.config.js`, `.prettierignore`

**Intent**: Keep the generated types out of ESLint and Prettier. It arrives unformatted and
produces ~126 `prettier/prettier` errors; formatting it would be reverted by the next
`supabase gen types` run, so every schema change would carry a formatting diff.

**Contract**: an `{ ignores: ["src/lib/database.types.ts"] }` entry in `eslint.config.js` (note
the config resolves ignores through `includeIgnoreFile(gitignorePath)`, so `.gitignore` cannot be
used — the file must stay committed for CI to type-check and build without a database), plus a
`.prettierignore` carrying the same path so `npm run format` leaves it alone. The file is still
fully type-checked by `tsc` via `astro check`.

#### 4. Typed Supabase client

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

- [x] 1.1 Local stack starts: `npx supabase start` — b726a4a
- [x] 1.2 Migration applies cleanly from scratch: `npx supabase db reset` — b726a4a

#### Manual

- [x] 1.3 `\d patterns` shows every column, CHECK constraint, and both indexes — b726a4a
- [x] 1.4 Both tables report RLS enabled in Studio — b726a4a
- [x] 1.5 `pattern_names` returns the three ordinal names first — b726a4a

### Phase 2: pgTAP Isolation Tests

#### Automated

- [x] 2.1 Test suite passes: `npx supabase test db` — d8ce765
- [x] 2.2 Suite passes from a clean database: `npx supabase db reset && npx supabase test db` — d8ce765

#### Manual

- [x] 2.3 Assertion names and count reviewed — suite is not vacuously passing — d8ce765
- [x] 2.4 Deliberately broken policy causes the suite to fail — d8ce765

### Phase 3: Generated Types

#### Automated

- [x] 3.1 Types generate without error: `npx supabase gen types typescript --local` — fa76eed
- [x] 3.2 Type checking passes: `npx astro check` — fa76eed
- [x] 3.3 Linting passes: `npm run lint` — fa76eed
- [x] 3.4 Build passes: `npm run build` — fa76eed

#### Manual

- [x] 3.5 `src/types.ts` exports read naturally for S-01 consumption — fa76eed

### Phase 4: Push to Hosted Project

#### Automated

- [x] 4.1 Link succeeds: `npx supabase link --project-ref <ref>` — 0be70a2
- [x] 4.2 Push succeeds: `npx supabase db push` — 0be70a2
- [x] 4.3 No schema drift: `npx supabase db diff --linked` — 0be70a2

#### Manual

- [x] 4.4 Hosted Studio shows both tables with RLS enabled and expected policies — 0be70a2
- [x] 4.5 `npm run dev` against hosted credentials still signs in and reaches `/dashboard` — 0be70a2
- [x] 4.6 Manual row insert as a real user behaves correctly, then cleaned up — 0be70a2
