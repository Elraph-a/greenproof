# Deploy the verification service to a Hugging Face Space

**This replaces the laptop-and-tunnel setup.** Once this is live and
`app_config.ml_url` points at it, `tools/start_demo.py` is a fallback rather
than the plan — see [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md).

The container was always host-agnostic: `ml/Dockerfile` runs as uid 1000 with a
writable `$HOME` **because Spaces requires exactly that**, and `ml/README.md`
already carries the Space frontmatter. Nothing in the code changes to move here.

---

## 1 · Create the Space

<https://huggingface.co/new-space>

| Field | Value | Why |
|---|---|---|
| Owner | `Elrpahaa` | |
| Space name | `greenproof-ml` | gives `elrpahaa-greenproof-ml.hf.space` |
| Licence | anything | not load-bearing |
| **SDK** | **Docker** → **Blank** | not Gradio, not Streamlit. `ml/Dockerfile` is the build |
| Hardware | **CPU basic** is enough | measured 224 MB steady state. CPU upgrade only buys faster inference, not capability |
| Visibility | **Public** or Private | nothing secret lives in `ml/` — secrets are set separately, below |

**Do not tick "Create a README"** — we push our own, and its frontmatter is what
tells Spaces the SDK and port.

### The setting that matters most, and the reason you are paying

**Space → Settings → Sleep time → `never`.**

A sleeping Space cold-starts on the next request: container boot plus ONNX
session init. That is the dead air on stage this whole migration exists to
remove, and leaving the default sleep timer on would reintroduce the exact
failure mode the laptop had. This is the one thing the paid tier is buying.

---

## 2 · Variables and secrets

**Space → Settings → Variables and secrets.** Four values.

| Name | Kind | Value |
|---|---|---|
| `SUPABASE_URL` | **Variable** | your project URL, from `.env` |
| `SUPABASE_SERVICE_KEY` | **Secret** | the `service_role` key, from `.env` |
| `ANTHROPIC_API_KEY` | **Secret** | from console.anthropic.com |
| `ADVISE_TOKEN` | **Secret** | see below |
| `ALLOWED_ORIGINS` | Variable, optional | your Vercel URL |

### Which are secrets, and why it is not arbitrary

- **`SUPABASE_SERVICE_KEY` is the whole security model.** It can write any
  verdict for any tree. A leak does not degrade the system, it ends it.
- **`ANTHROPIC_API_KEY` is billable.** A leak is someone else's spending.
- **`ADVISE_TOKEN`** is what stops a stranger spending that billable key three
  cents at a time — see below.

A **Variable** is visible to anyone who can see the Space. A **Secret** is not.
`SUPABASE_URL` is safe as a variable: it ships inside the PWA already.

### ADVISE_TOKEN

Generated for this deployment:

```
I1qjT62uWdA-5i-78W_ojuNJqZhThhZazU6U6a0fkqE
```

Put the same value in the repo `.env` if you ever want to call `/advise` over
HTTP. You mostly will not — `tools/advise_pilot.py` calls the pipeline
**in-process**, so it needs no token and works whether or not the Space is up.

**Why only this endpoint is locked.** `/score` takes an id, re-reads every input
from the database, and costs only our own CPU — leaving it open is fine, and the
app calls it on every check-in. `/advise` is the one endpoint that **spends
money**. On a rotating tunnel hostname that barely mattered; on a permanent
public URL it is worth a lock.

### ANTHROPIC_API_KEY is optional, and omitting it is a supported state

Leave it unset and `/score` is completely unaffected — `/advise` logs and
returns `{"written": false}`, writing nothing. The advisory layer fails soft by
design so it can never take verification down with it, and that property had to
survive the move off the laptop.

---

## 3 · Push the code

From the repo root, with `HF_TOKEN` in `.env`:

```
python tools/deploy_space.py
```

It pushes the contents of `ml/` — and only `ml/` — to the Space repo. The app,
the pilot photos and the tools stay where they are; the Space needs the service
and nothing else.

**This is a separate remote from GitHub.** Pushing here does not push your
commits to `origin`.

---

## 4 · Verify, in this order

Watch the build in the Space's **Logs** tab. First build takes several minutes:
it installs onnxruntime and OpenCV, and **bakes the DINOv2 weights into the
image** so cold start is never a 90 MB download.

```
curl https://elrpahaa-greenproof-ml.hf.space/health
```

Expect `{"ok":true,"model_ready":true,"supabase_configured":true}`.

`model_ready:false` right after a build is normal — the model loads on a
background thread so the container answers health checks immediately rather than
looking dead and getting restarted. Wait ~30s and re-check.

Then the advisory path, which `/health` does **not** cover:

```
curl -X POST https://elrpahaa-greenproof-ml.hf.space/advise \
  -H 'Content-Type: application/json' \
  -H 'X-Advise-Token: I1qjT62uWdA-5i-78W_ojuNJqZhThhZazU6U6a0fkqE' \
  -d '{"checkin_id":"<a real check-in id>"}'
```

`401` means the token does not match. `{"written": false}` means no Anthropic
key. `{"written": true, ...}` means everything is wired.

---

## 5 · Point the app at it

```
python tools/set_ml_url.py https://elrpahaa-greenproof-ml.hf.space
```

That is the entire switchover. One row in `app_config`, read by every device on
next load — no Vercel rebuild, no phone reconfiguration, nothing per-device.

**To go back to the laptop**, run `python tools/start_demo.py` and it
republishes the tunnel URL over the top. That fallback costs nothing to keep and
is the reason this migration is safe to do the night before a pitch.

---

## What this does and does not solve

**Solves:** the laptop no longer has to be awake, online and unslept for the
whole slot. That was documented in DEMO_RUNBOOK.md as *"the single most likely
way this fails"*.

**Does not solve:** the app is on Vercel and is unaffected by any of this. And
scoring remains asynchronous — a check-in that cannot reach the service still
sits at `pending` and is collected by `/backfill`, which is intended behaviour
and worth saying on stage rather than apologising for.

**What it costs you in the pitch:** one honest sentence changes. "It runs on a
laptop behind a tunnel because free container hosting closed under us" becomes
"it runs as one container, and it deploys unchanged anywhere that runs Docker —
we have run it on a laptop, and it is on a Space now." The second is a better
answer and it is equally true.
