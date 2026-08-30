-- F-01 patterns-schema-rls — RLS, cap, soft delete and invariant tests.
--
-- Created here rather than in a migration on purpose: migrations are pushed to
-- the hosted project, and pgTAP has no business on production. Creating it
-- outside the transaction persists it locally without entering migration history.
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = extensions, public;

select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- patterns.user_id has an FK to auth.users, so these must be real rows; a JWT
-- claim pointing at an arbitrary uuid is not enough. In this GoTrue version only
-- `id` is NOT NULL without a default, so the insert can stay minimal.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('b0000000-0000-0000-0000-00000000000b', 'b@test.local'),
  ('c0000000-0000-0000-0000-00000000000c', 'c@test.local');

-- Asserted first so a broken fixture is distinguishable from a broken policy.
select is(
  (select count(*)::int from auth.users where id = 'a0000000-0000-0000-0000-00000000000a'),
  1, 'fixture: user A exists');
select is(
  (select count(*)::int from auth.users where id = 'b0000000-0000-0000-0000-00000000000b'),
  1, 'fixture: user B exists');

-- ---------------------------------------------------------------------------
-- User A: creation, cap, immutability
-- ---------------------------------------------------------------------------
-- Every block sets claims THEN role. Skipping this runs as superuser, which
-- bypasses RLS entirely and makes the isolation assertions pass vacuously.
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

insert into patterns (user_id, width, height) values
  ('a0000000-0000-0000-0000-00000000000a', 20, 20),
  ('a0000000-0000-0000-0000-00000000000a', 30, 30),
  ('a0000000-0000-0000-0000-00000000000a', 40, 40);

select results_eq(
  $$ select slot, name from patterns order by slot $$,
  $$ values (1::smallint, 'My Very First Pattern'::text),
            (2::smallint, 'My Second Pattern'::text),
            (3::smallint, 'My Third Pattern'::text) $$,
  'slots 1-3 and ordinal names are assigned without caller input');

select is(
  (select jsonb_array_length(grid) from patterns where slot = 1),
  0, 'grid defaults to an empty array');

-- Distinct errcode, not a NOT NULL violation: S-01 must tell the 3-pattern
-- limit (FR-005) apart from a genuine fault.
select throws_ok(
  $$ insert into patterns (user_id, width, height)
     values ('a0000000-0000-0000-0000-00000000000a', 50, 50) $$,
  'KR001', null,
  'a 4th live pattern raises the slot-exhaustion error');

select is((select count(*)::int from patterns), 3,
  'row count stays at 3 after the rejected insert');

update patterns set name = 'RENAMED', seq = 99 where slot = 1;
select is((select name from patterns where slot = 1), 'My Very First Pattern',
  'update cannot rename a pattern (FR-006)');
select is((select seq from patterns where slot = 1), 1,
  'update cannot change seq');

-- ---------------------------------------------------------------------------
-- User B: cross-user isolation
-- ---------------------------------------------------------------------------
reset role;
-- Hand user B a real id belonging to user A, so the RPC check below tests
-- authorization rather than B's inability to discover the id.
create temp table _a_pattern_id as
  select id from patterns
  where user_id = 'a0000000-0000-0000-0000-00000000000a' and slot = 3;
grant select on _a_pattern_id to authenticated;

set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from patterns), 0,
  'user B cannot see user A rows');

select throws_ok(
  $$ select soft_delete_pattern((select id from _a_pattern_id)) $$,
  'KR002', null,
  'user B cannot soft delete user A pattern even with a valid id');

with upd as (update patterns set width = 55 returning 1)
select is((select count(*)::int from upd), 0,
  'user B cannot update user A rows');

insert into patterns (user_id, width, height)
values ('b0000000-0000-0000-0000-00000000000b', 25, 25);

select is((select slot from patterns), 1::smallint,
  'user B slot numbering is independent of user A');
select is((select name from patterns), 'My Very First Pattern',
  'user B naming is independent of user A');

-- ---------------------------------------------------------------------------
-- User A: soft delete
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
set local role authenticated;

-- Deleting cannot be a plain UPDATE: the SELECT policy is applied to the new row,
-- so setting deleted_at moves it out of its own visibility. This makes deleted_at
-- client-immutable and the RPC the only path.
select throws_ok(
  $$ update patterns set deleted_at = now() where slot = 2 $$,
  '42501', null,
  'a direct UPDATE cannot set deleted_at');

select lives_ok(
  $$ select soft_delete_pattern((select id from patterns where slot = 2)) $$,
  'the owner can soft delete through the RPC');

select is((select count(*)::int from patterns), 2,
  'a soft-deleted row is invisible to its own owner');

-- Regression test for the `deleted_at is null` filter on the slot query:
-- without it a deleted pattern would hold its slot forever.
insert into patterns (user_id, width, height)
values ('a0000000-0000-0000-0000-00000000000a', 60, 60);
select is((select slot from patterns where seq = 4), 2::smallint,
  'soft delete frees the slot for reuse');

-- Regression test for `security definer` on the insert trigger: seq is unique
-- across ALL rows, but the SELECT policy hides deleted ones. Under invoker
-- rights max(seq) would see only live rows and collide with the retained row.
select soft_delete_pattern((select id from patterns where seq = 4));
insert into patterns (user_id, width, height)
values ('a0000000-0000-0000-0000-00000000000a', 70, 70);
select is((select max(seq) from patterns), 5,
  'seq keeps climbing after the highest-seq pattern is deleted');

-- Second `security definer` regression: names must exclude every name ever
-- assigned. If the picker recycled one, unique (user_id, name) would have made
-- the insert above fail — so distinctness across live AND deleted rows is the
-- assertion. Checked as owner, since RLS hides the deleted rows from user A.
reset role;
select is(
  (select count(distinct name)::int from patterns
   where user_id = 'a0000000-0000-0000-0000-00000000000a'),
  (select count(*)::int from patterns
   where user_id = 'a0000000-0000-0000-0000-00000000000a'),
  'every name ever assigned to user A is distinct (retired names never recycle)');

-- ---------------------------------------------------------------------------
-- Constraints (user C, run as owner — these test CHECKs, not policies)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into patterns (user_id, width, height)
     values ('c0000000-0000-0000-0000-00000000000c', 10, 20) $$,
  '23514', null, 'width below 20 is rejected');

select throws_ok(
  $$ insert into patterns (user_id, width, height)
     values ('c0000000-0000-0000-0000-00000000000c', 20, 200) $$,
  '23514', null, 'height above 100 is rejected');

select throws_ok(
  $$ insert into patterns (user_id, width, height, palette)
     values ('c0000000-0000-0000-0000-00000000000c', 20, 20,
             (select jsonb_agg('#ffffff'::text) from generate_series(1, 31))) $$,
  '23514', null, 'a palette above 30 colors is rejected');

select lives_ok(
  $$ insert into patterns (user_id, width, height, grid)
     values ('c0000000-0000-0000-0000-00000000000c', 20, 20, '[]'::jsonb) $$,
  'an empty grid is accepted (freshly created, never saved)');

select lives_ok(
  $$ insert into patterns (user_id, width, height, grid)
     values ('c0000000-0000-0000-0000-00000000000c', 20, 20,
             (select jsonb_agg(0) from generate_series(1, 400))) $$,
  'a full width*height grid is accepted');

select throws_ok(
  $$ insert into patterns (user_id, width, height, grid)
     values ('c0000000-0000-0000-0000-00000000000c', 20, 20,
             (select jsonb_agg(0) from generate_series(1, 399))) $$,
  '23514', null, 'an off-by-one grid is rejected');

-- ---------------------------------------------------------------------------
-- Caller-supplied derived columns are discarded
-- ---------------------------------------------------------------------------
insert into patterns (user_id, width, height, seq, name)
values ('c0000000-0000-0000-0000-00000000000c', 20, 20, 99, 'HACKED');

select is(
  (select count(*)::int from patterns
   where user_id = 'c0000000-0000-0000-0000-00000000000c' and name = 'HACKED'),
  0, 'a caller-supplied name is discarded');
select is(
  (select count(*)::int from patterns
   where user_id = 'c0000000-0000-0000-0000-00000000000c' and seq = 99),
  0, 'a caller-supplied seq is discarded');

select * from finish();
rollback;
