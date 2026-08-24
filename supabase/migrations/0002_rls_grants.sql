-- GreenProof - row level security + column grants
-- Split from 0001 to mirror the Youth Management System migration layout.

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles       enable row level security;
alter table sponsors       enable row level security;
alter table plots          enable row level security;
alter table trees          enable row level security;
alter table checkins       enable row level security;
alter table ledger_entries enable row level security;
alter table ndvi_readings  enable row level security;
alter table payout_batches enable row level security;

-- Profiles: you manage your own.
create policy "own profile read"   on profiles for select using (auth.uid() = id);
create policy "own profile write"  on profiles for update using (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);

-- Trees, plots, sponsors, NDVI: readable by any signed-in user. The live map and
-- the public tree count are part of the pitch, so this is deliberate.
create policy "trees readable"    on trees         for select to authenticated using (true);
create policy "plots readable"    on plots         for select to authenticated using (true);
create policy "sponsors readable" on sponsors      for select to authenticated using (true);
create policy "ndvi readable"     on ndvi_readings for select to authenticated using (true);

-- You may register a tree, and only as yourself.
create policy "register tree" on trees for insert to authenticated
  with check (auth.uid() = registered_by);

-- Owners may edit their own trees' descriptive fields. Note this cannot change
-- status or confidence - those columns are not granted to clients (see below).
create policy "own tree update" on trees for update to authenticated
  using (auth.uid() = owner_id);

-- Check-ins: visible to any signed-in user; you may only submit as yourself.
create policy "checkins readable" on checkins for select to authenticated using (true);
create policy "submit checkin"    on checkins for insert to authenticated
  with check (auth.uid() = submitted_by);

-- Money is readable only by the person it belongs to.
create policy "own ledger" on ledger_entries for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Column-level grants - the part that actually stops forged verdicts
-- ---------------------------------------------------------------------------
-- RLS controls WHICH ROWS you touch. It cannot stop you writing a particular
-- COLUMN. So we revoke everything, then grant back only the columns a client is
-- allowed to write. The ML service uses service_role, which bypasses all of this.

revoke all on trees, checkins, ledger_entries, payout_batches from anon, authenticated;

grant select on trees, checkins, plots, sponsors, ndvi_readings to authenticated;
grant select on ledger_entries to authenticated;

grant insert (tag_code, species, planted_estimate, plot_id, owner_id,
              registered_by, lat, lng, heading_deg)
  on trees to authenticated;

grant update (species, planted_estimate, plot_id)
  on trees to authenticated;

grant insert (tree_id, submitted_by, wide_photo, close_photo, tag_photo,
              captured_at, lat, lng, gps_accuracy_m, heading_deg, blur_score)
  on checkins to authenticated;

-- Deliberately NOT granted to clients:
--   trees.status, trees.current_confidence
--   checkins.confidence, verdict, signals, phash, embeddings, audit_sample
-- Q&A answer: "the client can never write its own verification result."
