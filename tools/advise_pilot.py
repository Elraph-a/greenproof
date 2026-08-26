#!/usr/bin/env python3
"""Generate species identification and care advice for pilot check-ins.

WHAT THIS IS, AND WHAT IT IS EMPHATICALLY NOT

This produces ADVICE FOR THE PLANTER: what species the tree appears to be, what
condition it is in, and what to do about it. It writes `species_guess` and
`advice` and nothing else.

It cannot change a confidence, a verdict or a signal breakdown. Run it as often
as you like; every number in the pitch deck is unaffected by it. If you want to
confirm that rather than trust it, run tools/score_pilot.py before and after and
diff the verdicts - they will be identical, because the two code paths share no
components at all.

    python tools/advise_pilot.py                 # everything not yet assessed
    python tools/advise_pilot.py --limit 3       # try a few first
    python tools/advise_pilot.py --dry-run       # count them, spend nothing
    python tools/advise_pilot.py --redo          # re-assess rows already done

COST. Roughly 3 cents per check-in (three 800px photos in, a short structured
answer out, at Opus 5 rates). The 9-check-in pilot costs about 26 cents. The
--dry-run flag exists so you can confirm the count before spending anything.

CREDENTIALS. Needs SUPABASE_URL, SUPABASE_SERVICE_KEY and ANTHROPIC_API_KEY,
from the environment or a .env at the repo root or in ml/.

    A Claude Pro subscription is NOT API access. Pro is the claude.ai chat
    product; the API bills separately. Buy credits and create a key at
    console.anthropic.com -> Billing.
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
    variable always beats a stale file. Same helper as score_pilot.py -
    duplicated rather than shared because these two scripts must stay
    independently runnable, and a tools/ package would be a new import path to
    get wrong on the morning of a demo.
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
    ap.add_argument("--limit", type=int, default=0, help="0 = everything")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--redo",
        action="store_true",
        help="re-assess check-ins that already have advice (costs money again)",
    )
    args = ap.parse_args()

    load_env()

    missing = [
        name
        for name in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "ANTHROPIC_API_KEY")
        if not os.environ.get(name)
    ]
    if missing:
        print(f"Missing: {', '.join(missing)}", file=sys.stderr)
        if "ANTHROPIC_API_KEY" in missing:
            print(
                "\nANTHROPIC_API_KEY is an API key from console.anthropic.com.\n"
                "A Claude Pro subscription does NOT provide one - Pro is the\n"
                "claude.ai chat product and the API bills separately.",
                file=sys.stderr,
            )
        return 2

    from greenproof_ml import advisor, store

    if args.redo:
        r = (
            store.db()
            .table("checkins")
            .select("id")
            .order("server_received_at", desc=False)
            .limit(args.limit or 10_000)
            .execute()
        )
        rows = r.data or []
    else:
        rows = store.list_checkins_without_advice(args.limit or 10_000)

    est = len(rows) * 0.03
    print(f"{len(rows)} check-in(s) to assess  (~${est:.2f} at ~3c each)")
    if args.dry_run or not rows:
        return 0

    health: Counter[str] = Counter()
    species_seen: Counter[str] = Counter()
    failures: list[tuple[str, str]] = []
    skipped = 0
    started = time.time()

    for i, row in enumerate(rows, 1):
        cid = row["id"]
        try:
            result = advisor.advise_checkin(cid)
            if result is None:
                # Either the decline policy skipped it or the model declined to
                # answer. Neither is an error and neither wrote anything.
                skipped += 1
                mark = "skipped"
            else:
                h = result["advice"]["health"]
                sp = result["species_guess"]["common"] or "unidentified"
                health[h] += 1
                species_seen[sp] += 1
                mark = f"{h:<12} {sp}"
        except Exception as e:  # noqa: BLE001
            # One bad row must never abandon the rest. A missing photo is a fact
            # about that check-in, not a reason to stop.
            failures.append((cid, str(e)[:120]))
            mark = f"ERROR {str(e)[:60]}"

        print(f"  [{i:>3}/{len(rows)}] {cid[:8]}  {mark}", flush=True)

    print("\n" + "=" * 56)
    print("ADVISORY PASS COMPLETE")
    print("=" * 56)

    if health:
        print("\nCondition:")
        for k in ("healthy", "stressed", "declining", "cannot_tell"):
            if health.get(k):
                print(f"  {k:<14} {health[k]:>3}")

    if species_seen:
        print("\nSpecies identified:")
        for name, n in species_seen.most_common():
            print(f"  {name:<28} {n:>3}")

    if skipped:
        print(f"\n{skipped} skipped (no decline detected, or the model declined)")

    if failures:
        print(f"\n{len(failures)} failed - nothing was written for these:")
        for cid, err in failures[:10]:
            print(f"  {cid[:8]}  {err}")

    spent = sum(health.values()) * 0.03
    print(f"\n{(time.time()-started)/60:.1f} minutes, roughly ${spent:.2f} spent")
    print(
        "\nThis wrote species_guess and advice ONLY. No confidence, verdict or\n"
        "signal breakdown was touched - run tools/score_pilot.py and compare if\n"
        "you want to confirm that rather than take it on trust."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
