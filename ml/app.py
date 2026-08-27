"""GreenProof verification service.

The ONE new surface in the stack. Everything else is Supabase called directly
from the browser; this exists because a client-computed verification result is
forgeable, so scoring has to happen somewhere the user cannot reach.

Runs on Hugging Face Spaces (Docker SDK). Host-agnostic: the same container
runs on a laptop, Cloud Run, or anywhere else that can run Docker.

    GET  /              service metadata
    GET  /health        liveness + whether the model is loaded
    POST /score         score one check-in by id
    POST /advise        species + care advice for one check-in (advisory only)
    POST /backfill      score every pending check-in (used after T0)
"""

from __future__ import annotations

import logging
import os
import secrets
import threading

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from greenproof_ml import embed as embed_mod
from greenproof_ml import store
from greenproof_ml.pipeline import score_checkin
from greenproof_ml.scoring import MODEL_NAME, MODEL_VERSION

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("greenproof")

app = FastAPI(title="GreenProof verification service", version=MODEL_VERSION)

# The PWA is served from Vercel, so this is a genuine cross-origin call.
# Set ALLOWED_ORIGINS to the Vercel URL in the Space's variables; the default
# is permissive so the pilot is never blocked by a CORS typo at 6am, and the
# endpoints carry no secrets a caller could extract — the service key stays
# server-side and every write is derived from stored photos, not from the
# request body.
origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_model_ready = threading.Event()


@app.on_event("startup")
def _warm() -> None:
    """Load the model in the background.

    Spaces health-check the container early. Blocking startup on a ~90 MB model
    download makes the Space look dead and get restarted, which restarts the
    download — a loop that has eaten whole afternoons.
    """

    def run() -> None:
        try:
            embed_mod.warm()
            _model_ready.set()
            log.info("model ready: %s %s", MODEL_NAME, MODEL_VERSION)
        except Exception:
            log.exception("model failed to load")

    threading.Thread(target=run, daemon=True).start()


class ScoreRequest(BaseModel):
    checkin_id: str = Field(..., description="checkins.id to score")


class ScoreResponse(BaseModel):
    checkin_id: str
    confidence: int
    verdict: str
    signals: dict


@app.get("/")
def root() -> dict:
    return {
        "service": "greenproof-verification",
        "model": MODEL_NAME,
        "version": MODEL_VERSION,
        "docs": "/docs",
    }


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "model_ready": _model_ready.is_set(),
        "supabase_configured": bool(
            os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")
        ),
    }


# Generate advice automatically whenever a check-in is scored.
#
# WHY THIS EXISTS: WITHOUT IT, NOTHING EVER CALLS /advise.
#
# The endpoint and the backfill tool were both built, and neither was ever
# triggered by the act of checking in - so a planter completed a visit, got a
# verdict, and saw no advice at all unless somebody ran a script by hand
# afterwards. The feature worked and was invisible, which is the same thing as
# not working.
#
# WHY HERE AND NOT IN THE PIPELINE. `pipeline.py` still does not import the
# advisor, and must not: that import boundary is what guarantees a slow,
# rate-limited or hallucinating model can never affect a verdict. So the trigger
# sits HERE, in the transport layer, and only AFTER score_checkin has returned
# and the verdict is already committed to the database.
#
# Three properties this deliberately preserves:
#
#   - /score latency is unchanged; the call returns while advice is still
#     running, exactly as before
#   - a failure cannot touch the verdict, because the verdict is already written
#   - scoring stays replayable offline with no external dependency
ADVISE_ON_SCORE = os.environ.get("ADVISE_ON_SCORE", "1").strip() not in ("0", "false", "no")


def _advise_in_background(checkin_id: str) -> None:
    """Fire and forget. Never raises, never blocks the caller."""
    if not ADVISE_ON_SCORE:
        return

    def run() -> None:
        try:
            from greenproof_ml import advisor

            result = advisor.advise_checkin(checkin_id)
            log.info(
                "advice for %s: %s", checkin_id, "written" if result else "nothing written"
            )
        except Exception:  # noqa: BLE001 - advisory only, never fatal
            log.exception("background advice failed for %s", checkin_id)

    threading.Thread(target=run, daemon=True).start()


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest) -> ScoreResponse:
    """Score one check-in.

    Takes only an id. The request body cannot influence the outcome — every
    input is re-read from the database and from storage. A caller can ask for a
    check-in to be scored; it can never say what the score should be.
    """
    if not _model_ready.is_set():
        raise HTTPException(503, "Model still loading, retry shortly")
    try:
        result = score_checkin(req.checkin_id)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # noqa: BLE001
        log.exception("scoring failed for %s", req.checkin_id)
        raise HTTPException(500, f"Scoring failed: {e}") from e

    # Advice is generated AFTER the verdict is written, in a background thread.
    _advise_in_background(req.checkin_id)

    return ScoreResponse(
        checkin_id=req.checkin_id,
        confidence=result.confidence,
        verdict=result.verdict,
        signals=result.signals,
    )


# Optional shared secret for /advise. Unset means the endpoint is open.
#
# WHY THIS EXISTS, AND WHY ONLY ON THIS ENDPOINT.
#
# /score is safe to leave open: it takes an id, re-reads every input from the
# database, and costs us nothing but a few seconds of our own CPU. /advise is
# different in one specific way - IT SPENDS MONEY. Each call is about 3 cents of
# Anthropic usage.
#
# On a Cloudflare quick tunnel that barely mattered: the hostname rotated and the
# service was up for minutes at a time. A permanent public Space URL is a
# different proposition, and an endpoint that bills the operator per request is
# worth a lock even when the realistic risk is low.
#
# Unset by default so local runs and `uvicorn app:app` need no configuration.
# Set it in the Space's secrets and in .env, and tools/advise_pilot.py sends it.
ADVISE_TOKEN = os.environ.get("ADVISE_TOKEN", "").strip()


@app.post("/advise")
def advise(req: ScoreRequest, x_advise_token: str = Header(default="")) -> dict:
    """Species identification and care advice for one check-in.

    SEPARATE FROM /score ON PURPOSE, and the separation is the design.

    Scoring is fast, local, offline-capable and replayable - it re-runs over the
    whole pilot dataset whenever a threshold moves, and it must never acquire a
    dependency on an external API that can be slow, rate-limited or down. This
    endpoint is none of those things: it makes a paid network call to a model
    whose error rate we have not measured.

    So they share a service and nothing else. This writes only `species_guess`
    and `advice`; it cannot move a confidence or a verdict, and a failure here
    leaves the check-in exactly as scoring left it.

    Note it does NOT require the DINOv2 model to be loaded - the two paths have
    no components in common, so a cold model should not block advice.
    """
    # compare_digest, not ==, so a wrong token cannot be recovered by timing.
    if ADVISE_TOKEN and not secrets.compare_digest(x_advise_token, ADVISE_TOKEN):
        raise HTTPException(401, "Missing or invalid X-Advise-Token")

    from greenproof_ml import advisor

    try:
        result = advisor.advise_checkin(req.checkin_id)
    except LookupError as e:
        raise HTTPException(404, str(e)) from e
    except Exception as e:  # noqa: BLE001
        log.exception("advice failed for %s", req.checkin_id)
        raise HTTPException(500, f"Advice failed: {e}") from e

    if result is None:
        # Not an error. Either the tree shows no decline and the policy skipped
        # it, or the model declined to answer. Both leave the row untouched.
        return {"checkin_id": req.checkin_id, "written": False}

    return {"checkin_id": req.checkin_id, "written": True, **result}


@app.post("/backfill")
def backfill(limit: int = 50) -> dict:
    """Score everything still pending.

    This is what makes T0 safe to run before the service exists: registration
    only captures and uploads, and the photos sit as `pending` until this is
    called. Nothing about the pilot depends on the ML service being live on the
    day.
    """
    if not _model_ready.is_set():
        raise HTTPException(503, "Model still loading, retry shortly")

    rows = store.list_pending(limit)
    done, failed = [], []
    for row in rows:
        try:
            result = score_checkin(row["id"])
            _advise_in_background(row["id"])
            done.append({"id": row["id"], "verdict": result.verdict, "confidence": result.confidence})
        except Exception as e:  # noqa: BLE001
            log.exception("backfill failed for %s", row["id"])
            failed.append({"id": row["id"], "error": str(e)})

    return {"scored": len(done), "failed": len(failed), "results": done, "errors": failed}
