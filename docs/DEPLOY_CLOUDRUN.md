# Cloud Run — optional, and blocked

> ## ⚠️ This is NOT the document for the pitch.
>
> **To bring the live demo up, read [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md).**
> One command, a pre-flight checklist, and what to do when something breaks.
>
> Nothing on this page is needed on 26 August.

---

## Why this page still exists

Cloud Run would host the verification service so the demo does not depend on a
laptop. It is genuinely free at our scale.

**It is currently blocked.** Google billing setup fails with `OR_BACR2_44`, a
risk check Google does not explain and does not reliably lift. Firefox,
cookies, and creating the payment profile at pay.google.com first were all
tried.

**Nothing depends on unblocking it.** The service runs fine on the laptop, and
that path is proven end to end. Hosting buys exactly one thing: not needing the
laptop awake during the six minutes.

If billing ever clears, the rest of this page is the deployment.

---

## Before deploying: cap the spending

**Do this first.** A billing account charges automatically once you leave the
free tier, with no prompt.

Budget **alerts do not stop anything** — Google's own docs say they "don't
automatically prevent the use or billing of your services". They are emails.
Cloud Run is one of the few services supporting a real **spend cap**, which
pauses the service instead.

1. Console → **Billing** → **Budgets & alerts** → **Create budget**
2. Scope to this project and to **Cloud Run**
3. Amount **$1**
4. Choose the **spend cap** option, not alerts-only

Enforcement is not instant, in-flight requests still bill, and lifting the cap
is manual.

### The setting that can actually hurt you

`min-instances` **must stay 0.** At 0 the container sleeps when idle and costs
nothing. Above 0 it runs 24/7, burns the free tier in about two days, then
bills roughly **$60–70/month**.

---

## Free tier, against our actual usage

Per month: 2,000,000 requests · 180,000 vCPU-seconds · 360,000 GiB-seconds.

Scoring a check-in costs about 15 seconds of container time. **160 check-ins is
roughly 1.3% of the compute allowance** — the whole pilot could be re-scored
fifty times over and stay inside it.

**Region: `us-central1`.** Google's free-tier page states a North America
restriction only on egress, but other sources say compute is US-only.
`us-central1` is free under either reading, and the extra ~150 ms from Ghana is
irrelevant when scoring takes seconds.

---

## Deploy

Push to GitHub first — Cloud Build builds from the repository, so anything
uncommitted will not deploy.

1. Enable **Cloud Run**, **Cloud Build**, **Artifact Registry**
2. **Cloud Run** → **Create service** → **Continuously deploy from a repository**
3. GitHub → `Elraph-a/greenproof` → branch `main`
4. Build type **Dockerfile**, path **`ml/Dockerfile`**

| Setting | Value | Why |
|---|---|---|
| Region | `us-central1` | the free tier |
| Authentication | **Allow unauthenticated** | the browser calls it with no Google login |
| Container port | `8080` | Cloud Run's default; the Dockerfile reads `$PORT` |
| Memory | **1 GiB** | measured 224 MB steady state, plus headroom |
| CPU | 1 | |
| Min instances | **0** | the expensive mistake above |
| Max instances | 2 | bounds the cost |
| Request timeout | 300s | cold start plus two embeddings |

### Environment variables

| Name | Type | Required for |
|---|---|---|
| `SUPABASE_URL` | variable | everything |
| `SUPABASE_SERVICE_KEY` | **secret** | everything |
| `ANTHROPIC_API_KEY` | **secret** | `/advise` only |
| `ALLOWED_ORIGINS` | variable, or leave unset | CORS |

**Two secrets, not one.** Both must be secrets rather than plain variables:

- `SUPABASE_SERVICE_KEY` can write any verdict for any tree. It is the value the
  entire security model rests on.
- `ANTHROPIC_API_KEY` is a billable credential. A leaked key is someone else's
  spending on your card.

Cloud Run is actually a **better** home for both than a laptop, since Secret
Manager keeps them out of the filesystem and out of shell history. That is worth
saying out loud if a judge asks what hosting bought you.

**`ANTHROPIC_API_KEY` is optional in the deployment sense.** Leave it unset and
`/score` still works perfectly — `/advise` simply logs and returns
`{"written": false}`, writing nothing. The advisory layer was built to fail soft
precisely so it could never take verification down with it, and that property
survives the move to Cloud Run.

`ALLOWED_ORIGINS` defaults to `*` if unset, which is safe — the endpoints carry
no secrets a caller could extract, and every verdict is derived from stored
photos rather than the request body.

### Or with the CLI

```
gcloud run deploy greenproof-ml \
  --source ml \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 \
  --min-instances 0 --max-instances 2 \
  --timeout 300 \
  --set-env-vars "SUPABASE_URL=https://xxxx.supabase.co"
```

Set the secret separately so it never enters shell history:

```
gcloud run services update greenproof-ml --region us-central1 \
  --set-secrets "SUPABASE_SERVICE_KEY=greenproof-service-key:latest"
```

---

## After it deploys

```
curl https://<service-url>/health
```

Expect `{"ok":true,"model_ready":true,"supabase_configured":true}`. Then check
the advisory path separately, because `/health` does not cover it:

```
curl -X POST https://<service-url>/advise   -H 'Content-Type: application/json'   -d '{"checkin_id":"<a real check-in id>"}'
```

`{"written": true, ...}` means the Anthropic key is wired up. `{"written":
false}` means it is not — and note that this is **not an error**, by design.

Then point the app at it — the same command the tunnel uses, because the app
reads its scoring URL from the database either way:

```
python tools/set_ml_url.py https://<service-url>
```

That is the whole switchover. No Vercel rebuild, no per-device setup. To go
back to the laptop, run `python tools/start_demo.py` and it republishes the
tunnel URL over the top.

**The model is baked into the image**, so a cold start is container boot plus
session init rather than a 90 MB download. Still open `/health` a few minutes
before presenting to wake it.

---

## What this does not solve

Cloud Run hosts the **verification service** only. The app itself is on Vercel
and is unaffected by anything on this page.
