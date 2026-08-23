#!/usr/bin/env python3
"""Bring the live demo up with one command.

    python tools/start_demo.py

Starts the verification service, opens a public HTTPS tunnel to it, writes the
tunnel URL into `app_config` so every device picks it up, and verifies the whole
path end to end before telling you it is ready.

Leave it running. Ctrl+C stops both processes.

WHY A SCRIPT AND NOT THREE COMMANDS
The three commands are easy and the order matters, and the tunnel hostname is
regenerated on every restart, so the URL has to be copied from one terminal into
another every single time. That is a fine thing to do at a desk and a bad thing
to do in front of an audience with six minutes on the clock.
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

CLOUDFLARED_CANDIDATES = [
    "cloudflared",
    r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
    r"C:\Program Files\cloudflared\cloudflared.exe",
]


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


def main() -> int:
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

    procs: list[subprocess.Popen] = []
    try:
        # --- 1. the verification service --------------------------------
        # If something already answers on the port, reuse it rather than
        # failing with an address-in-use error that reads like a crash.
        if get(f"{LOCAL}/health"):
            print(f"[1/4] service already running on {PORT}, reusing it")
        else:
            print(f"[1/4] starting the verification service on {PORT} ...")
            procs.append(
                subprocess.Popen(
                    [sys.executable, "-m", "uvicorn", "app:app",
                     "--host", "127.0.0.1", "--port", str(PORT), "--workers", "1"],
                    cwd=ROOT / "ml",
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            )
            # The model is baked into the image but still has to load into an
            # ONNX session, so the first health check is not instant.
            if not wait_for(f"{LOCAL}/health", "service", attempts=20, delay=3):
                print("Service did not come up. Run it by hand to see the error:\n"
                      "  cd ml && python -m uvicorn app:app --port 7860", file=sys.stderr)
                return 1

        # --- 2. the tunnel ----------------------------------------------
        print("[2/4] opening the public tunnel ...")
        tun = subprocess.Popen(
            [cf, "tunnel", "--url", LOCAL, "--no-autoupdate"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        procs.append(tun)

        public = None
        deadline = time.time() + 60
        while time.time() < deadline and public is None:
            line = tun.stdout.readline() if tun.stdout else b""
            if not line:
                if tun.poll() is not None:
                    break
                continue
            m = URL_RE.search(line)
            if m:
                public = m.group(0).decode()
        if not public:
            print("Tunnel did not produce a URL.", file=sys.stderr)
            return 1
        print(f"  {public}")

        # --- 3. tell every device where to find it ----------------------
        print("[3/4] publishing the URL to app_config ...")
        from greenproof_ml.store import db

        db().table("app_config").upsert({"key": "ml_url", "value": public}).execute()

        # --- 4. prove the whole path works ------------------------------
        # Locally healthy is not the same as reachable from a phone. The edge
        # needs a moment to route the new hostname.
        print("[4/4] verifying over the public URL ...")
        if not wait_for(f"{public}/health", "public", attempts=10, delay=4):
            print("Tunnel is up but not reachable yet. Give it a moment and retry\n"
                  f"  curl {public}/health", file=sys.stderr)
            return 1

        print("\n" + "=" * 62)
        print("READY - open the app on your phone and check in a tree.")
        print("=" * 62)
        print(f"  service : {public}")
        print("  Every device picks this up on next app load.")
        print("\n  Leave this window open. Ctrl+C stops the demo.")
        print("  If the laptop sleeps, the tunnel dies and the URL changes -")
        print("  rerun this script and it republishes the new one.\n")

        tun.wait()
        return 0

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
