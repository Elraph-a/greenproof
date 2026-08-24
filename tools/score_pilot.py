#!/usr/bin/env python3
"""Score every pending check-in, from this machine. No server, no hosting.

WHY THIS EXISTS
The verification service writes verdicts INTO Supabase; the app reads them OUT
of Supabase. The two never talk directly. So the service does not have to be
hosted anywhere for the pilot data to be scored - it only has to run somewhere
once. Your laptop is somewhere.

Hosting buys exactly one thing: scoring a check-in live, on stage, while someone
watches. Everything else - the map, the review queue, every number in the deck -
comes from rows this script writes.

    python tools/score_pilot.py                 # score everything pending
    python tools/score_pilot.py --limit 10      # try a few first
    python tools/score_pilot.py --dry-run       # count them, change nothing

Credentials come from the environment, or from a .env file next to the repo
root or in ml/. Needs SUPABASE_URL and SUPABASE_SERVICE_KEY (the service_role
key - the anon key cannot write verdicts and will fail).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))


def load_env() -> None:
    """Read a .env without requiring python-dotenv.

    Only fills variables that are not already set, so a real environment
    variable always beats a stale file.
    """
    for candidate in (ROOT / ".env", ROOT / "ml" / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="0 = everything pending")
    ap.add_argument("--batch", type=int, default=25)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    load_env()
    if not os.environ.get("SUPABASE_URL") or not os.environ.get("SUPABASE_SERVICE_KEY"):
        print(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.\n"
            "Supabase -> Project Settings -> API. Use the service_role key,\n"
            "not the anon key: only service_role may write a verdict.",
            file=sys.stderr,
        )
        return 2

    from greenproof_ml import store
    from greenproof_ml.pipeline import score_checkin

    pending = store.list_pending(args.limit or 10_000)
    print(f"{len(pending)} check-in(s) pending")
    if args.dry_run or not pending:
        return 0

    # The model downloads (~90 MB) and loads on the first call. Say so, or the
    # first minute looks like a hang.
    print("Loading the model (first run downloads ~90 MB)...", flush=True)

    verdicts: Counter[str] = Counter()
    failures: list[tuple[str, str]] = []
    started = time.time()

    for i, row in enumerate(pending, 1):
        cid = row["id"]
        try:
            r = score_checkin(cid)
            verdicts[r.verdict] += 1
            mark = r.verdict
        except Exception as e:  # noqa: BLE001
            # One bad row must never abandon the other 159. A missing photo or a
            # corrupt upload is a fact about that check-in, not a reason to stop.
            failures.append((cid, str(e)[:120]))
            verdicts["error"] += 1
            mark = f"ERROR {str(e)[:60]}"

        elapsed = time.time() - started
        rate = elapsed / i
        left = (len(pending) - i) * rate
        print(
            f"  [{i:>3}/{len(pending)}] {cid[:8]}  {mark:<10}"
            f"  {elapsed/60:.1f}m elapsed, ~{left/60:.0f}m left",
            flush=True,
        )

    print("\n" + "=" * 56)
    print("SCORING COMPLETE")
    print("=" * 56)
    total = sum(verdicts.values())
    for verdict in ("verified", "review", "flagged", "pending", "error"):
        n = verdicts.get(verdict, 0)
        if n:
            print(f"  {verdict:<10} {n:>4}  ({100*n/total:.0f}%)")
    print(f"  {'TOTAL':<10} {total:>4}   in {(time.time()-started)/60:.1f} minutes")

    if failures:
        print(f"\n{len(failures)} failed - these stay pending and can be re-run:")
        for cid, err in failures[:10]:
            print(f"  {cid[:8]}  {err}")

    print(
        "\nThe auto-approve rate above is REAL DATA, but it is not yet the number\n"
        "to quote: thresholds are still the provisional ones in scoring.py. Run\n"
        "ml/calibrate.py for the cross-validated version."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
