-- GreenProof - the sponsor role, and a privilege-escalation fix
--
-- ===========================================================================
-- 1 · profiles.role must not be client-writable   ** SECURITY FIX **
-- ===========================================================================
-- Found while adding the role picker. `review_checkin` (migration 0006) is the
-- one doorway that can write a verdict, and it authorises the caller with:
--
--     select role into v_role from profiles where id = auth.uid();
--     if v_role is distinct from 'reviewer' then raise ...
--
-- But `profiles` still carried Supabase's DEFAULT table-wide grants for
-- `authenticated`, plus the "own profile write" RLS policy from 0002. Together
-- those let any signed-in user run:
--
--     update profiles set role = 'reviewer' where id = auth.uid();
--
-- ...and then decide verdicts - including on their own check-ins. That defeats
-- the product's central claim that a client can never write its own
-- verification result. RLS was never the hole; the column grant was.
--
-- Same pattern as 0002: revoke the table-wide privilege, grant back only the
-- columns a client may actually touch. `role` is not among them.

revoke insert, update on profiles from authenticated;

grant insert (id, full_name, phone, story, photo_path, group_id)
  on profiles to authenticated;

grant update (full_name, phone, story, photo_path, group_id)
  on profiles to authenticated;

-- Sign-up still needs to CHOOSE between planting and sponsoring, so one narrow
-- doorway is opened for exactly that - and it can only ever produce the two
-- self-service roles. 'reviewer' and 'institution' stay administrative, set by
-- someone with database access.
create or replace function public.set_my_role(p_role user_role)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row profiles;
begin
  if p_role not in ('planter', 'sponsor') then
    raise exception 'You may only choose planter or sponsor'
      using errcode = '42501';
  end if;

  update profiles
     set role = p_role
   where id = auth.uid()
  returning * into v_row;

  if v_row.id is null then
    raise exception 'No profile for the current user';
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_my_role(user_role) from public, anon;
grant execute on function public.set_my_role(user_role) to authenticated;

-- ===========================================================================
-- 2 · Sponsorships
-- ===========================================================================
-- A sponsorship is a COMMITMENT to fund n trees in a plot. It is deliberately
-- not the same thing as money paid out:
--
--   ledger_entries  - what a planter EARNED. Trigger-written only; no client
--                     can insert. You cannot pay yourself.
--   sponsorships    - what a sponsor PLEDGED. Client-written, because it is
--                     the sponsor's own declaration about their own money.
--
-- Keeping them apart is what lets the sponsor screen show "committed" and
-- "paid out" as two different numbers, which is the honest presentation: a
-- pledge is not evidence a tree survived.

create table if not exists sponsorships (
  id              uuid primary key default gen_random_uuid(),
  sponsor_id      uuid not null references profiles on delete cascade,
  plot_id         uuid references plots on delete set null,
  trees_committed int  not null check (trees_committed > 0),
  amount_ghs      numeric(10,2) not null check (amount_ghs >= 0),
  status          text not null default 'pledged',   -- pledged | paid
  momo_ref        text,
  created_at      timestamptz not null default now()
);

create index if not exists sponsorships_sponsor_idx on sponsorships (sponsor_id);

alter table sponsorships enable row level security;

create policy "own sponsorships read" on sponsorships for select to authenticated
  using (auth.uid() = sponsor_id);

create policy "create own sponsorship" on sponsorships for insert to authenticated
  with check (auth.uid() = sponsor_id);

revoke all on sponsorships from anon, authenticated;
grant select on sponsorships to authenticated;
-- `status` and `momo_ref` are NOT grantable to the client: marking your own
-- pledge as paid is a claim about money, and it belongs to whatever settles the
-- payment, not to the browser.
grant insert (sponsor_id, plot_id, trees_committed, amount_ghs)
  on sponsorships to authenticated;

-- ===========================================================================
-- 3 · The pilot plot
-- ===========================================================================
-- Trees registered at T0 have no plot. Rather than change the registration flow
-- on the morning of a field day, a single default plot exists so the sponsor
-- screens have something real to point at.

insert into plots (id, name)
values ('00000000-0000-4000-9000-000000000001', 'University of Ghana, Legon')
on conflict (id) do nothing;

-- ===========================================================================
-- 4 · Keep anon locked out (0008 revoked the schema; this is the new table)
-- ===========================================================================
revoke all on sponsorships from anon;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   As a signed-in user, this must now FAIL:
--     update profiles set role = 'reviewer' where id = auth.uid();
--   and this must succeed:
--     select set_my_role('sponsor');
--   and this must fail:
--     select set_my_role('reviewer');
