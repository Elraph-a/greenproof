-- GreenProof - earnings and leaderboards

-- ---------------------------------------------------------------------------
-- Groups - schools, churches, communities
-- ---------------------------------------------------------------------------
-- The leaderboard was promised in the submitted description, and competition
-- between institutions is the cheapest growth mechanism we have: one church
-- recruits its whole congregation for free.

create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'community',  -- school | church | community
  created_at  timestamptz not null default now()
);

alter table profiles add column if not exists group_id uuid references groups on delete set null;

alter table groups enable row level security;
create policy "groups readable" on groups for select to authenticated using (true);
grant select on groups to authenticated;

-- ---------------------------------------------------------------------------
-- Accruing money
-- ---------------------------------------------------------------------------
-- Written by a trigger, never by a client. ledger_entries has no insert grant
-- for `authenticated`, so the ONLY way money appears is a verified check-in.
-- That is the property worth stating on stage: you cannot pay yourself, you can
-- only pass verification.

create or replace function public.accrue_on_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_prior int;
begin
  if new.verdict is distinct from 'verified' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.verdict = 'verified' then
    return new;   -- already paid for this visit
  end if;

  select owner_id into v_owner from trees where id = new.tree_id;
  if v_owner is null then
    return new;
  end if;

  -- One payment per verified visit, and never twice for the same check-in.
  if exists (select 1 from ledger_entries where tree_id = new.tree_id
              and reason = 'checkin_' || new.id::text) then
    return new;
  end if;

  select count(*) into v_prior
    from checkins where tree_id = new.tree_id and verdict = 'verified' and id <> new.id;

  insert into ledger_entries (user_id, tree_id, amount_ghs, reason, status)
  values (
    v_owner,
    new.tree_id,
    -- Establishment payment is larger, then a smaller survival payment per
    -- visit. Deliberately back-loaded overall: paying most of the money on
    -- planting day is what makes plant-and-abandon rational, and it is the
    -- failure mode of nearly every reforestation grant.
    case when v_prior = 0 then 5.00 else 2.00 end,
    'checkin_' || new.id::text,
    'accrued'
  );

  return new;
end;
$$;

drop trigger if exists on_checkin_verified on checkins;
create trigger on_checkin_verified
  after insert or update of verdict on checkins
  for each row execute function public.accrue_on_verified();

-- ---------------------------------------------------------------------------
-- Leaderboard
-- ---------------------------------------------------------------------------
-- Survival rate, not just tree count. Counting trees alone rewards planting
-- and ignores keeping alive, which is the entire problem the product exists to
-- fix - a leaderboard that rewarded volume would actively work against us.

create or replace view group_leaderboard as
  select g.id,
         g.name,
         g.kind,
         count(distinct t.id)                                            as trees,
         count(distinct t.id) filter (where t.status = 'alive')          as alive,
         round(
           100.0 * count(distinct t.id) filter (where t.status = 'alive')
                 / nullif(count(distinct t.id), 0)
         , 1)                                                            as survival_pct
    from groups g
    left join profiles p on p.group_id = g.id
    left join trees t    on t.owner_id = p.id
   group by g.id, g.name, g.kind;

grant select on group_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- Sponsor dashboard aggregates
-- ---------------------------------------------------------------------------

create or replace view plot_survival as
  select p.id   as plot_id,
         p.name as plot_name,
         p.sponsor_id,
         count(t.id)                                        as trees,
         count(t.id) filter (where t.status = 'alive')       as alive,
         count(t.id) filter (where t.status = 'flagged')     as flagged,
         round(avg(t.current_confidence)::numeric, 1)        as mean_confidence
    from plots p
    left join trees t on t.plot_id = p.id
   group by p.id, p.name, p.sponsor_id;

grant select on plot_survival to authenticated;
