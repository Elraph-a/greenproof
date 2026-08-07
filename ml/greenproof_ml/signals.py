"""The individual detectors.

Each is deliberately small, pure and independently testable. Five of the six
fraud types in the attack set are caught here by ordinary deterministic code —
not by the neural network — and that is the honest reason the system works.
"""

from __future__ import annotations

import math

import cv2
import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Perceptual hash — the duplicate detector
# ---------------------------------------------------------------------------

PHASH_SIZE = 32
PHASH_LOW = 8


def phash(img: Image.Image) -> str:
    """64-bit DCT perceptual hash, as 16 hex characters.

    Catches: resubmitting an identical photo, an old gallery photo of the same
    tree, and a photo pulled off the internet that someone else also used.

    DCT-based rather than average-hash because it survives the JPEG
    re-compression the phone applies on resize, while still differing across
    genuinely different photos. A re-saved copy of the same shot lands within a
    couple of bits; two real photos of the same tree a week apart are typically
    20+ bits apart.
    """
    a = np.asarray(img.convert("L").resize((PHASH_SIZE, PHASH_SIZE), Image.BICUBIC), dtype=np.float32)
    d = cv2.dct(a)[:PHASH_LOW, :PHASH_LOW]

    # Exclude the DC term from the median: it carries overall brightness, which
    # would otherwise drag the threshold around with the weather.
    flat = d.flatten()[1:]
    bits = (d.flatten() > np.median(flat)).astype(np.uint8)

    out = 0
    for bit in bits:
        out = (out << 1) | int(bit)
    return f"{out:016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


# Below this many differing bits, treat two photos as the same image.
# Provisional — recalibrate from the T0/round-1 distribution of genuine
# same-tree pairs, which must sit comfortably ABOVE it.
DUPLICATE_MAX_HAMMING = 6


# ---------------------------------------------------------------------------
# Liveness — is this a living plant at all?
# ---------------------------------------------------------------------------


def excess_green(img: Image.Image) -> float:
    """Fraction of the frame that reads as living vegetation.

    ExG = 2G - R - B on channels normalised per-pixel, which is the standard
    agronomy vegetation index for ordinary RGB cameras. Per-pixel normalisation
    is what makes it survive Ghanaian midday sun and deep shade in the same
    frame — an absolute green threshold would not.

    Catches: photographing a dead brown stick, a plank, or the ground.
    It does NOT prove the plant is the right plant. That is a different signal.
    """
    a = np.asarray(img.convert("RGB").resize((256, 256), Image.BILINEAR), dtype=np.float32)
    total = a.sum(axis=2) + 1e-6
    r, g, b = a[..., 0] / total, a[..., 1] / total, a[..., 2] / total
    exg = 2 * g - r - b
    # 0.05 is the conventional cut for "this pixel is vegetation".
    return float((exg > 0.05).mean())


def liveness_score(frac: float) -> float:
    """Map green fraction to 0..1.

    A healthy young tree in a wide shot typically fills 0.25-0.6 of the frame
    with vegetation; below ~0.05 there is essentially nothing living in view.
    Ramped rather than stepped so a leaf-dropping tree degrades smoothly instead
    of falling off a cliff — the point is to flag decline, not to fail it.
    """
    return float(np.clip((frac - 0.05) / (0.30 - 0.05), 0.0, 1.0))


# ---------------------------------------------------------------------------
# Scene match — ORB + RANSAC, corroborating the embedding
# ---------------------------------------------------------------------------


def orb_inliers(a: Image.Image, b: Image.Image, max_side: int = 640) -> int:
    """Count geometrically consistent keypoint matches between two photos.

    Complements the DINOv2 embedding rather than duplicating it. The embedding
    answers "does this look like the same kind of scene"; ORB+RANSAC answers
    "are the same physical points present in a consistent geometric arrangement".
    An attacker can find a visually similar tree far more easily than one that
    matches point-for-point.

    Returns 0 when there is no consistent geometry at all.
    """

    def prep(img: Image.Image) -> np.ndarray:
        g = np.asarray(img.convert("L"))
        h, w = g.shape
        s = max_side / max(h, w)
        if s < 1:
            g = cv2.resize(g, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
        return g

    ga, gb = prep(a), prep(b)
    orb = cv2.ORB_create(nfeatures=1500)
    ka, da = orb.detectAndCompute(ga, None)
    kb, db = orb.detectAndCompute(gb, None)
    if da is None or db is None or len(ka) < 8 or len(kb) < 8:
        return 0

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    raw = matcher.knnMatch(da, db, k=2)

    # Lowe's ratio test: keep a match only if it is clearly better than the
    # runner-up. Foliage produces enormous numbers of near-identical descriptors,
    # so without this the match list is almost entirely noise.
    good = [m for m, n in (p for p in raw if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < 8:
        return 0

    src = np.float32([ka[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kb[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    return 0 if mask is None else int(mask.sum())


# ---------------------------------------------------------------------------
# ArUco — turning a photo into millimetres
# ---------------------------------------------------------------------------

DEFAULT_MARKER_MM = 80.0


def find_aruco(img: Image.Image) -> dict | None:
    """Locate the reference marker and return millimetres-per-pixel.

    The marker solves two problems at once, which is why it beats holding up a
    coin or a ruler:

      * SCALE — its real edge length is known, so we get mm per pixel
      * TILT  — four corners of a known square let us see that the card was
                photographed at an angle. A plain rectangle cannot give this,
                and an uncorrected 30 degree tilt is a ~15% error in width.

    `tilt_ratio` near 1.0 means the card was square-on. Far from 1.0 means the
    measurement should be distrusted rather than silently accepted.
    """
    a = np.asarray(img.convert("L"))
    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    corners, ids, _ = cv2.aruco.ArucoDetector(d, cv2.aruco.DetectorParameters()).detectMarkers(a)
    if ids is None or len(corners) == 0:
        return None

    pts = corners[0].reshape(4, 2)
    sides = [float(np.linalg.norm(pts[i] - pts[(i + 1) % 4])) for i in range(4)]
    px = float(np.mean(sides))
    if px < 10:  # too small in frame to measure anything from
        return None

    return {
        "marker_id": int(ids.flatten()[0]),
        "side_px": px,
        "mm_per_px": DEFAULT_MARKER_MM / px,
        "tilt_ratio": float(min(sides) / max(sides)),
    }


def trunk_width_mm(img: Image.Image, taps: dict | None) -> dict | None:
    """Convert the user's two trunk-edge taps into millimetres.

    THIS IS THE ONLY PLACE MILLIMETRES ARE PRODUCED, and it runs server-side on
    purpose. The client sends where a finger touched; it never sends a width.
    Trunk width feeds the "a trunk cannot shrink" plausibility check, so a
    client-supplied width would let a forged request defeat that check.

    Requires the ArUco marker to be visible in the same frame — without a known
    reference length a photo has no scale at all, and a thin trunk photographed
    close up is pixel-for-pixel identical to a thick one photographed far away.

    Returns None when the marker is absent, which is a normal outcome: the visit
    still counts, the growth signal is simply unavailable and confidence drops
    via the coverage term rather than the check failing.
    """
    if not taps:
        return None

    marker = find_aruco(img)
    if marker is None:
        return {"available": False, "reason": "no marker detected"}

    try:
        lx, ly = float(taps["left"]["x"]), float(taps["left"]["y"])
        rx, ry = float(taps["right"]["x"]), float(taps["right"]["y"])
    except (KeyError, TypeError, ValueError):
        return {"available": False, "reason": "malformed taps"}

    w, h = img.size
    # Euclidean, not just horizontal: people rarely tap two points at exactly
    # the same height, and on a leaning trunk they should not.
    dx, dy = (rx - lx) * w, (ry - ly) * h
    px = math.hypot(dx, dy)

    out = {
        "available": True,
        "trunk_px": round(px, 1),
        "mm_per_px": round(marker["mm_per_px"], 5),
        "marker_id": marker["marker_id"],
        "tilt_ratio": round(marker["tilt_ratio"], 3),
        "trunk_mm": round(px * marker["mm_per_px"], 1),
    }

    # A badly tilted card means the marker's apparent width is foreshortened,
    # so mm-per-pixel is wrong and so is everything derived from it. Flag rather
    # than silently returning a confident wrong number.
    if marker["tilt_ratio"] < 0.80:
        out["suspect"] = "marker photographed at a steep angle; hold it flat"

    return out


# ---------------------------------------------------------------------------
# Canopy — the signal that actually moves in four weeks
# ---------------------------------------------------------------------------


def canopy_fraction(img: Image.Image) -> float:
    """Share of the wide shot occupied by vegetation.

    Unlike trunk diameter, this changes measurably in weeks: a stressed tree
    drops leaves, and July-August is the rainy season so a healthy tree is
    putting on leaf. This is the dying-tree detector, and it is why the pilot
    deliberately includes struggling trees.

    Only comparable BETWEEN VISITS when framing is reproduced — which is what
    the compass heading and the ghost overlay exist to achieve.
    """
    return excess_green(img)


# ---------------------------------------------------------------------------
# Travel plausibility
# ---------------------------------------------------------------------------


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
