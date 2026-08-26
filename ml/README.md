---
title: GreenProof Verification
emoji: 🌳
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# GreenProof verification service

Scores a tree check-in and writes back a confidence, a verdict and a per-signal
breakdown. The only server-side surface in the stack.

## Why this exists

Everything else in GreenProof is Supabase called directly from the browser. This
service exists for one reason: **a client-computed verification result is
forgeable.** The anon key ships inside the PWA and must be assumed public, so
`confidence`, `verdict` and `signals` are not granted to `authenticated` at the
column level. This process holds the only key that can write them.

`POST /score` takes an id and nothing else. Every input is re-read from the
database and from storage — a caller can ask for a check-in to be scored, but
can never influence what the score is.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness, model-loaded, config present |
| POST | `/score` | score one check-in — `{"checkin_id": "..."}` |
| POST | `/advise` | species + care advice — **advisory, never a verdict** |
| POST | `/backfill?limit=50` | score everything still `pending` |
| GET | `/docs` | interactive OpenAPI |

`/advise` is the only endpoint that is not verification. It writes
`species_guess` and `advice` and cannot touch `confidence`, `verdict` or
`signals` — enforced by column grants, and by `pipeline.py` never importing the
advisor. It is also the only endpoint that **spends money** (~3 cents a call),
which is why it can be locked behind `ADVISE_TOKEN`.

## How a check-in is judged

**Stage 1 — gates.** Disqualifying on their own, run before any scoring.

| Gate | Catches |
|---|---|
| duplicate image (pHash) | resubmitted photo, gallery photo, internet photo |
| GPS radius | right tree, wrong place |
| travel speed | one account submitting from two impossible places |

**Stage 2 — scores.** Continuous 0–1 signals, weighted into a confidence.

| Score | Signal |
|---|---|
| location | distance from the registered point |
| liveness | excess-green vegetation fraction |
| scene match | DINOv2 cosine + ORB/RANSAC inliers vs previous visits |
| growth | canopy and trunk plausibility, not measurement |

Five of the six fraud types in our attack set are caught in stage 1 by ordinary
deterministic code. That is the honest reason the system works, and it is why
overall accuracy is much better than the 54% rank-1 of image matching alone.

## Honest limits

- Image matching is **corroboration, not identity**. Measured on our own 15
  plants: rank-1 54% against 5% chance, AUC 0.77 — real signal, nowhere near
  enough to authorise a payout. It is **bimodal**: near-perfect on distinctive
  trees, near-zero inside a dense same-species stand.
- Wide-shot matching works partly off the **background**, not the tree.
- Young bark is smooth; BarkNet's ~94% figures are on **mature** bark.
- Thresholds and weights in `scoring.py` are **provisional**. They are replaced
  by weights fitted under leave-one-tree-out cross-validation once real rounds
  exist. Nothing is tuned on the data used to report performance.
- A missing signal lowers confidence and routes to a human. It never counts as
  zero, and it never fails closed on a genuine visit. Designed to degrade.

## Configuration

Space → Settings → Variables and secrets:

| Name | Kind | Value |
|---|---|---|
| `SUPABASE_URL` | variable | your project URL |
| `SUPABASE_SERVICE_KEY` | **secret** | the `service_role` key |
| `GEMINI_API_KEY` | **secret** | for `/advise` — free tier, the default provider |
| `ANTHROPIC_API_KEY` | **secret** | alternative provider, used only if no Gemini key |
| `ADVISOR_PROVIDER` | variable | optional: pin to `gemini` or `anthropic` |
| `ADVISE_TOKEN` | **secret** | any random string; required in `X-Advise-Token` on `/advise` |
| `ALLOWED_ORIGINS` | variable | your Vercel URL |

**The service key must never appear in the frontend.** It can write any verdict
for any tree, and it is the value the whole security model rests on.

**Two providers, one interface.** Advice runs on Gemini's free tier by default,
and falls back to Anthropic if only that key is present. Free tiers have closed
under this project three times mid-build, so a second provider is the cheapest
insurance against a fourth — and switching is one environment variable, not a
code change.

**Setting neither is a supported state, not a failure:** `/score` is unaffected
and `/advise` returns `{"written": false}`. The advisory layer fails soft by
design so it can never take verification down with it.

**`ADVISE_TOKEN` matters on a public Space.** Without it, anyone who finds this
URL and a valid check-in id can spend your Anthropic credit three cents at a
time. `/score` needs no such lock: it costs only our own CPU.

## Local run

```
cd ml
pip install -r requirements.txt
export SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
uvicorn app:app --reload --port 7860
```
