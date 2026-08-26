#!/usr/bin/env python3
"""Prove a scoring service actually works, before pointing the app at it.

    python tools/check_ml.py https://elrpahaa-greenproof-ml.hf.space

WHY THIS EXISTS

A Hugging Face Space showing "Running", or a tunnel process that has not
crashed, is not the same thing as an endpoint that answers correctly. We have
already been caught by that distinction once with quick tunnels, and the cost of
finding out on stage is the whole demo.

So this asks the service to prove four things, and every check is READ-ONLY - it
writes nothing, scores nothing, and spends no money:

    1. it is reachable at all
    2. the DINOv2 model finished loading          (/health -> model_ready)
    3. it can see Supabase                        (/health -> supabase_configured)
    4. the advisory endpoint is wired as intended (/advise, with a bogus id)

Check 4 is the interesting one. Posting a check-in id that cannot exist tells us
how the endpoint is configured WITHOUT causing any work to happen:

    401  ADVISE_TOKEN is set and we did not send it   -> the lock works
    404  reached the handler, id genuinely not found  -> unlocked, or token ok
    500  it got as far as trying, something is broken

Exit code is 0 only if scoring is ready. The advisory layer is reported but
never fails the run: no Anthropic key is a supported state, not an error.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from score_pilot import load_env  # noqa: E402

# An id that is a syntactically valid UUID but cannot be in the database, so the
# handler runs its lookup and stops. Nothing is scored and nothing is written.
IMPOSSIBLE_ID = "00000000-0000-4000-8000-000000000000"

TIMEOUT_S = 120


def _get(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def _post(url: str, payload: dict, headers: dict | None = None) -> tuple[int, str]:
    body = json.dumps(payload).encode()
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", help="base URL of the service")
    args = ap.parse_args()
    base = args.url.strip().rstrip("/")

    load_env()
    print(f"Checking {base}\n")

    # --- 1-3: health ------------------------------------------------------
    try:
        status, body = _get(f"{base}/health")
    except Exception as e:  # noqa: BLE001
        print(f"  UNREACHABLE  {str(e)[:150]}")
        print(
            "\nA Space can take several minutes to build, and the first request\n"
            "after it sleeps wakes it. If the build finished, try once more."
        )
        return 2

    if status != 200:
        print(f"  FAIL  /health returned HTTP {status}")
        print(f"        {body[:300]}")
        return 2

    try:
        health = json.loads(body)
    except json.JSONDecodeError:
        print(f"  FAIL  /health did not return JSON: {body[:200]}")
        return 2

    model_ready = bool(health.get("model_ready"))
    supa = bool(health.get("supabase_configured"))

    print(f"  {'PASS' if health.get('ok') else 'FAIL'}  reachable")
    print(f"  {'PASS' if model_ready else 'WAIT'}  model loaded")
    print(f"  {'PASS' if supa else 'FAIL'}  Supabase configured")

    if not model_ready:
        print(
            "\n  The container is up but DINOv2 is still loading. It is baked\n"
            "  into the image, so this is ONNX session init rather than a\n"
            "  download - wait ~30s and run this again."
        )
    if not supa:
        print(
            "\n  SUPABASE_URL and/or SUPABASE_SERVICE_KEY are missing from the\n"
            "  Space settings. Scoring cannot read photos or write verdicts\n"
            "  without them."
        )

    # --- 4: advisory endpoint --------------------------------------------
    print()
    try:
        status, body = _post(f"{base}/advise", {"checkin_id": IMPOSSIBLE_ID})
    except Exception as e:  # noqa: BLE001
        print(f"  advisory: UNREACHABLE ({str(e)[:100]})")
        status, body = None, ""

    if status == 401:
        print("  PASS  /advise is locked (ADVISE_TOKEN set)")
        token = os.environ.get("ADVISE_TOKEN", "").strip()
        if token:
            s2, _ = _post(
                f"{base}/advise",
                {"checkin_id": IMPOSSIBLE_ID},
                {"X-Advise-Token": token},
            )
            if s2 == 401:
                print("  FAIL  the ADVISE_TOKEN in .env does NOT match the Space")
            else:
                print("  PASS  the ADVISE_TOKEN in .env matches the Space")
        else:
            print("  note  no ADVISE_TOKEN in .env to check it against")
    elif status == 404:
        print("  PASS  /advise reachable (open - no ADVISE_TOKEN set)")
    elif status is not None:
        print(f"  note  /advise returned HTTP {status}: {body[:160]}")

    # --- verdict ----------------------------------------------------------
    print("\n" + "=" * 56)
    if health.get("ok") and model_ready and supa:
        print("SCORING IS READY. Point the app at it with:")
        print(f"  python tools/set_ml_url.py {base}")
        print(
            "\nAdvice is separate and never blocks this: with no ANTHROPIC_API_KEY\n"
            "the Space still scores every check-in, and /advise simply writes\n"
            "nothing."
        )
        return 0

    print("NOT READY - do not point the app at this yet.")
    print("The tunnel is still available: python tools/start_demo.py")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
