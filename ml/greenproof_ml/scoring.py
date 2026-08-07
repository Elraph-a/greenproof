"""Combining the detectors into a confidence and a verdict.

TWO-STAGE BY DESIGN.

    Stage 1 — GATES. Disqualifying on their own, regardless of anything else.
              A duplicate photo is a duplicate photo; no amount of scene
              similarity should rescue it. Gates run BEFORE scoring so a
              failure is cheap and unambiguous.

    Stage 2 — SCORES. Continuous 0..1 signals, combined by weights, producing a
              confidence out of 100.

This ordering is the reason the system's overall accuracy is far better than the
54% rank-1 of image matching alone: five of the six fraud types in the attack set
never reach stage 2.

THRESHOLDS AND WEIGHTS BELOW ARE PROVISIONAL. They are informed guesses that let
the pipeline run end-to-end from day one. They are replaced by weights fitted
with logistic regression under leave-one-tree-out cross-validation once real
check-in rounds exist — see calibrate.py. Reporting a number produced by
hand-tuned weights on the same data would be exactly the mistake CLAUDE.md
forbids.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from .signals import DUPLICATE_MAX_HAMMING, haversine_m, hamming

# --- gate parameters -------------------------------------------------------

# How far from the registered point a check-in may be.
# Built from the GPS accuracy of BOTH readings plus a slack term, rather than a
# flat radius: a ±3 m fix and a ±18 m fix genuinely deserve different tolerances,
# and a flat number would either reject good check-ins under canopy or wave
# through bad ones in the open.
GPS_SLACK_M = 15.0
GPS_MAX_RADIUS_M = 60.0

# Nobody walks a plantation at 120 km/h. Catches one account submitting
# check-ins from two places faster than a human could travel between them.
MAX_TRAVEL_KMH = 120.0

# --- score shaping ---------------------------------------------------------

LOCATION_FULL_M = 10.0  # at or under this, full marks
LOCATION_ZERO_M = 60.0  # at or over this, nothing

SCENE_COSINE_FLOOR = 0.35  # below this, no evidence of the same scene
SCENE_COSINE_CEIL = 0.75  # at or above, as good as same-scene gets
ORB_INLIER_STRONG = 25  # inliers that would count as strong agreement

# ORB/RANSAC IS MEASURED AND DISABLED. Do not switch this on without re-running
# the measurement.
#
# Tested on the 59 spike photos, 287 pairs (87 same-tree, 200 different-tree):
#
#     same tree       63.2% zero inliers, mean 1.7, max 8
#     different tree  75.0% zero inliers, mean 1.1, max 6
#
# The distributions overlap almost entirely. ORB finds no consistent geometry
# between two genuine photos of the same tree taken minutes apart from slightly
# different positions — foliage moves, and bark at two scales shares almost no
# repeatable keypoints. Leaving it in the score would have added up to +0.08 of
# essentially random confidence, which helps an impostor as readily as a genuine
# visit.
#
# It stays COMPUTED and recorded in `signals` so the decision can be revisited
# with real data, because the spike had no framing control. The ghost overlay
# and compass heading exist precisely to reproduce framing, and ORB may become
# viable once check-in round 1 produces aligned pairs. Re-measure then; turn it
# on only if the same/different distributions actually separate.
ORB_CONTRIBUTES_TO_SCORE = False

# --- combination -----------------------------------------------------------

# Deliberately NOT equal. Image matching is the weakest signal we measured
# (rank-1 54%, AUC 0.77, and bimodal), so it must not dominate. Location and
# liveness are cheap, deterministic and reliable — they carry more.
DEFAULT_WEIGHTS: dict[str, float] = {
    "location": 0.35,
    "liveness": 0.30,
    "scene_match": 0.25,
    "growth": 0.10,
}

VERIFY_AT = 70
REVIEW_AT = 45

# ---------------------------------------------------------------------------
# CRITICAL FLOORS — the fix for a false accept found in testing
# ---------------------------------------------------------------------------
#
# A plain weighted sum lets strong signals COMPENSATE for a failed one. Tested
# against "a different tree photographed at the correct GPS" — attack #4, the
# one case that genuinely needs the AI — the result was:
#
#     scene_match 0.00, location 1.00, liveness 1.00, growth 1.00
#     -> 75/100 -> VERIFIED
#
# The system auto-approved the exact fraud it exists to catch, because
# scene_match carries only 0.25 of the weight and the other three were perfect.
# Compensation is correct for a quality score and wrong for a fraud decision.
#
# So a signal that is present and near-zero VETOES auto-approval. It does not
# flag the visit — it routes it to a human, which is the honest response to
# "this looks wrong but we are not certain". Confidence is still reported
# unchanged so the disagreement stays visible in the data.
#
# Floors are set BELOW the genuine weak case and ABOVE the fraud case, measured:
#   dense same-species stand, genuine  -> scene_match ~0.19   (must still pass)
#   different tree entirely            -> scene_match  0.00   (must be capped)
CRITICAL_FLOORS: dict[str, float] = {
    "liveness": 0.20,
    "scene_match": 0.12,
}

# Auto-approval also requires enough of the signal set to have been available.
# One signal out of four is not a verification, however good that signal is.
MIN_COVERAGE_TO_VERIFY = 0.50

MODEL_NAME = "dinov2-small-onnx"
MODEL_VERSION = "2026.08.1"


@dataclass
class GateResult:
    passed: bool
    detail: dict


@dataclass
class Assessment:
    confidence: int
    verdict: str
    signals: dict = field(default_factory=dict)


def _ramp(value: float, full: float, zero: float) -> float:
    """1.0 at `full`, 0.0 at `zero`, linear between. Handles either direction."""
    if full == zero:
        return 1.0 if value <= full else 0.0
    t = (value - zero) / (full - zero)
    return float(min(1.0, max(0.0, t)))


# ---------------------------------------------------------------------------
# Gates
# ---------------------------------------------------------------------------


def gate_duplicate(this_phash: str, others: list[tuple[str, str]]) -> GateResult:
    """others: (checkin_id, phash) for every OTHER check-in in the system."""
    nearest_id, nearest = None, 64
    for cid, ph in others:
        if not ph:
            continue
        d = hamming(this_phash, ph)
        if d < nearest:
            nearest, nearest_id = d, cid

    passed = nearest > DUPLICATE_MAX_HAMMING
    return GateResult(
        passed,
        {
            "passed": passed,
            "nearest_phash_distance": nearest,
            **({"matched_checkin": nearest_id} if not passed and nearest_id else {}),
        },
    )


def gate_gps(
    tree_lat: float,
    tree_lng: float,
    lat: float,
    lng: float,
    accuracy_m: float | None,
    registration_accuracy_m: float | None = None,
) -> GateResult:
    dist = haversine_m(tree_lat, tree_lng, lat, lng)
    allowed = min(
        GPS_MAX_RADIUS_M,
        GPS_SLACK_M + (accuracy_m or 0.0) + (registration_accuracy_m or 0.0),
    )
    passed = dist <= allowed
    return GateResult(
        passed,
        {"passed": passed, "distance_m": round(dist, 1), "allowed_m": round(allowed, 1)},
    )


def gate_travel(
    lat: float,
    lng: float,
    captured_at: datetime,
    previous: tuple[str, float, float, datetime] | None,
) -> GateResult:
    """previous: the same submitter's most recent check-in elsewhere."""
    if previous is None:
        return GateResult(True, {"passed": True})

    pid, plat, plng, pat = previous
    seconds = abs((captured_at - pat).total_seconds())
    if seconds < 1:
        # Two check-ins at the same instant from different places is itself
        # impossible; treat as a failure rather than dividing by ~zero.
        metres = haversine_m(plat, plng, lat, lng)
        passed = metres < 50
        return GateResult(passed, {"passed": passed, "kmh": None, "from_checkin": pid})

    kmh = (haversine_m(plat, plng, lat, lng) / seconds) * 3.6
    passed = kmh <= MAX_TRAVEL_KMH
    return GateResult(
        passed, {"passed": passed, "kmh": round(kmh, 1), "from_checkin": pid}
    )


# ---------------------------------------------------------------------------
# Scores
# ---------------------------------------------------------------------------


def score_location(distance_m: float) -> dict:
    return {
        "score": _ramp(distance_m, LOCATION_FULL_M, LOCATION_ZERO_M),
        "distance_m": round(distance_m, 1),
    }


def score_liveness(green_fraction: float, mapped: float) -> dict:
    return {"score": mapped, "excess_green": round(green_fraction, 4)}


def score_scene(
    cosine_wide: float | None,
    cosine_close: float | None,
    inliers: int | None,
) -> dict:
    """Corroboration, never identity.

    The wide shot is weighted above the close-up because the spike showed
    matching works substantially off the surrounding scene, and young bark is
    smooth and far less distinctive than mature bark — BarkNet's ~94% figures
    are on MATURE bark and do not transfer to a two-year-old sapling.

    ORB inliers are RECORDED BUT DO NOT AFFECT THE SCORE — see
    ORB_CONTRIBUTES_TO_SCORE above for the measurement that produced that
    decision. Reporting a signal we have shown to be non-discriminating would be
    exactly the unfounded assertion this project exists to avoid.
    """
    parts: list[tuple[float, float]] = []
    if cosine_wide is not None:
        parts.append((_ramp(-cosine_wide, -SCENE_COSINE_CEIL, -SCENE_COSINE_FLOOR), 0.6))
    if cosine_close is not None:
        parts.append((_ramp(-cosine_close, -SCENE_COSINE_CEIL, -SCENE_COSINE_FLOOR), 0.4))

    base = (
        sum(v * w for v, w in parts) / sum(w for _, w in parts) if parts else 0.0
    )

    if inliers and ORB_CONTRIBUTES_TO_SCORE:
        base = min(1.0, base + 0.25 * min(1.0, inliers / ORB_INLIER_STRONG))

    out: dict = {"score": round(base, 4)}
    if cosine_wide is not None:
        out["cosine_wide"] = round(cosine_wide, 4)
    if cosine_close is not None:
        out["cosine_close"] = round(cosine_close, 4)
    if inliers is not None:
        out["orb_inliers"] = int(inliers)
    return out


def score_growth(
    canopy_now: float | None,
    canopy_prev: float | None,
    trunk_mm: float | None = None,
    trunk_prev_mm: float | None = None,
) -> dict:
    """Plausibility, not measurement.

    Trunk diameter barely moves in four weeks on a young tree, so this signal
    cannot demonstrate growth and we do not claim it does. Its job is catching
    the IMPOSSIBLE: a trunk that shrank, a seedling that became a mature tree
    overnight, a canopy that vanished.

    With no prior visit there is nothing to compare, so it returns a neutral 0.5
    rather than 0 — a first check-in must not be penalised for being first.
    """
    out: dict = {}
    if canopy_now is not None:
        out["canopy_frac"] = round(canopy_now, 4)
    if trunk_mm is not None:
        out["trunk_mm"] = round(trunk_mm, 1)

    if canopy_prev is None and trunk_prev_mm is None:
        out["score"] = 0.5
        return out

    score = 1.0

    if canopy_now is not None and canopy_prev is not None:
        delta = canopy_now - canopy_prev
        # Losing more than half the canopy in one interval is the dying-tree
        # signal. Real, and exactly what we want surfaced for review.
        if canopy_prev > 0.02 and delta / canopy_prev < -0.5:
            score = min(score, 0.15)
        # Tripling canopy in days means the framing changed or it is a
        # different plant.
        elif canopy_prev > 0.02 and delta / canopy_prev > 2.0:
            score = min(score, 0.3)

    if trunk_mm is not None and trunk_prev_mm is not None:
        out["delta_mm"] = round(trunk_mm - trunk_prev_mm, 1)
        # A trunk cannot shrink. Allow 3mm for measurement error.
        if trunk_mm < trunk_prev_mm - 3:
            score = min(score, 0.1)
        # No young tree gains 30mm of diameter in a check-in interval.
        elif trunk_mm > trunk_prev_mm + 30:
            score = min(score, 0.2)

    out["score"] = score
    return out


# ---------------------------------------------------------------------------
# Combination
# ---------------------------------------------------------------------------


def assess(
    gates: dict[str, GateResult],
    scores: dict[str, dict],
    weights: dict[str, float] | None = None,
) -> Assessment:
    w = dict(weights or DEFAULT_WEIGHTS)

    signals: dict = {
        "gates": {k: v.detail for k, v in gates.items()},
        "scores": scores,
        "weights": w,
        "model": {"name": MODEL_NAME, "version": MODEL_VERSION},
    }

    failed = [k for k, v in gates.items() if not v.passed]
    if failed:
        # Fail closed. A gate failure is not a low score, it is a
        # disqualification, and reporting a partial confidence next to it would
        # invite someone to override it.
        signals["failed_gates"] = failed
        return Assessment(0, "flagged", signals)

    # Renormalise over the signals we actually have. A missing signal must lower
    # confidence, never silently count as zero — "designed to degrade, not
    # break" means an absent compass or a first visit routes to a human rather
    # than being scored as fraud.
    present = {k: v for k, v in w.items() if k in scores and "score" in scores[k]}
    if not present:
        return Assessment(0, "review", signals)

    total_w = sum(present.values())
    raw = sum(scores[k]["score"] * wt for k, wt in present.items()) / total_w

    # Coverage penalty: if only half the weight was available, cap confidence
    # accordingly instead of pretending a partial assessment is a full one.
    coverage = total_w / sum(w.values())
    confidence = int(round(100 * raw * (0.6 + 0.4 * coverage)))

    signals["coverage"] = round(coverage, 3)

    if confidence >= VERIFY_AT:
        verdict = "verified"
    elif confidence >= REVIEW_AT:
        verdict = "review"
    else:
        verdict = "flagged"

    # --- veto: no compensating away a failed critical signal ---------------
    vetoes = [
        name
        for name, floor in CRITICAL_FLOORS.items()
        if name in scores and scores[name].get("score", 1.0) < floor
    ]
    if coverage < MIN_COVERAGE_TO_VERIFY:
        vetoes.append("coverage")

    if vetoes and verdict == "verified":
        verdict = "review"
        signals["auto_approval_vetoed_by"] = vetoes

    return Assessment(confidence, verdict, signals)
