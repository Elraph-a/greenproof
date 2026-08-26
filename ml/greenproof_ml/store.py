"""All database and storage access, in one place.

Runs with the SERVICE ROLE key, which bypasses RLS and the column grants. That
is the whole security model in one sentence: the browser physically cannot write
`confidence`, `verdict` or `signals` because those columns are not granted to
`authenticated`, and this service is the only thing holding a key that can.

The service key must never reach the frontend. It lives only in the Hugging Face
Space's secrets.
"""

from __future__ import annotations

import io
import math
import os
from datetime import datetime, timezone

import numpy as np
from PIL import Image
from supabase import Client, create_client

BUCKET = "tree-photos"


def _client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. "
            "On Hugging Face Spaces these go in Settings -> Variables and secrets."
        )
    return create_client(url, key)


_db: Client | None = None


def db() -> Client:
    global _db
    if _db is None:
        _db = _client()
    return _db


def parse_ts(value: str) -> datetime:
    """Postgres timestamptz -> aware datetime.

    Postgres emits '+00:00' or a 6-digit fractional second; Python's fromisoformat
    is fussy about 'Z' on older versions. Normalising here stops a timezone bug
    from silently turning the travel-speed gate into nonsense.
    """
    v = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(v)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def vector_literal(v: np.ndarray) -> str:
    """pgvector wants '[0.1,0.2,...]' as text, not a JSON array."""
    return "[" + ",".join(f"{x:.6f}" for x in v.tolist()) + "]"


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


def get_checkin(checkin_id: str) -> dict | None:
    r = db().table("checkins").select("*").eq("id", checkin_id).limit(1).execute()
    return r.data[0] if r.data else None


def get_tree(tree_id: str) -> dict | None:
    r = db().table("trees").select("*").eq("id", tree_id).limit(1).execute()
    return r.data[0] if r.data else None


def list_pending(limit: int = 50) -> list[dict]:
    r = (
        db()
        .table("checkins")
        .select("id")
        .eq("verdict", "pending")
        .order("server_received_at", desc=False)
        .limit(limit)
        .execute()
    )
    return r.data or []


def other_phashes(exclude_checkin_id: str) -> list[tuple[str, str]]:
    """Every other check-in's pHash, for the duplicate gate.

    Deliberately global, not scoped to this tree: submitting tree 7's photo as
    tree 12's check-in is one of the attacks, and scoping the search to tree 12
    would miss it entirely.
    """
    r = (
        db()
        .table("checkins")
        .select("id, phash")
        .not_.is_("phash", "null")
        .neq("id", exclude_checkin_id)
        .execute()
    )
    return [(row["id"], row["phash"]) for row in (r.data or []) if row.get("phash")]


def trees_near_registered_before(
    tree_id: str,
    lat: float,
    lng: float,
    before_iso: str,
    radius_m: float,
) -> list[tuple[str, float, float]]:
    """Trees within `radius_m` that were registered BEFORE this one.

    Across all owners: one physical tree registered by two different people is
    the double-payment case, and scoping this to the owner would miss exactly
    that.

    A bounding box does the elimination in Postgres and the true distance is
    measured here. PostGIS is available and `trees.location` is indexed, but
    reaching it needs a SQL function; the box uses the plain lat/lng columns and
    is correct because the caller re-measures. At pilot scale the difference is
    unmeasurable — the box is there so this does not become a full table scan
    when the grove is 40,000 trees rather than 40.
    """
    d_lat = radius_m / 111_320.0
    d_lng = radius_m / max(111_320.0 * math.cos(math.radians(lat)), 1e-6)

    r = (
        db()
        .table("trees")
        .select("id, lat, lng")
        .gte("lat", lat - d_lat)
        .lte("lat", lat + d_lat)
        .gte("lng", lng - d_lng)
        .lte("lng", lng + d_lng)
        .lt("created_at", before_iso)
        .neq("id", tree_id)
        .execute()
    )
    return [(row["id"], row["lat"], row["lng"]) for row in (r.data or [])]


def previous_checkins(tree_id: str, before_iso: str) -> list[dict]:
    """Earlier visits to this tree, newest first, with embeddings."""
    r = (
        db()
        .table("checkins")
        .select(
            "id, wide_photo, close_photo, captured_at, wide_embedding, "
            "close_embedding, signals, verdict"
        )
        .eq("tree_id", tree_id)
        .lt("captured_at", before_iso)
        .order("captured_at", desc=True)
        .execute()
    )
    return r.data or []


def previous_by_submitter(
    submitter_id: str, before_iso: str, exclude_checkin_id: str
) -> dict | None:
    """The submitter's most recent check-in anywhere — for the travel gate."""
    r = (
        db()
        .table("checkins")
        .select("id, lat, lng, captured_at")
        .eq("submitted_by", submitter_id)
        .lt("captured_at", before_iso)
        .neq("id", exclude_checkin_id)
        .order("captured_at", desc=True)
        .limit(1)
        .execute()
    )
    return r.data[0] if r.data else None


def download_image(path: str) -> Image.Image:
    raw = db().storage.from_(BUCKET).download(path)
    return Image.open(io.BytesIO(raw))


def parse_embedding(value) -> np.ndarray | None:
    """pgvector comes back as either a string literal or a list, depending on
    the PostgREST version. Handle both rather than discovering it at 2am."""
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip().strip("[]")
        if not value:
            return None
        return np.fromstring(value, sep=",", dtype=np.float32)
    return np.asarray(value, dtype=np.float32)


# ---------------------------------------------------------------------------
# Writes — only this process may perform them
# ---------------------------------------------------------------------------


def write_result(
    checkin_id: str,
    *,
    phash: str,
    wide_embedding: np.ndarray,
    close_embedding: np.ndarray,
    confidence: int,
    verdict: str,
    signals: dict,
    audit_sample: bool = False,
) -> None:
    db().table("checkins").update(
        {
            "phash": phash,
            "wide_embedding": vector_literal(wide_embedding),
            "close_embedding": vector_literal(close_embedding),
            "confidence": confidence,
            "verdict": verdict,
            "signals": signals,
            "audit_sample": audit_sample,
        }
    ).eq("id", checkin_id).execute()


def write_advice(checkin_id: str, species_guess: dict, advice: dict) -> None:
    """Store the advisory assessment.

    Writes ONLY the two advisory columns. It does not touch `confidence`,
    `verdict` or `signals`, and that separation is the whole point: advice is
    generated by a component whose error rate we have not measured, so it must
    not be able to move a number we publish.

    Note this is a separate write from write_result rather than a parameter on
    it. Scoring is replayable and re-run whenever a threshold changes; advice is
    a paid external call that should survive a re-score untouched. Folding the
    two together would either destroy advice on every recalibration or make
    recalibration cost money.
    """
    db().table("checkins").update(
        {"species_guess": species_guess, "advice": advice}
    ).eq("id", checkin_id).execute()


def list_checkins_without_advice(limit: int = 100) -> list[dict]:
    """Check-ins that have never been assessed, oldest first."""
    r = (
        db()
        .table("checkins")
        .select("id")
        .is_("advice", "null")
        .order("server_received_at", desc=False)
        .limit(limit)
        .execute()
    )
    return r.data or []


def update_tree_status(tree_id: str, confidence: int, verdict: str) -> None:
    """Roll the latest verdict up onto the tree.

    'alive' only on a verified check-in. A tree never becomes 'dead'
    automatically — that is a human decision, because being wrong about it stops
    someone's payment.
    """
    status = {
        "verified": "alive",
        "review": "pending",
        "flagged": "flagged",
    }.get(verdict, "pending")

    db().table("trees").update(
        {"status": status, "current_confidence": confidence}
    ).eq("id", tree_id).execute()
