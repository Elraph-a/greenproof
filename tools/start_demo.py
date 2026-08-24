#!/usr/bin/env python3
"""Bring the live demo up with one command, and keep it up.

    python tools/start_demo.py

Starts the verification service, opens a public HTTPS tunnel to it, writes the
tunnel URL into `app_config` so every device picks it up, scores anything that
was submitted while the service was down, verifies the whole path end to end,
and then watches the tunnel and rebuilds it if it dies.

Leave it running. Ctrl+C stops both processes.

WHY A SCRIPT AND NOT THREE COMMANDS
The three commands are easy and the order matters, and the tunnel hostname is
regenerated on every restart, so the URL has to be copied from one terminal into
another every single time. That is a fine thing to do at a desk and a bad thing
to do in front of an audience with six minutes on the clock.

THREE FAILURES THIS SCRIPT NOW ABSORBS, ALL OF WHICH HAPPENED ON 24 AUG:

  1. A CHECK-IN SUBMITTED BEFORE THE SERVICE EXISTED NEVER SCORES.
     A phone checked in 52 minutes before the tunnel came up. The row was
     written `pending` and failed safe, which is correct - but nothing ever
     came back for it. `requestScoring` in the app swallows the failure with
     the comment "backfill will collect it", and there was no backfill. Step 4
     is now that backfill, so the comment is true.

  2. A LIVE `cloudflared` PROCESS IS NOT A LIVE TUNNEL.
     Cloudflare tore a quick tunnel down server-side while the client process
     kept running: the hostname stopped resolving, `Get-Process cloudflared`
     still showed it, and nothing looked wrong until a request was actually
     made. Step 6 polls the PUBLIC url, not the process table, and rebuilds
     the tunnel when it stops answering.

  3. STDOUT BUFFERING MAKES A WORKING SCRIPT LOOK HUNG.
     Redirected to a file, Python block-buffers stdout. The log sat at
     "waiting for service ... (1/20)" for five minutes while the service was
     up and serving the whole time. Line buffering is forced below.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))
sys.path.insert(0, str(ROOT / "tools"))

from score_pilot import load_env  # noqa: E402

PORT = 7860
LOCAL = f"http://127.0.0.1:{PORT}"
URL_RE = re.compile(rb"https://[a-z0-9-]+\.trycloudflare\.com")

# How the watchdog behaves once everything is up.
WATCH_EVERY_S = 30
WATCH_FAILS_BEFORE_REBUILD = 2

CLOUDFLARED_CANDIDATES = [
    "cloudflared",
    r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
    r"C:\Program Files\cloudflared\cloudflared.exe",
]

# Never let a redirected stdout hide progress. See failure 3 in the docstring.
try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except AttributeError:  # pragma: no cover - very old Python
    pass


def find_cloudflared() -> str | None:
    for c in CLOUDFLARED_CANDIDATES:
        try:
            subprocess.run(
                [c, "--version"], capture_output=True, timeout=15, check=True
            )
            return c
        except Exception:  # noqa: BLE001
            continue
    return None


def get(url: str, timeout: float = 5.0) -> str | None:
    import urllib.request

    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode()
    except Exception:  # noqa: BLE001
        return None


def wait_for(url: str, label: str, attempts: int, delay: float) -> bool:
    for i in range(1, attempts + 1):
        body = get(url, timeout=10)
        if body:
            print(f"  {label}: {body.strip()[:80]}")
            return True
        print(f"  waiting for {label} ... ({i}/{attempts})", flush=True)
        time.sleep(delay)
    return False


def open_tunnel(cf: str) -> tuple[subprocess.Popen, str] | None:
    """Start cloudflared and return it with the hostname it printed."""
    tun = subprocess.Popen(
        [cf, "tunnel", "--url", LOCAL, "--no-autoupdate"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    deadline = time.time() + 60
    while time.time() < deadline:
        line = tun.stdout.readline() if tun.stdout else b""
        if not line:
            if tun.poll() is not None:
                break
            continue
        m = URL_RE.search(line)
        if m:
            return tun, m.group(0).decode()
    try:
        tun.terminate()
    except Exception:  # noqa: BLE001
        pass
    return None


def publish(url: str) -> None:
    from greenproof_ml.store import db

    db().table("app_config").upsert({"key": "ml_url", "value": url}).execute()


def sweep_pending() -> None:
    """Score anything stranded while the service was down.

    Deliberately NOT fatal. A corrupt upload from three weeks ago must never
    stop the demo coming up, so every failure here is reported and stepped
    over.
    """
    from greenproof_ml import store
    from greenproof_ml.pipeline import score_checkin

    try:
        pending = store.list_pending(500)
    except Exception as e:  # noqa: BLE001
        print(f"  could not check for pending rows: {str(e)[:90]}")
        return

    if not pending:
        print("  nothing pending")
        return

    print(f"  {len(pending)} pending check-in(s) - scoring them now")
    done: dict[str, int] = {}
    for row in pending:
        cid = row["id"]
        try:
            verdict = score_checkin(cid).verdict
        except Exception as e:  # noqa: BLE001
            verdict = "error"
            print(f"    {cid[:8]} failed: {str(e)[:80]}")
        done[verdict] = done.get(verdict, 0) + 1
    print("  " + ", ".join(f"{v}: {n}" for v, n in sorted(done.items())))


def check_public(url: str) -> bool:
    return bool(get(f"{url}/health", timeout=12))


def main() -> int:
    # --help must never START the demo. Running it expecting a usage line and
    # getting a live tunnel instead is a genuinely bad surprise, and the person
    # most likely to type it is someone under time pressure who has forgotten
    # what this does.
    if any(a in ("-h", "--help") for a in sys.argv[1:]):
        print(__doc__.strip())
        print()
        print("Pre-flight checklist and recovery steps: docs/DEMO_RUNBOOK.md")
        return 0

    load_env()
    if not os.environ.get("SUPABASE_SERVICE_KEY"):
        print("SUPABASE_SERVICE_KEY is not set. Check .env.", file=sys.stderr)
        return 2

    cf = find_cloudflared()
    if not cf:
        print(
            "cloudflared not found. Install it from\n"
            "  https://github.com/cloudflare/cloudflared/releases/latest/download/"
            "cloudflared-windows-amd64.msi",
            file=sys.stderr,
        )
        return 2

    t0 = time.time()
    procs: list[subprocess.Popen] = []
    try:
        # --- 1. the verification service --------------------------------
        # If something already answers on the port, reuse it rather than
        # failing with an address-in-use error that reads like a crash.
        step = time.time()
        if get(f"{LOCAL}/health"):
            print(f"[1/5] service already running on {PORT}, reusing it")
        else:
            print(f"[1/5] starting the verification service on {PORT} ...")
            procs.append(
                subprocess.Popen(
                    [sys.executable, "-m", "uvicorn", "app:app",
                     "--host", "127.0.0.1", "--port", str(PORT), "--workers", "1"],
                    cwd=ROOT / "ml",
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            )
            # The model has to load into an ONNX session, so the first health
            # check is not instant.
            if not wait_for(f"{LOCAL}/health", "service", attempts=20, delay=3):
                print("Service did not come up. Run it by hand to see the error:\n"
                      "  cd ml && python -m uvicorn app:app --port 7860",
                      file=sys.stderr)
                return 1
        print(f"      {time.time() - step:.0f}s")

        # --- 2. the tunnel ----------------------------------------------
        step = time.time()
        print("[2/5] opening the public tunnel ...")
        opened = open_tunnel(cf)
        if not opened:
            print("Tunnel did not produce a URL.", file=sys.stderr)
            return 1
        tun, public = opened
        procs.append(tun)
        print(f"  {public}")
        print(f"      {time.time() - step:.0f}s")

        # --- 3. tell every device where to find it ----------------------
        print("[3/5] publishing the URL to app_config ...")
        publish(public)

        # --- 4. collect anything stranded while we were down ------------
        # This is the "backfill" the app's requestScoring already promises.
        print("[4/5] scoring anything submitted while the service was down ...")
        step = time.time()
        sweep_pending()
        print(f"      {time.time() - step:.0f}s")

        # --- 5. prove the whole path works ------------------------------
        # Locally healthy is not the same as reachable from a phone. The edge
        # needs a moment to route the new hostname.
        step = time.time()
        print("[5/5] verifying over the public URL ...")
        if not wait_for(f"{public}/health", "public", attempts=10, delay=4):
            print("Tunnel is up but not reachable yet. Give it a moment and retry\n"
                  f"  curl {public}/health", file=sys.stderr)
            return 1
        # /health proves the tunnel routes. It does NOT prove the endpoint the
        # app actually calls is reachable, and that is the one that matters on
        # stage. A 404 for a bogus id is a SUCCESS here: it means the request
        # reached the application rather than dying at the edge.
        import json
        import urllib.request

        req = urllib.request.Request(
            f"{public}/score",
            data=json.dumps({"checkin_id": "00000000-0000-0000-0000-000000000000"}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=30)
            print("  scoring endpoint: reachable")
        except urllib.error.HTTPError as e:
            print(f"  scoring endpoint: reachable (HTTP {e.code} for a bogus id, as expected)")
        except Exception as e:  # noqa: BLE001
            print(f"  scoring endpoint: NOT reachable - {str(e)[:90]}", file=sys.stderr)
            return 1
        print(f"      {time.time() - step:.0f}s")

        print("\n" + "=" * 62)
        print(f"READY in {time.time() - t0:.0f}s - open the app and check in a tree.")
        print("=" * 62)
        print(f"  service : {public}")
        print("  Every device picks this up on next app load.")
        print(f"\n  Watching the tunnel every {WATCH_EVERY_S}s. If it dies this")
        print("  script rebuilds it and republishes the new URL by itself.")
        print("  Leave this window open. Ctrl+C stops the demo.\n")

        # --- 6. watchdog -------------------------------------------------
        # Polls the PUBLIC url, because the process table lies: a quick tunnel
        # can be torn down at Cloudflare's end while cloudflared keeps running
        # happily. Two consecutive failures rather than one, so a single
        # dropped request on a bad connection does not churn the hostname.
        fails = 0
        while True:
            time.sleep(WATCH_EVERY_S)
            if tun.poll() is not None:
                print("  tunnel process exited - rebuilding", flush=True)
            elif check_public(public):
                if fails:
                    print("  tunnel recovered", flush=True)
                fails = 0
                continue
            else:
                fails += 1
                print(f"  tunnel not answering ({fails}/{WATCH_FAILS_BEFORE_REBUILD})",
                      flush=True)
                if fails < WATCH_FAILS_BEFORE_REBUILD:
                    continue

            try:
                tun.terminate()
            except Exception:  # noqa: BLE001
                pass
            reopened = open_tunnel(cf)
            if not reopened:
                print("  could not rebuild the tunnel; retrying next cycle",
                      flush=True)
                continue
            tun, public = reopened
            procs.append(tun)
            publish(public)
            fails = 0
            print(f"  NEW URL published: {public}", flush=True)
            print("  Reload the app on any device that had it open.", flush=True)

    except KeyboardInterrupt:
        print("\nstopping ...")
        return 0
    finally:
        for p in procs:
            try:
                p.terminate()
            except Exception:  # noqa: BLE001
                pass


if __name__ == "__main__":
    raise SystemExit(main())
