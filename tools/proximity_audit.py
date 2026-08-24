#!/usr/bin/env python3
"""Find trees registered twice, and calibrate the proximity radius from real data.

WHY THIS EXISTS
The pilot produced duplicate tree rows: one trunk photographed twice became two
trees, because nothing checked. Two rows for one trunk means the tree is paid
for twice, and it means the headline "we registered N trees" is wrong. Both have
to be settled before anything is quoted on stage.

IT CHANGES NOTHING. Read-only. It prints candidates and a suggested radius; a
human decides what is actually a duplicate, because GPS alone cannot.

    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python tools/proximity_audit.py

Optional: --radius M   how close counts as a candidate (default: the value the
                       scorer uses, so the audit and the gate agree)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ml"))

from greenproof_ml.scoring import PROXIMITY_REVIEW_M  # noqa: E402
from greenproof_ml.signals import haversine_m  # noqa: E402
from greenproof_ml.store import db  # noqa: E402


def percentile(values: list[float], p: float) -> float:
    """Nearest-rank percentile. No numpy dependency for a script this small."""
    if not values:
        return float("nan")
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round(p / 100 * (len(s) - 1)))))
    return s[k]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--radius", type=float, default=PROXIMITY_REVIEW_M)
    args = ap.parse_args()

    if not os.environ.get("SUPABASE_SERVICE_KEY"):
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.", file=sys.stderr)
        return 2

    rows = (
        db()
        .table("trees")
        .select("id, tag_code, species, lat, lng, owner_id, created_at")
        .order("created_at")
        .execute()
    ).data or []

    print(f"{len(rows)} trees\n")
    if len(rows) < 2:
        return 0

    # --- nearest neighbour for every tree ---------------------------------
    nearest: list[tuple[float, dict, dict]] = []
    for i, a in enumerate(rows):
        best_d, best = float("inf"), None
        for j, b in enumerate(rows):
            if i == j:
                continue
            d = haversine_m(a["lat"], a["lng"], b["lat"], b["lng"])
            if d < best_d:
                best_d, best = d, b
        if best is not None:
            nearest.append((best_d, a, best))

    dists = [d for d, _, _ in nearest]

    # --- calibration -------------------------------------------------------
    # The radius should sit BELOW the spacing of genuinely distinct neighbouring
    # trees, or every registration in a dense grove warns and people learn to
    # tap straight through it. The 5th percentile is the working rule: tolerate
    # warning on the closest 5% of legitimate pairs.
    print("Nearest-neighbour distance (m)")
    for p in (1, 5, 10, 25, 50, 90):
        print(f"  p{p:<3} {percentile(dists, p):8.1f}")
    print(f"  max  {max(dists):8.1f}")
    print(f"\nSuggested radius (p5): {percentile(dists, 5):.1f} m")
    print(f"Currently configured : {PROXIMITY_REVIEW_M:.1f} m")
    print(
        "  -> set PROXIMITY_REVIEW_M (ml/greenproof_ml/scoring.py) and\n"
        "     PROXIMITY_WARN_M (app/src/lib/trees.ts) to the same value.\n"
    )

    # --- duplicate candidates ---------------------------------------------
    # Report each PAIR once, attributing the problem to the LATER registration —
    # the earlier row is the one with the honest photo history and should be the
    # one that survives a merge.
    seen: set[tuple[str, str]] = set()
    pairs = []
    for d, a, b in nearest:
        if d > args.radius:
            continue
        key = tuple(sorted((a["id"], b["id"])))
        if key in seen:
            continue
        seen.add(key)
        later, earlier = (a, b) if a["created_at"] > b["created_at"] else (b, a)
        pairs.append((d, earlier, later))

    if not pairs:
        print(f"No tree pairs within {args.radius:.1f} m. Nothing to merge.")
        return 0

    print(f"{len(pairs)} candidate duplicate pair(s) within {args.radius:.1f} m")
    print("The LATER row is the suspect. Confirm against the photos before merging.\n")
    for d, earlier, later in sorted(pairs, key=lambda t: t[0]):
        same_owner = earlier["owner_id"] == later["owner_id"]
        print(f"  {d:5.1f} m   {'same planter' if same_owner else 'DIFFERENT planters'}")
        for label, t in (("keep ", earlier), ("check", later)):
            tag = t["tag_code"] or t["id"][:8]
            print(f"    {label}  {tag:<12} {t['species'] or '-':<12} {t['created_at']}")
        print()

    print(
        "NOT proof. Two trees really can grow this close, and phone GPS cannot\n"
        "separate that from one trunk entered twice. Open both trees' wide shots."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
