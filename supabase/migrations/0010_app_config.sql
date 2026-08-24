-- GreenProof - runtime configuration
--
-- WHY THIS TABLE EXISTS
-- Vite inlines environment variables at BUILD time, so `VITE_ML_URL` cannot be
-- changed without rebuilding and redeploying the frontend. That is tolerable
-- for a permanent host and unworkable for a tunnelled service, whose hostname
-- changes whenever the tunnel restarts - including on the morning of a demo.
--
-- The alternative considered and REJECTED was storing the URL per-device in
-- localStorage. It works on the phone you set it up on and silently does not
-- work on anybody else's, which is exactly wrong for something a judge might
-- open. Configuration belongs in one place that every device reads.
--
-- WHY IT IS SAFE FOR CLIENTS TO READ THIS
-- The scoring URL is not a secret. Pointing the app at a different service
-- cannot forge a verdict: `confidence`, `verdict` and `signals` are not granted
-- to `authenticated` at the column level, so only a holder of the service key
-- can write them, and the request carries a check-in id and nothing else. The
-- worst a wrong URL achieves is failing to score, which leaves the check-in
-- `pending` for backfill - the same state as no service at all.
--
-- Writes are another matter, and are service-role only.

create table if not exists app_config (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz not null default now()
);

alter table app_config enable row level security;

-- Readable by any signed-in user: every device needs it, and it holds nothing
-- secret. Deliberately NOT readable by anon - there is no reason for a
-- logged-out visitor to need it, and a smaller surface is free.
create policy "config readable" on app_config
  for select to authenticated using (true);

-- Column-level, same as everywhere else in this schema: RLS controls WHICH
-- ROWS you touch and cannot stop you writing a particular column. No insert,
-- update or delete is granted to clients at all, so the only way this value
-- changes is with the service key.
revoke all on app_config from anon, authenticated;
grant select on app_config to authenticated;

comment on table app_config is
  'Runtime configuration read by the client at startup. Readable by signed-in '
  'users, writable only with the service_role key. Set ml_url with '
  'tools/set_ml_url.py.';

-- Seeded empty. An empty value means "no scoring service configured", which is
-- a supported state: check-ins stay `pending` and POST /backfill collects them.
insert into app_config (key, value)
values ('ml_url', '')
on conflict (key) do nothing;
