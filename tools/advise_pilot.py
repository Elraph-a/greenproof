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

COST. Free on Gemini, which is the default provider. On Anthropic it is roughly
3 cents per check-in (three 800px photos in, a short structured answer out).
--dry-run reports the count and the provider before anything is spent.

CREDENTIALS. Needs SUPABASE_URL, SUPABASE_SERVICE_KEY, and ONE of
GEMINI_API_KEY (free, aistudio.google.com) or ANTHROPIC_API_KEY - from the
environment or a .env at the repo root or in ml/.

This calls the pipeline IN-PROCESS rather than over HTTP, so it needs no
ADVISE_TOKEN and works whether or not the service is deployed anywhere. That is
the same property score_pilot.py has, and for the same reason: the photos are in
Supabase, so any machine with the keys can do this work.

    Gemini keys come from aistudio.google.com -> Get API key, and the free
    tier covers a pilot this size many times over.

    If using Anthropic instead: a Claude Pro subscription is NOT API access.
    Pro is the claude.ai chat product and the API bills separately.
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
        n for n in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY") if not os.environ.get(n)
    ]
    if missing:
        print(f"Missing: {', '.join(missing)}", file=sys.stderr)
        return 2

    from greenproof_ml import advisor, store

    # Which provider, decided by whichever key is present. Printed rather than
    # assumed: "why is the advice different today" is a question you only get to
    # answer if the run said which model wrote it.
    which = advisor.provider()
    if which is None:
        print(
            "No advisory provider configured.\n\n"
            "Set GEMINI_API_KEY - free, from aistudio.google.com -> Get API key -\n"
            "or ANTHROPIC_API_KEY to use Claude instead (that one bills).",
            file=sys.stderr,
        )
        return 2
    print(f"provider: {which} ({advisor.model_name()})")

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

    cost = "free" if which == "gemini" else f"~${len(rows) * 0.03:.2f} at ~3c each"
    print(f"{len(rows)} check-in(s) to assess  ({cost})")
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
            result = advisor.advise_checkin(cid, strict=True)
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
            failures.append((cid, str(e)[:160]))
            mark = f"ERROR {str(e)[:70]}"
            # A provider that is down fails identically on every row. Stop after
            # three rather than printing the same 404 thirty-eight times.
            if len(failures) >= 3 and not health:
                print("\n  Three failures and no successes - stopping.")
                print(f"  {failures[-1][1]}")
                break

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

    spent = (
        "free (Gemini)"
        if which == "gemini"
        else f"roughly ${sum(health.values()) * 0.03:.2f} spent"
    )
    print(f"\n{(time.time()-started)/60:.1f} minutes, {spent}")
    print(
        "\nThis wrote species_guess and advice ONLY. No confidence, verdict or\n"
        "signal breakdown was touched - run tools/score_pilot.py and compare if\n"
        "you want to confirm that rather than take it on trust."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
