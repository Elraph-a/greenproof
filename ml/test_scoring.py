"""Regression tests for the verdict logic.

    python -m pytest ml/test_scoring.py -q
    python ml/test_scoring.py            # runs without pytest too

WHY THESE EXIST
Testing found the system AUTO-APPROVING attack #4 — "a different tree
photographed at the correct GPS" — at 75/100, because a plain weighted sum let
location, liveness and growth compensate for a scene_match of zero. That is the
one attack the AI is actually responsible for, and the one error class that is
fatal rather than annoying.

The fix was CRITICAL_FLOORS. These tests pin it down, because the weights are
going to be refitted by calibrate.py after every check-in round and a refit must
never quietly reintroduce the hole.

The floors are placed between two MEASURED cases:
    genuine, dense same-species stand -> scene_match ~0.19  must stay verified
    a different tree entirely         -> scene_match  0.00  must not
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from greenproof_ml.scoring import (  # noqa: E402
    PLANT_SIMILARITY_MIN,
    PROXIMITY_REVIEW_M,
    assess,
    check_plant_plausibility,
    check_proximity,
    gate_duplicate,
    gate_gps,
    gate_travel,
    score_growth,
    score_liveness,
    score_location,
    score_scene,
)
from greenproof_ml.signals import liveness_score  # noqa: E402

NOW = datetime(2026, 8, 8, 10, 0, tzinfo=timezone.utc)
LAT, LNG = 5.65050, -0.19620

CLEAN = "0" * 16
FAR = "f" * 16  # 64 bits different — nothing like any stored photo


def build(
    *,
    dist_m=4.0,
    green=0.42,
    cos_w=0.68,
    cos_c=0.60,
    duplicate_of=FAR,
    accuracy=6.0,
    prev_travel=None,
    first_visit=False,
    canopy=0.42,
    canopy_prev=0.40,
):
    gates = {
        "duplicate_image": gate_duplicate(CLEAN, [("other", duplicate_of)]),
        "gps_radius": gate_gps(LAT, LNG, LAT + dist_m / 111_320, LNG, accuracy),
        "travel_speed": gate_travel(LAT, LNG, NOW, prev_travel),
    }
    scores = {
        "location": score_location(dist_m),
        "liveness": score_liveness(green, liveness_score(green)),
        "growth": score_growth(canopy, None if first_visit else canopy_prev),
    }
    if not first_visit:
        scores["scene_match"] = score_scene(cos_w, cos_c, 0)
    return assess(gates, scores)


# ---------------------------------------------------------------------------
# Genuine visits must never be auto-rejected
# ---------------------------------------------------------------------------


def test_healthy_tree_is_verified():
    assert build().verdict == "verified"


def test_first_visit_is_verified_despite_no_scene_match():
    # A registration has nothing to compare against. Penalising it for being
    # first would flag all 40 trees on T0.
    r = build(first_visit=True)
    assert r.verdict == "verified"


def test_poor_but_usable_gps_still_verifies():
    assert build(dist_m=18.0, accuracy=15.0).verdict == "verified"


def test_dense_stand_weak_match_still_verifies():
    """THE IMPORTANT ONE.

    The spike measured image matching as near-zero inside a dense stand of one
    species. If a weak-but-real match were vetoed, every tree in a plantation
    would go to a human — destroying the scalability claim that we need ~5,000
    reviews where Greenstand needs 100,000.
    """
    r = build(cos_w=0.44, cos_c=0.40)
    assert r.verdict == "verified", r.signals


def test_dry_season_leaf_drop_still_verifies():
    assert build(green=0.22, canopy=0.22, canopy_prev=0.26).verdict == "verified"


# ---------------------------------------------------------------------------
# Fraud must never be auto-approved
# ---------------------------------------------------------------------------


def test_duplicate_photo_is_flagged():
    r = build(duplicate_of=CLEAN)
    assert r.verdict == "flagged"
    assert r.confidence == 0
    assert "duplicate_image" in r.signals["failed_gates"]


def test_wrong_location_is_flagged():
    r = build(dist_m=200.0)
    assert r.verdict == "flagged"
    assert "gps_radius" in r.signals["failed_gates"]


def test_impossible_travel_is_flagged():
    r = build(prev_travel=("prev", 8.0, -1.0, NOW - timedelta(minutes=5)))
    assert r.verdict == "flagged"
    assert "travel_speed" in r.signals["failed_gates"]


def test_dead_plant_is_not_auto_approved():
    r = build(green=0.01, canopy=0.01)
    assert r.verdict != "verified", r.signals


def test_different_tree_at_correct_gps_is_not_auto_approved():
    """THE REGRESSION THIS FILE EXISTS FOR.

    Every gate passes. Location, liveness and growth are perfect. Only the
    scene match fails. Before CRITICAL_FLOORS this scored 75/100 and was
    auto-approved — a false accept on the single attack that needs the AI.
    """
    r = build(cos_w=0.30, cos_c=0.28)
    assert r.verdict != "verified", r.signals
    assert "scene_match" in r.signals.get("auto_approval_vetoed_by", [])


# ---------------------------------------------------------------------------
# Degrade, don't break
# ---------------------------------------------------------------------------


def _gates_all_pass():
    return {
        "duplicate_image": gate_duplicate(CLEAN, [("o", FAR)]),
        "gps_radius": gate_gps(LAT, LNG, LAT, LNG, 8.0),
        "travel_speed": gate_travel(LAT, LNG, NOW, None),
    }


def test_confidence_falls_as_signals_disappear():
    g = _gates_all_pass()
    full = {
        "location": score_location(3),
        "liveness": score_liveness(0.45, liveness_score(0.45)),
        "scene_match": score_scene(0.70, 0.65, 0),
        "growth": score_growth(0.45, 0.43),
    }
    a = assess(g, full).confidence
    b = assess(g, {k: full[k] for k in ("location", "liveness")}).confidence
    c = assess(g, {"location": full["location"]}).confidence
    assert a > b > c, (a, b, c)


def test_single_signal_cannot_auto_approve():
    r = assess(_gates_all_pass(), {"location": score_location(2)})
    assert r.verdict != "verified"
    assert "coverage" in r.signals.get("auto_approval_vetoed_by", [])


def test_gate_failure_overrides_perfect_scores():
    g = _gates_all_pass()
    g["duplicate_image"] = gate_duplicate(CLEAN, [("o", CLEAN)])
    r = assess(
        g,
        {
            "location": score_location(1),
            "liveness": score_liveness(0.6, liveness_score(0.6)),
            "scene_match": score_scene(0.9, 0.9, 0),
            "growth": score_growth(0.5, 0.5),
        },
    )
    assert r.verdict == "flagged"
    assert r.confidence == 0


# ---------------------------------------------------------------------------
# Proximity — one physical tree registered twice
#
# The pilot produced this for real: the same trunk was photographed twice and
# became two tree rows, because nothing looked. These tests are the regression.
# ---------------------------------------------------------------------------


def _offset(metres):
    """A latitude `metres` north of LAT."""
    return LAT + metres / 111_320


def test_proximity_no_earlier_trees_is_clean():
    assert check_proximity(LAT, LNG, []).passed


def test_proximity_distant_tree_is_clean():
    assert check_proximity(LAT, LNG, [("t1", _offset(40), LNG)]).passed


def test_proximity_same_spot_is_flagged_for_review():
    r = check_proximity(LAT, LNG, [("t1", _offset(2), LNG)])
    assert not r.passed
    assert r.detail["nearest_tree"] == "t1"
    assert r.detail["nearest_distance_m"] <= 3


def test_proximity_reports_the_nearest_of_several():
    r = check_proximity(
        LAT, LNG, [("far", _offset(30), LNG), ("near", _offset(3), LNG)]
    )
    assert not r.passed
    assert r.detail["nearest_tree"] == "near"


def test_proximity_boundary_is_exclusive():
    """Exactly at the radius passes; inside it does not. Pins the comparison so
    a later > / >= slip cannot silently change what the pilot data means."""
    assert check_proximity(LAT, LNG, [("t", _offset(PROXIMITY_REVIEW_M + 1), LNG)]).passed
    assert not check_proximity(LAT, LNG, [("t", _offset(PROXIMITY_REVIEW_M - 1), LNG)]).passed


def test_proximity_demotes_verified_to_review_not_flagged():
    """The whole point: a suspected duplicate is a HUMAN LOOK, not an accusation.
    Trees really do grow 3 m apart and GPS cannot tell the difference."""
    good = dict(
        gates={
            "duplicate_image": gate_duplicate(CLEAN, [("o", FAR)]),
            "gps_radius": gate_gps(LAT, LNG, LAT, LNG, 4.0),
            "travel_speed": gate_travel(LAT, LNG, NOW, None),
        },
        scores={
            "location": score_location(1.0),
            "liveness": score_liveness(0.45, liveness_score(0.45)),
            "scene_match": score_scene(0.9, 0.9, 0),
            "growth": score_growth(0.5, 0.5),
        },
    )
    clean = assess(**good)
    assert clean.verdict == "verified", "fixture must verify without the flag"

    flagged = assess(
        **good,
        review_flags={"tree_proximity": check_proximity(LAT, LNG, [("t1", _offset(2), LNG)])},
    )
    assert flagged.verdict == "review"
    assert flagged.confidence > 0, "a review flag must not zero the confidence"
    assert "tree_proximity" in flagged.signals["auto_approval_vetoed_by"]
    assert flagged.signals["review_flags"]["tree_proximity"]["nearest_tree"] == "t1"


def test_proximity_flag_absent_when_clear():
    r = assess(
        gates={
            "duplicate_image": gate_duplicate(CLEAN, [("o", FAR)]),
            "gps_radius": gate_gps(LAT, LNG, LAT, LNG, 4.0),
            "travel_speed": gate_travel(LAT, LNG, NOW, None),
        },
        scores={
            "location": score_location(1.0),
            "liveness": score_liveness(0.45, liveness_score(0.45)),
            "scene_match": score_scene(0.9, 0.9, 0),
            "growth": score_growth(0.5, 0.5),
        },
        review_flags={"tree_proximity": check_proximity(LAT, LNG, [])},
    )
    assert r.verdict == "verified"


# ---------------------------------------------------------------------------
# Plant plausibility - "is this even a plant?"
# ---------------------------------------------------------------------------


def _ref():
    """Two unit vectors standing in for the reference set."""
    import numpy as np

    v = np.eye(2, 384, dtype=np.float32)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def _vec(sim):
    """A unit vector whose similarity to reference row 0 is `sim`."""
    import numpy as np

    v = np.zeros(384, dtype=np.float32)
    v[0] = sim
    v[2] = (1 - sim**2) ** 0.5
    return v


def test_plant_check_passes_a_plant_like_photo():
    r = check_plant_plausibility(_vec(0.9), _vec(0.9), _ref())
    assert r.passed and r.detail["available"]


def test_plant_check_flags_a_chair():
    r = check_plant_plausibility(_vec(0.05), _vec(0.05), _ref())
    assert not r.passed


def test_plant_check_uses_the_worse_of_the_two_photos():
    """A real tree wide shot with something else in the close-up must not pass:
    otherwise half the evidence can be swapped out freely."""
    r = check_plant_plausibility(_vec(0.95), _vec(0.05), _ref())
    assert not r.passed
    assert r.detail["close_similarity"] < r.detail["wide_similarity"]


def test_plant_check_missing_reference_degrades_rather_than_rejecting():
    """No reference file must never cost a real planter their tree."""
    r = check_plant_plausibility(_vec(0.9), _vec(0.9), None)
    assert r.passed and r.detail["available"] is False


def test_plant_check_boundary_matches_the_documented_threshold():
    assert check_plant_plausibility(_vec(PLANT_SIMILARITY_MIN + 0.02),
                                    _vec(PLANT_SIMILARITY_MIN + 0.02), _ref()).passed
    assert not check_plant_plausibility(_vec(PLANT_SIMILARITY_MIN - 0.02),
                                        _vec(PLANT_SIMILARITY_MIN - 0.02), _ref()).passed


def test_plant_check_demotes_to_review_not_flagged():
    """A chair is a mistake or a fraud attempt, but a human decides - the same
    reasoning as the proximity check."""
    good = dict(
        gates={
            "duplicate_image": gate_duplicate(CLEAN, [("o", FAR)]),
            "gps_radius": gate_gps(LAT, LNG, LAT, LNG, 4.0),
            "travel_speed": gate_travel(LAT, LNG, NOW, None),
        },
        scores={
            "location": score_location(1.0),
            "liveness": score_liveness(0.45, liveness_score(0.45)),
            "scene_match": score_scene(0.9, 0.9, 0),
            "growth": score_growth(0.5, 0.5),
        },
    )
    assert assess(**good).verdict == "verified"
    r = assess(**good, review_flags={
        "plant_plausibility": check_plant_plausibility(_vec(0.05), _vec(0.05), _ref())})
    assert r.verdict == "review"
    assert r.confidence > 0
    assert "plant_plausibility" in r.signals["auto_approval_vetoed_by"]


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
        except AssertionError as e:
            failed += 1
            print(f"  FAIL  {fn.__name__}: {e}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
