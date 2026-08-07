-- GreenProof — close the anon side door
--
-- Found by probing the live project with the anon key before T0: the three
-- views were readable WITHOUT SIGNING IN, including `review_queue`, which is
-- `select c.*` from checkins — photo URLs, GPS, confidence, signals, phash,
-- embeddings.
--
-- Two causes, and both are defaults rather than mistakes in 0002/0006/0007:
--
--   1. Supabase grants SELECT on newly created objects in `public` to `anon`
--      and `authenticated` by default. `grant ... to authenticated` ADDS a
--      privilege; it never removes anon's. The only `revoke ... from anon` we
--      had (0002) names four tables and no views.
--
--   2. A Postgres view runs with its OWNER's rights unless told otherwise, so
--      it bypasses the RLS on the tables underneath. That is why `checkins`
--      correctly refuses anon with 401 while `review_queue` — built from
--      checkins — happily returned 200.
--
-- Nothing leaked: the database was still empty. From T0 it would not have been.

-- ---------------------------------------------------------------------------
-- 1 · anon reads nothing, anywhere
-- ---------------------------------------------------------------------------
-- Every screen in the app is behind sign-in. There is no unauthenticated
-- surface, so anon needs no privilege on anything in `public`. Revoking the
-- whole schema is safer than listing objects, because a table added later
-- inherits the default grant again and would silently reopen this hole.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- And for anything created from now on.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- 2 · authenticated loses write privileges it was never meant to have
-- ---------------------------------------------------------------------------
-- Same default-grant problem, one role along. 0002 revoked all on the four
-- sensitive tables then granted specific columns back, but `profiles`,
-- `plots`, `sponsors`, `ndvi_readings` and `groups` still carry the default
-- INSERT/UPDATE/DELETE for `authenticated`. RLS currently blocks the writes
-- (no policy permits them), but that leaves one layer where we designed two.

revoke insert, update, delete on plots, sponsors, ndvi_readings, groups
  from authenticated;

-- profiles keeps its own-row insert/update — the policies in 0002 scope it to
-- auth.uid() = id, and profile setup needs it.

-- ---------------------------------------------------------------------------
-- 3 · views respect the caller's RLS where they can
-- ---------------------------------------------------------------------------
-- Defence in depth: if a grant is ever loosened again, RLS still stands behind
-- it. Safe for these two because every table they read is already "readable to
-- authenticated using (true)".

alter view review_queue  set (security_invoker = on);
alter view plot_survival set (security_invoker = on);

-- group_leaderboard is DELIBERATELY left running as owner. It aggregates
-- across profiles, and the profiles policy is own-row-only — under
-- security_invoker a user would see one profile, so every group would report
-- its own owner's trees and the leaderboard would be wrong for everyone. The
-- view exposes no personal data: group name, tree count, survival percentage.

-- ---------------------------------------------------------------------------
-- Verify (expect: 401 for all three, signed out)
-- ---------------------------------------------------------------------------
--   curl "$URL/rest/v1/review_queue?select=*"      -H "apikey: $ANON"
--   curl "$URL/rest/v1/plot_survival?select=*"     -H "apikey: $ANON"
--   curl "$URL/rest/v1/group_leaderboard?select=*" -H "apikey: $ANON"
