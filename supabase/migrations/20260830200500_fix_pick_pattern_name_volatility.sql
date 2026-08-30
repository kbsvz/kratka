-- pick_pattern_name was declared `stable`, but it calls random() and so can
-- return different results for identical inputs within one statement -- the
-- definition of VOLATILE. PostgreSQL does not enforce volatility labels, and no
-- current caller is affected (verified: a multi-row INSERT still assigns distinct
-- names, and repeated calls in one query are not collapsed). This corrects the
-- metadata so a future query shape cannot rely on STABLE semantics that do not hold.
--
-- A new migration rather than an edit: the original has already been applied to
-- the hosted project, so editing it in place would create drift.
create or replace function public.pick_pattern_name(p_user_id uuid, p_seq int)
returns text
language plpgsql
volatile
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

-- CREATE OR REPLACE preserves existing privileges, but re-assert them so this
-- migration is correct even if applied where they differ.
revoke all on function public.pick_pattern_name(uuid, int) from public, anon, authenticated;
