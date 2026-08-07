-- GreenProof — database schema
-- Run this in the Supabase SQL Editor on a fresh project.
--
-- KEY SECURITY IDEA: the app's anon key is public (it ships inside the browser).
-- So a user could try to insert a check-in that already says "verified".
-- We stop that with COLUMN-LEVEL GRANTS: the client is simply not granted write
-- access to confidence / verdict / signals. Only the ML service (service_role)
-- can write those. Rows arrive as 'pending' and fail safe.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists postgis;   -- plot polygons
create extension if not exists vector;    -- pgvector: image fingerprints

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type tree_status as enum ('pending', 'alive', 'flagged', 'dead');
create type checkin_verdict as enum ('pending', 'verified', 'review', 'flagged');
create type user_role as enum ('planter', 'institution', 'sponsor', 'reviewer');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
-- Supabase already gives us auth.users. This holds our own fields.
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text,
  phone       text,                       -- for MoMo payout later
  role        user_role not null default 'planter',
  -- "Planter story" (borrowed from EcoMatcher) — a name and a face attached to
  -- each tree makes the sponsor dashboard far stronger on stage.
  story       text,
  photo_path  text,
  created_at  timestamptz not null default now()
);

create table sponsors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_path   text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Places and trees
-- ---------------------------------------------------------------------------
create table plots (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  boundary    geography(Polygon, 4326),   -- used for the satellite NDVI check
  sponsor_id  uuid references sponsors on delete set null,
  created_at  timestamptz not null default now()
);

create table trees (
  id                uuid primary key default gen_random_uuid(),
  -- Optional. A tag is a convenience for finding the tree in the field, never
  -- the identity: tags fall off, and if a tag WERE the identity then moving one
  -- to a healthier tree would steal that tree. Identity = GPS + position +
  -- photo history.
  tag_code          text unique,
  species           text,
  planted_estimate  date,
  plot_id           uuid references plots on delete set null,

  -- Ownership is the whole product, so it is a first-class column.
  owner_id          uuid not null references profiles on delete restrict,
  registered_by     uuid not null references profiles on delete restrict,

  lat               double precision not null,
  lng               double precision not null,

  -- Compass bearing the phone faced at registration, 0-360°. On the next visit
  -- the app says "stand here, face this way", so the framing is reproduced.
  -- Consistent framing is what makes image matching work.
  heading_deg       double precision,

  location          geography(Point, 4326)
                      generated always as (
                        st_setsrid(st_makepoint(lng, lat), 4326)::geography
                      ) stored,

  status            tree_status not null default 'pending',
  current_confidence smallint,                 -- 0-100, written by ML service
  created_at        timestamptz not null default now()
);

create index trees_location_idx on trees using gist (location);
create index trees_owner_idx on trees (owner_id);

-- ---------------------------------------------------------------------------
-- Check-ins — one row per visit to a tree
-- ---------------------------------------------------------------------------
create table checkins (
  id                uuid primary key default gen_random_uuid(),
  tree_id           uuid not null references trees on delete cascade,
  submitted_by      uuid not null references profiles on delete restrict,

  -- Two scored photos. If a numbered tag is ever in frame it must NOT be in
  -- these: the model would match the card rather than the tree and silently
  -- inflate our accuracy. tag_photo is optional and is never scored.
  wide_photo        text not null,
  close_photo       text not null,
  tag_photo         text,

  captured_at       timestamptz not null,
  server_received_at timestamptz not null default now(),

  lat               double precision not null,
  lng               double precision not null,
  gps_accuracy_m    double precision,
  heading_deg       double precision,   -- compass bearing, compared to the tree's

  -- Quality score measured in the browser before upload; blurry photos quietly
  -- ruin the accuracy numbers, so we record it rather than discard silently.
  blur_score        double precision,

  -- ===== Written ONLY by the ML service (service_role). See grants below. =====
  wide_embedding    vector(384),
  close_embedding   vector(384),
  phash             text,
  confidence        smallint,
  verdict           checkin_verdict not null default 'pending',
  signals           jsonb,          -- per-signal breakdown; never collapse this
  audit_sample      boolean not null default false,  -- random QA of auto-approvals
  reviewed_by       uuid references profiles on delete set null,
  reviewed_at       timestamptz
);

create index checkins_tree_idx on checkins (tree_id, captured_at desc);
create index checkins_verdict_idx on checkins (verdict);
create index checkins_phash_idx on checkins (phash);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------
create table payout_batches (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  status        text not null default 'pending',
  provider_ref  text
);

create table ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles on delete restrict,
  tree_id     uuid references trees on delete set null,
  amount_ghs  numeric(10,2) not null,
  reason      text not null,        -- e.g. 'establishment_4wk', 'survival_6mo'
  status      text not null default 'accrued',   -- accrued | batched | paid
  batch_id    uuid references payout_batches on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Satellite
-- ---------------------------------------------------------------------------
-- Plot-level only. Sentinel-2 is 10m per pixel, so 40 young trees do not move
-- it. This proves the pipeline; it becomes real evidence at grove scale.
create table ndvi_readings (
  id          uuid primary key default gen_random_uuid(),
  plot_id     uuid not null references plots on delete cascade,
  taken_on    date not null,
  mean_ndvi   double precision not null,
  unique (plot_id, taken_on)
);
