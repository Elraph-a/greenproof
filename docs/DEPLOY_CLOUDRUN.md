# Deploying the verification service to Cloud Run

For the live demo: registering a tree on stage and watching it score.

**Nothing else needs this.** The service writes verdicts into Supabase and the
app reads them out of Supabase — they never talk directly except for the
optional "score this now" request. Every number in the deck came from running
`tools/score_pilot.py` on a laptop. This buys one thing: live scoring in front
of an audience.

---

## Before anything else: cap the spending

**Do this first, before you deploy.** A billing account charges automatically
once you leave the free tier, and there is no prompt.

Budget **alerts do not stop anything** — Google's own docs say they "don't
automatically prevent the use or billing of your services". They are emails.

Cloud Run is one of the few services that supports a real **spend cap**, which
pauses the service instead of just emailing you.

1. Console → **Billing** → **Budgets & alerts** → **Create budget**
2. Scope it to this project and to **Cloud Run**
3. Amount: **$1**
4. Choose the **spend cap** option, not alerts-only

Caveats worth knowing: enforcement is not instant, in-flight requests finish
and bill, and lifting the cap is manual and can take an hour.

### The one setting that can actually hurt you

`min-instances` **must stay 0**. At 0 the container sleeps when idle and costs
nothing. Set it above 0 and the container runs 24/7, burns the entire free tier
in about two days, and then bills roughly **$60-70/month**.

`max-instances` of 2 bounds the other direction.

---

## What the free tier gives you

Per month: 2,000,000 requests · 180,000 vCPU-seconds · 360,000 GiB-seconds.

Scoring a check-in costs about 15 seconds of container time, so **160 check-ins
uses roughly 1.3% of the compute allowance**. You could re-score the whole pilot
fifty times over and stay inside it.

**Region: `us-central1`.** Google's free-tier page only states a North America
restriction on egress, but several sources say the compute allowance is limited
to US regions. `us-central1` is free under either reading. The extra ~150 ms
from Ghana is irrelevant when scoring takes seconds.

---

## Deploy from the console

No CLI to install. Push your code to GitHub first — Cloud Build builds from the
repository, so anything uncommitted will not be deployed.

1. Enable the APIs: **Cloud Run**, **Cloud Build**, **Artifact Registry**
2. **Cloud Run** → **Create service**
3. Choose **Continuously deploy from a repository** → **Set up with Cloud Build**
4. Connect GitHub, pick `Elraph-a/greenproof`, branch `main`
5. Build type: **Dockerfile**, and set the Dockerfile path to **`ml/Dockerfile`**

| Setting | Value | Why |
|---|---|---|
| Region | `us-central1` | the free tier |
| Authentication | **Allow unauthenticated invocations** | the PWA calls it from a browser with no Google credentials |
| Container port | `8080` | Cloud Run's default; the Dockerfile reads `$PORT` |
| Memory | **1 GiB** | measured 224 MB steady state, plus headroom |
| CPU | 1 | |
| Min instances | **0** | see above — this is the expensive mistake |
| Max instances | 2 | bounds the cost |
| Request timeout | 300s | a cold start plus two embeddings |

### Environment variables

| Name | Type | Value |
|---|---|---|
| `SUPABASE_URL` | variable | your project URL |
| `SUPABASE_SERVICE_KEY` | **secret** | the `service_role` key |
| `ALLOWED_ORIGINS` | variable | the origin the app is served from |

`SUPABASE_SERVICE_KEY` must be a **secret**, not a plain variable. It can write
any verdict for any tree; it is the one value in this project that must not
leak.

`ALLOWED_ORIGINS` must match wherever the PWA is actually served from, exactly,
including `https://`. If it does not match, the browser blocks the call with a
CORS error and the demo fails in a way that looks like the service is down.

---

## Or with the CLI

```
gcloud run deploy greenproof-ml \
  --source ml \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 300 \
  --set-env-vars "SUPABASE_URL=https://xxxx.supabase.co,ALLOWED_ORIGINS=https://your-app"
```

Then set the secret separately so it never appears in your shell history:

```
gcloud run services update greenproof-ml --region us-central1 \
  --set-secrets "SUPABASE_SERVICE_KEY=greenproof-service-key:latest"
```

---

## Verifying it works

```
curl https://<service-url>/health
```

Then score one real check-in end to end:

```
curl -X POST https://<service-url>/score \
  -H 'Content-Type: application/json' \
  -d '{"checkin_id":"<an id from your database>"}'
```

Finally set `VITE_ML_URL` to the service URL wherever the PWA is deployed, and
rebuild. Vite inlines env vars at **build** time, so changing the variable
without redeploying the frontend does nothing.

---

## On the day

**Wake it before you present.** The container sleeps after idle. Open `/health`
a few minutes beforehand — the first request pays container start plus ONNX
session init. The model itself is baked into the image, so that is seconds
rather than the ninety it would otherwise be.

**Have the fallback ready and do not treat it as a fallback.** A check-in that
stays `pending` and is scored later is documented, intended behaviour — see the
comment at the top of `app/src/lib/ml.ts`. If the network fails on stage, open a
tree that was scored during the pilot and walk through its `signals` breakdown.
That is real data and it demonstrates the "degrade, don't break" claim rather
than contradicting it.

---

## What this does not solve

The app itself still has to be reachable from your phone on the day. Cloud Run
hosts the **verification service** only, not the PWA.
