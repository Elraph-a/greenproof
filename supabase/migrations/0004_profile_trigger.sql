-- GreenProof - auto-create a profile row for every new auth user
--
-- WHY THIS EXISTS AS A TRIGGER AND NOT CLIENT CODE:
-- trees.owner_id and trees.registered_by both reference profiles with
-- `on delete restrict`, so a tree cannot be inserted until a profile row exists.
-- If profile creation lived only in the client it could silently fail (bad
-- signal, closed tab, race on first load) and the failure would surface as a
-- foreign-key error *in the field, at T0, with 40 trees to register*.
--
-- A trigger makes it impossible to have an auth user without a profile.
-- The client also upserts on load, which is harmless and covers users created
-- before this migration ran.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer          -- runs as owner: the trigger must bypass RLS on profiles
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Backfill anyone who signed up before this ran
-- ---------------------------------------------------------------------------
insert into public.profiles (id)
select u.id from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
