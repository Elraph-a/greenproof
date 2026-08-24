# Live demo runbook

**26 August. Read this the night before, not on the day.**

Verified working end to end on 23 August: a real check-in scored over the public
tunnel in **7 seconds**.

---

## What is actually running, and where

There is no hosted verification service. **Your laptop is the server.**

```
   your phone                Cloudflare edge            your laptop
   ──────────                ───────────────            ───────────
   the app on      ──────►   https://xxxx        ──────►  ML service
   Vercel (HTTPS)            .trycloudflare.com           127.0.0.1:7860
```

The app finds the service by reading one row of `app_config` in Supabase. That
is why the tunnel's rotating hostname is no longer a problem: the URL is
published to the database, and every device picks it up on next load. Nothing
is rebuilt and no phone needs configuring.

**Consequences you must plan around.** The laptop has to be awake, online, and
running both processes for the whole slot. If it sleeps, the tunnel dies and the
hostname changes.

---

## Bring it up - one command

```
python tools/start_demo.py
```

It starts the service, opens the tunnel, publishes the URL to `app_config`, and
verifies the public URL responds before printing **READY**. Leave the window
open. Ctrl+C stops it.

Three commands compressed into one deliberately: the order matters and the URL
has to be carried from one terminal to another, which is fine at a desk and a
bad thing to be doing with six minutes on the clock.

### If you would rather do it by hand

```
cd ml
python -m uvicorn app:app --port 7860
```

then, in a second terminal:

```
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:7860
```

copy the `https://....trycloudflare.com` line it prints, then:

```
python tools/set_ml_url.py <that URL>
```

---

## Pre-flight, ~20 minutes before

Work down this list. Every item has failed for somebody at some point.

- [ ] **Laptop plugged in.** Battery saver throttles background processes.
- [ ] **Sleep disabled.** Settings → System → Power → Screen and sleep → set
      both to **Never**. A sleeping laptop kills the tunnel mid-demo, and this
      is the single most likely way this fails.
- [ ] **On the venue wifi**, not tethered to a phone you will also be demoing on.
- [ ] `python tools/start_demo.py` → wait for **READY**.
- [ ] **Open the app on your phone and check in one tree.** Not a browser tab on
      the laptop - the actual phone, on the actual network. This is the only
      test that proves the whole path.
- [ ] Confirm the verdict comes back within ~10 seconds.
- [ ] Leave the app open on the tree you will demo from.

---

## If something breaks

**Verdict never arrives, spinner keeps going.**
The check-in is safe - it is uploaded and sitting at `pending`. Nothing is lost.
Carry on talking; it can be scored afterwards with `tools/score_pilot.py`. This
is designed behaviour, not a failure: see the comment at the top of
`app/src/lib/ml.ts`.

**Tunnel died (laptop slept, wifi dropped).**
Rerun `python tools/start_demo.py`. It publishes the new hostname automatically.
Takes about 30 seconds. Do not try to edit anything in Vercel.

**Phone still cannot reach it after a restart.**
The app reads `app_config` at startup, so fully close and reopen the app rather
than just switching back to it.

**Check the service is alive from anywhere:**

```
curl <the URL>/health
```

Expect `{"ok":true,"model_ready":true,"supabase_configured":true}`.

---

## The fallback, and how to use it well

**If the network fails, do not apologise for it - use it.**

Open a tree that was scored during the pilot and walk through its `signals`
breakdown: which gates passed, what the confidence was, why it landed where it
did. That is real data from real trees, and it makes the point better than a
live spinner would.

A check-in that stays `pending` and is scored later is **documented, intended
behaviour**. "Designed to degrade, not break" is one of the four claims the
project is built on, and a network failure on stage is that claim demonstrating
itself. The honest line is:

> *"The scoring service is unreachable right now, so this check-in is queued.
> That is exactly what should happen - verification is asynchronous by design,
> so a planter in a village with no signal is never blocked. It will score when
> the connection returns."*

Rehearse saying that once. It turns the worst moment of the demo into a point.

---

## Known limits, if a judge asks how this deploys for real

The tunnel is a demo tool, and Cloudflare says so: quick tunnels are for
testing and development, capped at 200 concurrent requests, with a hostname that
does not persist.

The honest answer:

> *"For the pilot this runs as one container we can host anywhere - we've run it
> locally and it deploys unchanged to any container platform. We didn't put it
> on a paid host because nothing about the pilot required it: scoring is
> asynchronous, so the service being up is never on the critical path."*

That is true, and it is a stronger answer than naming a free tier.
