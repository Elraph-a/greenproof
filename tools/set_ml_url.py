#!/usr/bin/env python3
"""Point every device at a scoring service, without rebuilding anything.

    python tools/set_ml_url.py https://abc123.ngrok-free.dev
    python tools/set_ml_url.py --show
    python tools/set_ml_url.py --clear

Writes one row of `app_config`. The app reads it at startup, so a change takes
effect on the next load on every device — no Vercel rebuild, no per-phone
setup, no reinstall.

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY (from .env). Clients are granted
SELECT and nothing else, so this is the only way the value can change.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))
sys.path.insert(0, str(ROOT / "tools"))

from score_pilot import load_env  # noqa: E402

KEY = "ml_url"


def check(url: str) -> str | None:
    """Reject a URL that cannot possibly work, with the reason."""
    u = urlparse(url)
    if u.scheme not in ("http", "https"):
        return "must start with https://"
    if not u.netloc:
        return "no hostname"
    local = u.hostname in ("localhost", "127.0.0.1")
    if u.scheme != "https" and not local:
        # The PWA is served over HTTPS and a browser refuses to let an HTTPS
        # page call a plain HTTP address. Storing one would look configured and
        # silently never work.
        return "must be https:// - the app is served over HTTPS and browsers block HTTPS -> HTTP"
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="?", help="the scoring service base URL")
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--clear", action="store_true")
    args = ap.parse_args()

    load_env()
    from greenproof_ml.store import db

    d = db()

    if args.show or (not args.url and not args.clear):
        try:
            row = (
                d.table("app_config")
                .select("value, updated_at")
                .eq("key", KEY)
                .maybe_single()
                .execute()
            ).data
        except Exception as e:  # noqa: BLE001
            print(
                f"Could not read app_config: {str(e)[:120]}",
                "",
                "If the table does not exist, run",
                "supabase/migrations/0010_app_config.sql in the Supabase SQL editor first.",
                sep="\n",
                file=sys.stderr,
            )
            return 2
        if not row or not (row.get("value") or "").strip():
            print("ml_url is EMPTY - check-ins will stay `pending` for backfill.")
        else:
            print(f"ml_url = {row['value']}")
            print(f"updated {row['updated_at']}")
        return 0

    value = "" if args.clear else args.url.strip().rstrip("/")

    if value:
        problem = check(value)
        if problem:
            print(f"Refusing: {problem}", file=sys.stderr)
            return 2

    d.table("app_config").upsert({"key": KEY, "value": value}).execute()

    if value:
        print(f"ml_url = {value}")
        print("\nEvery device picks this up on next load. Verify the service first:")
        print(f"  curl {value}/health")
    else:
        print("ml_url cleared. Check-ins will stay `pending` and can be scored")
        print("later with tools/score_pilot.py - nothing is lost.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
