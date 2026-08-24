# Setup - accounts and keys

Everything here needs a human with a browser. Do it once, paste the results into
`app/.env`, and it never needs doing again.

---

## 1 · Supabase project  *(~15 min - blocks everything)*

1. Go to <https://supabase.com/dashboard> → **New project**
2. Name `greenproof` · **Region: `eu-west-2` (London)** - closest free region to
   Ghana; `us-east-1` adds ~100 ms to every call in the field
3. Set a database password and **save it somewhere** - you cannot see it again
4. Wait ~2 minutes for provisioning

### Apply the schema

**SQL Editor** → **New query**. Run the four files **in order**, one at a time,
pasting the contents of each and pressing Run:

```
supabase/migrations/0001_schema.sql
supabase/migrations/0002_rls_grants.sql
supabase/migrations/0003_storage.sql
supabase/migrations/0004_profile_trigger.sql
```

If `0001` errors on `create extension postgis`, enable it first under
**Database → Extensions** (search `postgis`, toggle on), then re-run.

### Turn off email confirmation for the pilot

**Authentication → Sign In / Providers → Email**

- **Confirm email: OFF**

Why: magic links are the sign-in method, and in the field on mobile data a
confirmation round-trip is one more thing to fail at T0. This is a pilot with
known users, not a public launch.

### Copy the keys

**Project Settings → API**

| Dashboard label | Goes into |
|---|---|
| Project URL | `VITE_SUPABASE_URL` |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_KEY` - **server only, never in `app/`** |

The anon key ships inside the browser and is public by design. The column grants
in `0002` are what stop a user writing their own verification result - not the
key.

---

## 2 · Vercel  *(~5 min - needed for HTTPS)*

<https://vercel.com/signup> → sign in with GitHub.

**Camera, GPS and compass all refuse to run over plain HTTP.** `localhost` is
exempt, so desktop testing works, but the phone needs a real HTTPS URL. That is
the only reason Vercel is on the critical path for T0.

Root directory when importing: **`app`**.

---

## 3 · Hugging Face  *(not needed for T0 - do it later this week)*

<https://huggingface.co/join>. The ML service is a Space, and it scores photos
*after* they are uploaded, so nothing about T0 waits on it.

---

## 4 · Field kit for T0  *(not software)*

- [ ] **ArUco marker** printed at ~80 mm and laminated (or in a clear sleeve).
      Print from `docs/aruco/` once generated - measure the printed square with a
      ruler and write the real width on the back. **A printer scaling to "fit
      page" silently changes the size and would corrupt every measurement.**
- [ ] **Tape measure** - trunk width on ~20 trees at 1.3 m. This is the
      validation that makes the measurement claim defensible.
- [ ] Notebook to record those 20 tape readings against tree numbers
- [ ] Phone charged, and a power bank

---

## Filling in `app/.env`

```
cd app
cp .env.example .env
```

Then paste the two `VITE_` values into `app/.env`.

**Restart the dev server after editing.** Vite reads env only at startup, so a
value added to a running server is not loaded - and the resulting failure looks
like a wrong key rather than a stale process.

Leave `VITE_ML_URL` empty until the Hugging Face Space exists. Empty is safe:
check-ins stay `pending` and are collected later by `POST /backfill`.
