"""GreenProof verification service.

The ONE new surface in the stack. Everything else is Supabase called directly
from the browser; this exists because a client-computed verification result is
forgeable, so scoring has to happen somewhere the user cannot reach.

Runs on Hugging Face Spaces (Docker SDK, free tier, 16 GB).

    GET  /              service metadata
    GET  /health        liveness + whether the model is loaded
    POST /score         score one check-in by id
    POST /backfill      score every pending check-in (used after T0)
"""

from __future__ import annotations

import logging
import os
import threading

from fastapi import FastAPI, HTTPException
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
# endpoints carry no secrets a caller could extract - the service key stays
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
    download - a loop that has eaten whole afternoons.
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


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest) -> ScoreResponse:
    """Score one check-in.

    Takes only an id. The request body cannot influence the outcome - every
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

    return ScoreResponse(
        checkin_id=req.checkin_id,
        confidence=result.confidence,
        verdict=result.verdict,
        signals=result.signals,
    )


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
            done.append({"id": row["id"], "verdict": result.verdict, "confidence": result.confidence})
        except Exception as e:  # noqa: BLE001
            log.exception("backfill failed for %s", row["id"])
            failed.append({"id": row["id"], "error": str(e)})

    return {"scored": len(done), "failed": len(failed), "results": done, "errors": failed}
