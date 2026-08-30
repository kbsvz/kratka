-- F-01 patterns-schema-rls
-- Creates the pattern store with owner-scoped RLS, a race-free 3-pattern cap,
-- soft delete, and system-assigned naming.
--
-- Table creation and RLS are in the same migration deliberately: splitting them
-- would leave a window where the table is world-readable through PostgREST.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Reference pool for auto-generated names. Ids 1-3 are the ordinals returned
-- for a user's first three patterns and must never be renumbered.
create table public.pattern_names (
  id   int  primary key,
  name text not null unique
);

create table public.patterns (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  seq        int         not null,   -- per-user creation ordinal, never reused
  slot       smallint    not null,   -- 1..3, reclaimed after soft delete
  name       text        not null,
  width      int         not null,
  height     int         not null,
  palette    jsonb       not null default '[]'::jsonb,
  format     text        not null default 'dense-json-v1',
  grid       jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint patterns_width_range  check (width between 20 and 100),
  constraint patterns_height_range check (height between 20 and 100),
  constraint patterns_palette_size check (jsonb_array_length(palette) <= 30),
  -- Empty array = freshly created, never saved. Any other length must match the
  -- declared dimensions exactly, so a partially-sized grid cannot be stored.
  constraint patterns_grid_length  check (
    jsonb_array_length(grid) = 0
    or jsonb_array_length(grid) = width * height
  ),
  constraint patterns_slot_range   check (slot between 1 and 3),
  constraint patterns_seq_positive check (seq >= 1),

  constraint patterns_user_seq_uniq unique (user_id, seq),
  -- Enforces FR-006's never-reuse-a-name rule structurally. Spans deleted rows
  -- deliberately: a retired name stays retired.
  constraint patterns_user_name_uniq unique (user_id, name)
);

-- Race-free 3-pattern cap. Partial so a soft-deleted row releases its slot;
-- a plain unique constraint would hold it forever and the cap would never free.
create unique index patterns_user_slot_live_uniq
  on public.patterns (user_id, slot)
  where deleted_at is null;

-- Supports the S-02 list query without scanning deleted rows.
create index patterns_user_live_idx
  on public.patterns (user_id, updated_at desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

alter table public.patterns      enable row level security;
alter table public.pattern_names enable row level security;

-- Supabase's default privileges grant ALL on new public tables to anon and
-- authenticated, so start from deny and grant back only what each role needs.
-- Patching individual privileges instead leaves the rest silently granted.
revoke all on public.patterns      from anon, authenticated;
revoke all on public.pattern_names from anon, authenticated;

-- anon gets nothing at all. RLS already denies every row (no anon policy), but a
-- lingering SELECT grant still makes the table discoverable in the GraphQL schema
-- to anyone holding the public anon key — schema disclosure without data access.
-- FR-003: an unauthenticated visitor sees only the landing page.

-- No DELETE for authenticated: deleting is an UPDATE that sets deleted_at.
-- A future purge job runs as service_role, which bypasses RLS.
grant select, insert, update on public.patterns to authenticated;

-- pattern_names stays fully revoked: RLS is on with zero policies, and the name
-- picker reads it as owner via security definer. No client ever touches it.

create policy patterns_select on public.patterns
  for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy patterns_insert on public.patterns
  for insert to authenticated
  with check (user_id = (select auth.uid()) and deleted_at is null);

-- USING gates which rows may be targeted; WITH CHECK validates the result.
-- WITH CHECK must NOT require deleted_at IS NULL, or soft delete rejects itself.
create policy patterns_update on public.patterns
  for update to authenticated
  using      (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Name pool seed
-- ---------------------------------------------------------------------------

insert into public.pattern_names (id, name) values
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

-- ---------------------------------------------------------------------------
-- Name selection
-- ---------------------------------------------------------------------------

-- security definer so it can see the caller's soft-deleted rows: names must be
-- excluded once ever assigned, and the SELECT policy hides deleted rows.
create function public.pick_pattern_name(p_user_id uuid, p_seq int)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if p_seq <= 3 then
    select pn.name into v_name
    from public.pattern_names pn
    where pn.id = p_seq;
  else
    -- Deliberately unfiltered by deleted_at: a retired name stays retired.
    select pn.name into v_name
    from public.pattern_names pn
    where pn.id > 3
      and not exists (
        select 1
        from public.patterns p
        where p.user_id = p_user_id
          and p.name = pn.name
      )
    order by random()
    limit 1;
  end if;

  -- Pool exhausted. seq is unique per user, so this is collision-free.
  return coalesce(v_name, 'My Pattern ' || p_seq);
end;
$$;

revoke all on function public.pick_pattern_name(uuid, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Insert trigger: derive slot, seq, name
-- ---------------------------------------------------------------------------

-- security definer for two distinct reasons, both invisible when wrong:
--   * seq  is unique across ALL of a user's rows, so an invoker-rights max(seq)
--          would see only live rows and collide with a retained deleted one.
--   * name must exclude every name ever assigned, or a deleted pattern's name
--          recycles onto different work.
-- Note the filters differ per column: slot considers LIVE rows only, while seq
-- and name consider ALL rows. Getting either backwards fails silently.
create function public.patterns_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot smallint;
begin
  -- Lowest free slot among LIVE rows.
  select min(s)::smallint into v_slot
  from generate_series(1, 3) as s
  where not exists (
    select 1
    from public.patterns p
    where p.user_id = new.user_id
      and p.slot = s
      and p.deleted_at is null
  );

  if v_slot is null then
    raise exception 'Pattern slot limit reached for user %', new.user_id
      using errcode = 'KR001',
            hint = 'Delete an existing pattern to free a slot (FR-005: max 3).';
  end if;

  new.slot := v_slot;

  -- ALL rows, deleted included: seq must never repeat for a user.
  select coalesce(max(p.seq), 0) + 1 into new.seq
  from public.patterns p
  where p.user_id = new.user_id;

  -- Unconditional: any caller-supplied name is discarded (FR-006).
  new.name := public.pick_pattern_name(new.user_id, new.seq);

  return new;
end;
$$;

-- Supabase grants EXECUTE on public functions to anon/authenticated by default,
-- which exposes this security definer function at /rest/v1/rpc/. Revoking is
-- safe: trigger permissions are checked when the trigger is created, not when it
-- fires, so the trigger keeps working without any EXECUTE grant.
revoke all on function public.patterns_before_insert() from public, anon, authenticated;

create trigger patterns_before_insert
  before insert on public.patterns
  for each row execute function public.patterns_before_insert();

-- ---------------------------------------------------------------------------
-- Soft delete (FR-013)
-- ---------------------------------------------------------------------------

-- Deleting CANNOT be a plain UPDATE from the client. PostgreSQL applies the
-- SELECT policy's USING clause to the *new* row during an UPDATE, and our SELECT
-- policy requires `deleted_at is null` -- so setting deleted_at moves the row out
-- of its own visibility and Postgres rejects it with an RLS violation.
--
-- That is a feature, not a workaround: it means deleted_at is immutable from the
-- client, and this function is the single audited path to deletion. RLS does not
-- apply inside a security definer function, so the `user_id = v_uid` predicate
-- below is doing the authorization -- treat it as load-bearing.
create function public.soft_delete_pattern(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated'
      using errcode = 'KR003';
  end if;

  update public.patterns
     set deleted_at = now()
   where id = p_id
     and user_id = v_uid      -- authorization; RLS is bypassed in here
     and deleted_at is null;

  -- Same error whether the pattern belongs to someone else, never existed, or is
  -- already deleted: do not leak which.
  if not found then
    raise exception 'Pattern not found'
      using errcode = 'KR002';
  end if;
end;
$$;

revoke all on function public.soft_delete_pattern(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_pattern(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Update trigger: bump updated_at, pin system-assigned columns
-- ---------------------------------------------------------------------------

-- Restores rather than raises: a client echoing the full row back on save would
-- otherwise fail every update for resending values it never changed. Pinning
-- keeps that flow working while making rename impossible (FR-006).
-- Fires on soft delete too, so a deleted row's updated_at reflects the deletion;
-- deleted_at remains the authoritative timestamp for when it happened.
create function public.patterns_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id    := old.user_id;
  new.seq        := old.seq;
  new.slot       := old.slot;
  new.name       := old.name;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- Not security definer, so lower stakes than the insert trigger, but there is no
-- reason for it to be reachable over RPC either.
revoke all on function public.patterns_before_update() from public, anon, authenticated;

create trigger patterns_before_update
  before update on public.patterns
  for each row execute function public.patterns_before_update();
