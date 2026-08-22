"""Scoring one check-in, end to end.

    fetch row -> download both photos -> gates -> scores -> write back

Idempotent: re-running on the same check-in recomputes from the stored photos
and overwrites the result. That matters more than it sounds, because it means
every threshold change can be replayed over the entire pilot dataset without
going back into the field. The photos are the raw evidence; the verdict is
derived and disposable.
"""

from __future__ import annotations

import logging
import random

from . import store
from .embed import cosine, embed
from .scoring import (
    Assessment,
    assess,
    PROXIMITY_REVIEW_M,
    check_proximity,
    gate_duplicate,
    gate_gps,
    gate_travel,
    score_growth,
    score_liveness,
    score_location,
    score_scene,
)
from .signals import (
    canopy_fraction,
    excess_green,
    haversine_m,
    liveness_score,
    orb_inliers,
    phash,
    trunk_width_mm,
)

log = logging.getLogger(__name__)

# Fraction of auto-approved check-ins pulled for human spot-checking.
# Without this we would have no way to estimate the false-ACCEPT rate, which is
# the number that actually matters — a wrongly rejected genuine visit is
# annoying, a wrongly approved fraud is fatal, and nothing else in the system
# measures the second one.
AUDIT_RATE = 0.10


def score_checkin(checkin_id: str) -> Assessment:
    row = store.get_checkin(checkin_id)
    if row is None:
        raise LookupError(f"No check-in {checkin_id}")

    tree = store.get_tree(row["tree_id"])
    if tree is None:
        raise LookupError(f"Check-in {checkin_id} references a missing tree")

    wide = store.download_image(row["wide_photo"])
    close = store.download_image(row["close_photo"])

    # --- fingerprints ------------------------------------------------------
    wide_ph = phash(wide)
    wide_emb = embed(wide)
    close_emb = embed(close)

    captured_at = store.parse_ts(row["captured_at"])
    prev_visits = store.previous_checkins(row["tree_id"], row["captured_at"])

    # --- gates -------------------------------------------------------------
    gates = {}

    gates["duplicate_image"] = gate_duplicate(
        wide_ph, store.other_phashes(checkin_id)
    )

    gates["gps_radius"] = gate_gps(
        tree["lat"],
        tree["lng"],
        row["lat"],
        row["lng"],
        row.get("gps_accuracy_m"),
    )

    prev_any = store.previous_by_submitter(
        row["submitted_by"], row["captured_at"], checkin_id
    )
    gates["travel_speed"] = gate_travel(
        row["lat"],
        row["lng"],
        captured_at,
        (
            prev_any["id"],
            prev_any["lat"],
            prev_any["lng"],
            store.parse_ts(prev_any["captured_at"]),
        )
        if prev_any
        else None,
    )

    # --- scores ------------------------------------------------------------
    scores: dict[str, dict] = {}

    distance = haversine_m(tree["lat"], tree["lng"], row["lat"], row["lng"])
    scores["location"] = score_location(distance)

    green = excess_green(wide)
    scores["liveness"] = score_liveness(green, liveness_score(green))

    # Scene match needs something to match AGAINST. On the very first visit
    # there is nothing, so the signal is absent rather than zero — assess()
    # renormalises and lowers confidence via the coverage term instead of
    # treating a registration as suspicious.
    if prev_visits:
        best_wide = best_close = None
        for p in prev_visits:
            pw = store.parse_embedding(p.get("wide_embedding"))
            pc = store.parse_embedding(p.get("close_embedding"))
            if pw is not None:
                c = cosine(wide_emb, pw)
                best_wide = c if best_wide is None else max(best_wide, c)
            if pc is not None:
                c = cosine(close_emb, pc)
                best_close = c if best_close is None else max(best_close, c)

        inliers = None
        try:
            prev_wide = store.download_image(prev_visits[0]["wide_photo"])
            inliers = orb_inliers(wide, prev_wide)
        except Exception:  # noqa: BLE001 - corroboration only, never fatal
            log.warning("ORB comparison failed for %s", checkin_id, exc_info=True)

        if best_wide is not None or best_close is not None:
            scores["scene_match"] = score_scene(best_wide, best_close, inliers)

    canopy_now = canopy_fraction(wide)
    canopy_prev = trunk_prev = None
    if prev_visits:
        prev_growth = ((prev_visits[0].get("signals") or {}).get("scores") or {}).get(
            "growth", {}
        )
        canopy_prev = prev_growth.get("canopy_frac")
        trunk_prev = prev_growth.get("trunk_mm")

    # Millimetres are derived HERE, from the stored photo and the stored taps —
    # never from anything the client calculated. See signals.trunk_width_mm.
    measurement = trunk_width_mm(close, row.get("trunk_taps"))
    trunk_now = measurement.get("trunk_mm") if measurement and measurement.get("available") else None

    scores["growth"] = score_growth(canopy_now, canopy_prev, trunk_now, trunk_prev)
    if measurement:
        scores["growth"]["measurement"] = measurement

    # --- review flags ------------------------------------------------------
    # Not gates: these must not auto-approve, but they are not accusations. See
    # scoring.check_proximity for why proximity cannot be a gate.
    review_flags = {}

    # Only on the tree's FIRST check-in, i.e. its registration. On every later
    # visit the tree already exists and standing near a neighbour is not news —
    # re-flagging it every round would bury the reviewer in the same alert.
    if not prev_visits:
        review_flags["tree_proximity"] = check_proximity(
            tree["lat"],
            tree["lng"],
            store.trees_near_registered_before(
                tree["id"],
                tree["lat"],
                tree["lng"],
                tree["created_at"],
                PROXIMITY_REVIEW_M,
            ),
        )

    # --- combine and persist ----------------------------------------------
    result = assess(gates, scores, review_flags=review_flags)

    audit = result.verdict == "verified" and random.random() < AUDIT_RATE

    store.write_result(
        checkin_id,
        phash=wide_ph,
        wide_embedding=wide_emb,
        close_embedding=close_emb,
        confidence=result.confidence,
        verdict=result.verdict,
        signals=result.signals,
        audit_sample=audit,
    )
    store.update_tree_status(row["tree_id"], result.confidence, result.verdict)

    log.info(
        "scored %s -> %s (%d) gates=%s",
        checkin_id,
        result.verdict,
        result.confidence,
        {k: v.passed for k, v in gates.items()},
    )
    return result
