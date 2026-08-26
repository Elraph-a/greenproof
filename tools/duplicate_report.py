#!/usr/bin/env python3
"""Rank candidate duplicate tree registrations by GPS *and* by the photographs.

    python tools/duplicate_report.py
    python tools/duplicate_report.py --radius 8 --open

WHY THIS EXISTS

`check_proximity` in scoring.py compares two trees' COORDINATES and nothing
else. On a dense plot that is not enough: phone GPS drifts 5-15 m under canopy,
so "two trees 2 m apart" and "one trunk registered twice" produce identical
readings and every pair goes to a human as an undifferentiated list.

But we already hold the thing that CAN separate them. Every check-in carries a
DINOv2 embedding of its wide shot and its close-up, and comparing two trees'
registration photographs is precisely the job the model is for - our own docs
say the AI's one defensible role is "telling two different trees apart at the
same location". That capability was wired to check-ins and never to
registration. This wires it.

WHAT IT DOES NOT DO

It does not delete, merge or modify anything. It is READ-ONLY.

The reason is the measurement, not caution for its own sake: image matching is
rank-1 54% with AUC 0.77 and is BIMODAL - near-perfect on distinctive trees,
near-zero inside a dense same-species stand, which is exactly the situation a
duplicate cluster creates. A signal that good is worth a lot for RANKING and
nowhere near enough to authorise a destructive write.

So it produces a shortlist ordered by how likely each pair is to be one trunk,
with the evidence beside it and both photographs one click away. A person
decides.

EVIDENCE COMBINED PER PAIR

    distance      metres between the two registered points
    cosine        DINOv2 similarity of the two registration photos
                  (measured: same-tree mean 0.62, different-tree mean 0.41)
    minutes       gap between the two registrations
    same planter  one account registering both

None is conclusive alone. Two trees 0.6 m apart, photographed 32 seconds apart
by the same person, whose photos score 0.85 cosine, is about as clear as this
evidence gets - and it is still a human who says so.
"""

from __future__ import annotations

import argparse
import os
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))
sys.path.insert(0, str(ROOT / "tools"))

from score_pilot import load_env  # noqa: E402

# Same default as the scorer, so the report and the gate agree on what counts
# as a candidate. Overridable to widen the net when reviewing.
from greenproof_ml.scoring import PROXIMITY_REVIEW_M  # noqa: E402
from greenproof_ml.signals import haversine_m  # noqa: E402


def cosine(a, b) -> float | None:
    if a is None or b is None:
        return None
    import numpy as np

    return float(np.dot(a, b))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--radius", type=float, default=PROXIMITY_REVIEW_M)
    ap.add_argument("--open", action="store_true", help="open each pair's photos in a browser")
    args = ap.parse_args()

    load_env()
    from greenproof_ml import store

    d = store.db()

    trees = (
        d.table("trees")
        .select("id, lat, lng, created_at, tag_code, species, owner_id")
        .order("created_at")
        .execute()
    ).data or []

    checkins = (
        d.table("checkins")
        .select(
            "id, tree_id, captured_at, submitted_by, wide_photo, close_photo, "
            "wide_embedding, close_embedding"
        )
        .order("captured_at")
        .execute()
    ).data or []

    # A tree's REGISTRATION is its first check-in. That is the photo pair to
    # compare: later visits may be framed differently and would muddy the
    # comparison with framing differences rather than tree differences.
    first: dict[str, dict] = {}
    for c in checkins:
        first.setdefault(c["tree_id"], c)

    pairs = []
    for i, t in enumerate(trees):
        for e in trees[:i]:
            dist = haversine_m(t["lat"], t["lng"], e["lat"], e["lng"])
            if dist > args.radius:
                continue

            ct, ce = first.get(t["id"]), first.get(e["id"])
            cw = cc = None
            if ct and ce:
                cw = cosine(
                    store.parse_embedding(ct.get("wide_embedding")),
                    store.parse_embedding(ce.get("wide_embedding")),
                )
                cc = cosine(
                    store.parse_embedding(ct.get("close_embedding")),
                    store.parse_embedding(ce.get("close_embedding")),
                )

            mins = None
            if ct and ce:
                mins = abs(
                    (store.parse_ts(ct["captured_at"]) - store.parse_ts(ce["captured_at"])
                     ).total_seconds()
                ) / 60.0

            same_planter = bool(ct and ce and ct["submitted_by"] == ce["submitted_by"])
            best_cos = max([x for x in (cw, cc) if x is not None], default=None)

            # Ranking only - deliberately NOT a threshold or a verdict. Closer,
            # more similar, closer in time and same planter all push a pair up
            # the list a human works down.
            score = 0.0
            score += max(0.0, 1.0 - dist / max(args.radius, 1e-6)) * 0.40
            if best_cos is not None:
                score += max(0.0, min(1.0, (best_cos - 0.35) / 0.45)) * 0.40
            if mins is not None:
                score += max(0.0, 1.0 - min(mins, 60.0) / 60.0) * 0.15
            score += 0.05 if same_planter else 0.0

            pairs.append(
                dict(
                    score=score, dist=dist, cw=cw, cc=cc, mins=mins,
                    same_planter=same_planter, newer=t, older=e,
                    newer_ck=ct, older_ck=ce,
                )
            )

    pairs.sort(key=lambda p: -p["score"])

    print(f"{len(trees)} trees, {len(pairs)} candidate pair(s) within {args.radius:.0f} m")
    print("\nRanked most-likely-duplicate first. NOTHING has been changed.\n")
    print(f"{'rank':<5}{'likely':<8}{'dist':>7}{'cos(wide)':>11}{'cos(close)':>12}{'mins':>8}  same  ids")
    print("-" * 92)

    for n, p in enumerate(pairs, 1):
        cw = f"{p['cw']:.3f}" if p["cw"] is not None else "   -  "
        cc = f"{p['cc']:.3f}" if p["cc"] is not None else "   -  "
        mm = f"{p['mins']:.0f}" if p["mins"] is not None else "  -"
        print(
            f"{n:<5}{p['score']:<8.2f}{p['dist']:>6.1f}m{cw:>11}{cc:>12}{mm:>8}"
            f"  {'yes' if p['same_planter'] else 'no ':<5}"
            f" {p['newer']['id'][:8]} vs {p['older']['id'][:8]}"
        )

    # Reference points from our own measurements, so the numbers above mean
    # something to whoever reads this at 1am.
    print(
        "\ncosine reference (spike/FINDINGS.md): same tree mean 0.62, different tree mean 0.41"
        "\nAUC 0.77 and bimodal - strong evidence, NOT proof. Open the photos."
    )

    if pairs:
        print("\n--- photographs ---")
        paths = []
        for p in pairs:
            for ck in (p["newer_ck"], p["older_ck"]):
                if ck:
                    paths.append(ck["wide_photo"])
        from greenproof_ml.store import BUCKET

        urls = {}
        for path in set(paths):
            try:
                urls[path] = d.storage.from_(BUCKET).create_signed_url(path, 3600)["signedURL"]
            except Exception:
                pass

        for n, p in enumerate(pairs, 1):
            print(f"\n  [{n}] {p['newer']['id'][:8]} vs {p['older']['id'][:8]}  "
                  f"({p['dist']:.1f} m, cos {p['cw'] if p['cw'] is None else round(p['cw'],3)})")
            for label, ck in (("newer", p["newer_ck"]), ("older", p["older_ck"])):
                if ck and ck["wide_photo"] in urls:
                    print(f"      {label}: {urls[ck['wide_photo']]}")
                    if args.open:
                        webbrowser.open(urls[ck["wide_photo"]])

    print(
        "\nNothing was deleted, merged or modified. Decide by looking, then act on\n"
        "the specific tree ids - never on a rule like 'registered within N seconds'."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
