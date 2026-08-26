"""Species identification and care advice for the planter.

THE ONE THING TO UNDERSTAND ABOUT THIS FILE

    Nothing here is a verification signal, and nothing here may become one.

The verification engine answers "is this the same tree, alive, in the right
place, not a duplicate" - and it answers it with detectors whose error rate we
have measured and published. This file answers a different question that nobody
has been answering at all: "what is wrong with this tree and what should the
planter do about it?"

Those two questions deserve different standards of evidence, so they are kept
apart at every level: a separate module THE SCORING PATH NEVER IMPORTS, a
separate endpoint, separate database columns, and a separate place in the UI
that names the model and says the word "advice".

The import direction is the load-bearing part. `pipeline.py` does not know this
file exists, so there is no code path by which a slow, failed or hallucinated
advisory call can affect a verdict. Check that property still holds before
adding any import to this module's callers:

    grep -rn "advisor" ml/greenproof_ml/pipeline.py ml/greenproof_ml/scoring.py

should print nothing, permanently.

WHY AN LLM HERE, WHEN WE REFUSED ONE EVERYWHERE ELSE

The obvious alternative is a leaf-disease classifier trained on PlantVillage.
We are not doing that, for three reasons and the first is disqualifying:

  1. PlantVillage is single leaves on uniform lab backgrounds. Published
     cross-domain evaluations collapse from ~99% to roughly 30-50% on real
     field photographs. We have already made exactly this mistake once and
     turned it into our best slide: the plant check scored a perfect AUC of
     1.000 and then flagged five of nine real check-ins as "not a plant",
     because it had learned photo STYLE, not subject. Shipping a PlantVillage
     classifier would be repeating a mistake we have documented.

  2. It covers fourteen crops - tomato, potato, corn, grape. None of them are
     Odum, Wawa, Ofram, Ceiba, or anything else in a Ghanaian planting scheme.

  3. We have no ground truth. No agronomist has labelled our trees. This
     project's entire claim is that we publish our own measured error rate, and
     a classifier whose error rate we cannot measure would be the one component
     contradicting that claim.

An LLM's output is hedged natural language that a person reads and judges, not
a number that authorises a payment. The bar it has to clear is therefore much
lower, and it is honest about clearing a lower bar - which is why `limitations`
below is a required field rather than an optional one.

FAILS SOFT, ALWAYS. No key, no network, a rate limit, a refusal, a malformed
response: every one of them logs and returns None. The caller writes nothing and
the check-in is untouched. This service being unreachable already costs us
nothing (scoring is asynchronous and replayable); the advisory layer inherits
that property rather than weakening it.
"""

from __future__ import annotations

import base64
import io
import logging
import os
from typing import Literal

from PIL import Image
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)


class AdvisorError(RuntimeError):
    """The provider was asked and could not answer.

    Distinct from "there was nothing to do". Raised only when strict=True, so
    batch tools can report a dead provider loudly while the HTTP endpoint keeps
    failing soft.
    """


# ---------------------------------------------------------------------------
# Which model writes the advice
# ---------------------------------------------------------------------------
#
# TWO PROVIDERS BEHIND ONE FUNCTION, the same shape as photos (one upload
# function, one URL column) and payments (a mock adapter behind an interface).
# The advisory layer is the only part of this system that talks to an outside
# API, so it is the part most likely to be swapped under us - free tiers have
# already closed on this project three times mid-build.
#
#   GEMINI     free tier, and the default when a key is present
#   ANTHROPIC  paid, used when only that key is set
#
# Auto-detected from whichever key exists, overridable with ADVISOR_PROVIDER.
# Neither key set is a supported state: advice is disabled and every other part
# of the system carries on unaffected.
# VERIFY A MODEL ID BY CALLING IT, NOT BY LISTING IT. `models.list()` returned
# gemini-2.5-flash as available while generate_content refused it with "no longer
# available to new users" - the listing describes the catalogue, not what this
# key may actually invoke. Overridable with GEMINI_MODEL, so a future retirement
# is an environment variable rather than a deploy.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

# Free-tier quota is PER MODEL, and that is the whole reason this list exists.
# A full pilot pass exhausted gemini-3.6-flash's daily allowance after 20 of 37
# check-ins, while the other two still answered immediately - so a 429 on one
# model is not "we are out of quota", it is "we are out of quota HERE".
#
# Tried in order on a rate-limit only. Never on a 404, a refusal or a bad
# request: those mean the call was wrong, and silently re-issuing a wrong call
# against three models just produces the same failure three times.
GEMINI_FALLBACKS = [
    m.strip()
    for m in os.environ.get(
        "GEMINI_FALLBACKS", "gemini-3-flash-preview,gemini-3.1-flash-lite"
    ).split(",")
    if m.strip()
]
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-5")

# Generous. The call is fire-and-forget from the caller's perspective and a slow
# response costs nothing, whereas a truncated one wastes the whole request.
MAX_TOKENS = 2000


def provider() -> str | None:
    """Which provider to use, or None if advice is unavailable.

    An explicit ADVISOR_PROVIDER wins, so a demo can be pinned to one provider
    regardless of which keys happen to be present in the environment.
    """
    explicit = os.environ.get("ADVISOR_PROVIDER", "").strip().lower()
    if explicit in ("gemini", "anthropic"):
        return explicit
    if os.environ.get("GEMINI_API_KEY"):
        return "gemini"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    return None


def model_name() -> str | None:
    """The model that answered, falling back to the one we would ask.

    Prefers the ACTUAL model once a call has been made, so a row records what
    wrote it rather than what we hoped would write it.
    """
    p = provider()
    if p is None:
        return None
    if p in _used_model:
        return _used_model[p]
    return {"gemini": GEMINI_MODEL, "anthropic": ANTHROPIC_MODEL}[p]

# Images are re-encoded to this before sending. The photos in storage are
# already 800px/q75 (the client downscales before upload), so this is a ceiling
# rather than a resize in the normal case, and it bounds the token cost of a
# photo that arrived by some other route.
MAX_EDGE_PX = 800
JPEG_QUALITY = 75


class PlantAssessment(BaseModel):
    """What we ask the model to return, and what we store.

    One schema for both providers, enforced by schema-constrained decoding on
    each - so the stored shape is identical whichever wrote it, and switching
    provider cannot quietly change the data.

    Every field is chosen so that a reader can tell how much to trust it.
    `species_confidence` is SELF-REPORTED and labelled as such in the UI - it is
    not a measured accuracy and must never be presented as one.
    """

    species_common: str | None = Field(
        description="Common name of the species, or null if not identifiable."
    )
    species_scientific: str | None = Field(
        description="Binomial scientific name, or null if not identifiable."
    )
    species_confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Your own confidence in the species identification, 0 to 1.",
    )
    health: Literal["healthy", "stressed", "declining", "cannot_tell"] = Field(
        description="Overall condition of the plant as far as the photos show it."
    )
    observations: list[str] = Field(
        description="What is actually visible in the photographs. Concrete and "
        "specific: leaf colour, leaf loss, wilting, damage, the state of the "
        "soil. Do not speculate beyond what the image shows."
    )
    actions: list[str] = Field(
        description="What the planter should do, in plain language, achievable "
        "by one person with no equipment and no money."
    )
    limitations: str = Field(
        description="What these photographs could NOT tell you, and what would "
        "need to be checked in person."
    )


# `limitations` being required is the design, not a formality. An assessment
# that cannot say what it failed to see is indistinguishable from one that saw
# everything, and a planter cannot calibrate how much to trust it.
SYSTEM = """You are advising a smallholder tree planter in Ghana who has \
photographed a young tree (roughly 1-3 years old) they are responsible for \
keeping alive. They are paid when the tree survives, so your advice has real \
consequences for them.

You will receive one to three photographs of the same tree from the same visit: \
a wide shot of the whole tree and its surroundings, a close-up of the trunk, \
and sometimes a close-up of a leaf.

Your job is to identify the species if you can, describe the tree's condition, \
and tell the planter what to do about it.

Rules:

- Describe only what is visible. If the photographs do not show something, say \
so in `limitations` rather than guessing at it.
- Prefer species common in Ghanaian planting schemes where the image supports \
it (Odum/Milicia, Wawa/Triplochiton, Ofram/Terminalia, Mahogany/Khaya, \
Neem/Azadirachta, Ceiba, Mango/Mangifera, Cassia, Acacia, Teak/Tectona), but do \
not force a match. Return null for species rather than a bad guess, and let \
`species_confidence` reflect genuine uncertainty.
- Recommend only actions a person can take with their hands, water, mulch and \
local materials. No paid inputs, no laboratory tests, no equipment. Watering, \
mulching, weeding around the base, removing competing growth, staking, \
protecting from livestock, and clearing termite damage are the realistic \
interventions.
- If the tree looks healthy, say so plainly and give one or two things worth \
keeping up. Do not invent problems.
- Be brief. Two to four observations, two to four actions. This is read on a \
phone, outdoors, by someone standing in front of the tree.
- Never mention verification, scoring, confidence scores or payment. That is a \
different part of this system and not your concern."""


# Which model actually answered, as opposed to which one we asked first. Read by
# split() so the row records the truth rather than the intention - a fallback
# that is not written down is a result nobody can reproduce.
_used_model: dict[str, str] = {}


def _is_rate_limit(e: Exception) -> bool:
    """A quota error, as opposed to a wrong request.

    Matched on the response rather than the exception class: the SDK raises the
    same ClientError for 404 and 429, and retrying a 404 across three models
    just produces the same failure three times.
    """
    code = getattr(e, "code", None) or getattr(e, "status_code", None)
    if code == 429:
        return True
    s = str(e)
    return "429" in s or "RESOURCE_EXHAUSTED" in s


def _jpeg(img: Image.Image) -> bytes:
    """One photo, normalised to what we actually send.

    Storage photos are already 800px/q75 (the client downscales before upload),
    so this is a ceiling rather than a resize in the normal case. It bounds the
    cost of a photo that arrived by some other route, and it makes the bytes
    identical whichever provider is called - so switching provider cannot
    silently change what the model saw.
    """
    im = img.convert("RGB")
    im.thumbnail((MAX_EDGE_PX, MAX_EDGE_PX))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue()


def _labelled(wide, close, leaf) -> list[tuple[str, bytes]]:
    """Photos with the labels the model needs to tell them apart.

    The labels matter: without them the model cannot distinguish a trunk
    close-up from a leaf close-up, and will confidently describe bark as
    foliage.
    """
    out = []
    if wide is not None:
        out.append(("Wide shot: the whole tree and its surroundings.", _jpeg(wide)))
    if close is not None:
        out.append(("Close-up of the trunk.", _jpeg(close)))
    if leaf is not None:
        out.append(("Close-up of a leaf.", _jpeg(leaf)))
    return out


def _assess_gemini(photos, prompt: str) -> PlantAssessment | None:
    """Google's free tier. SDK imported here so a missing package cannot break
    scoring, which must never depend on this module."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    parts = []
    for label, data in photos:
        parts.append(types.Part.from_text(text=label))
        parts.append(types.Part.from_bytes(data=data, mime_type="image/jpeg"))
    parts.append(types.Part.from_text(text=prompt))

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM,
        max_output_tokens=MAX_TOKENS,
        # Schema-constrained decoding, so the answer is valid JSON in the shape
        # we asked for rather than prose we have to parse.
        response_mime_type="application/json",
        response_schema=PlantAssessment,
    )

    last: Exception | None = None
    for i, model in enumerate([GEMINI_MODEL, *GEMINI_FALLBACKS]):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=[types.Content(role="user", parts=parts)],
                config=config,
            )
            if i:
                # Record it: a run that quietly changed model halfway is a run
                # whose output nobody can explain later.
                log.warning("gemini fell back to %s after quota on %s", model, GEMINI_MODEL)
                _used_model["gemini"] = model
            else:
                _used_model["gemini"] = model
            return resp.parsed
        except Exception as e:  # noqa: BLE001
            last = e
            if not _is_rate_limit(e):
                raise  # a 404 or a bad request will fail identically on every model
            log.info("quota exhausted on %s, trying next", model)

    raise last if last else AdvisorError("gemini: no model available")


def _assess_anthropic(photos, prompt: str) -> PlantAssessment | None:
    from anthropic import Anthropic

    blocks: list[dict] = []
    for label, data in photos:
        blocks.append({"type": "text", "text": label})
        blocks.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.standard_b64encode(data).decode("utf-8"),
                },
            }
        )
    blocks.append({"type": "text", "text": prompt})

    resp = Anthropic().messages.parse(
        model=ANTHROPIC_MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM,
        messages=[{"role": "user", "content": blocks}],
        output_format=PlantAssessment,
    )
    return getattr(resp, "parsed_output", None)


def assess(
    *,
    wide: Image.Image | None = None,
    close: Image.Image | None = None,
    leaf: Image.Image | None = None,
    recorded_species: str | None = None,
    strict: bool = False,
) -> PlantAssessment | None:
    """Identify the species and assess the tree's health. None on any failure.

    EVERY PHOTO THAT EXISTS IS SENT, and none is required. That is what lets
    this run against the pilot check-ins captured before `leaf_photo` existed,
    and what lets it improve on its own as leaf photos start arriving - the same
    property the plant reference set has, where every verified check-in makes
    the next assessment slightly better.

    `recorded_species` is what the planter typed at registration. It is passed
    as CONTEXT TO DISAGREE WITH, never as an answer to confirm: the whole value
    of an independent identification is lost if we tell the model what to say.
    """
    photos = _labelled(wide, close, leaf)
    if not photos:
        log.warning("advisor.assess called with no photographs")
        return None

    which = provider()
    if which is None:
        # Not an error. No key configured means advice is switched off, and
        # everything else in the system is unaffected.
        log.info("no advisory provider configured (set GEMINI_API_KEY)")
        return None

    prompt = "Identify this tree and assess its condition."
    if recorded_species:
        # Framed to invite contradiction. "The planter recorded X" is a claim to
        # test; "this is an X" would be an instruction to agree.
        prompt += (
            f"\n\nThe planter recorded this tree's species as '{recorded_species}' "
            "when they registered it. Treat that as an unverified claim, not as "
            "the answer. If the photographs show something else, say so."
        )

    try:
        parsed = (
            _assess_gemini(photos, prompt)
            if which == "gemini"
            else _assess_anthropic(photos, prompt)
        )
    except Exception as e:  # noqa: BLE001 - advisory only, must never break a caller
        log.exception("advisory assessment failed (%s)", which)
        # A DEAD PROVIDER MUST NOT LOOK LIKE A QUIET SKIP.
        #
        # This returned None on failure, and the pilot tool counted None as
        # "skipped - no decline detected, or the model declined". A 404 on a
        # retired model id therefore reported as a clean run over every
        # check-in, which is precisely the false pass this project has been
        # caught by three times before.
        #
        # The endpoint still fails soft (strict=False) because a broken advisory
        # call must never take verification down. Batch tools pass strict=True,
        # because a tool that cannot tell "nothing to do" from "nothing worked"
        # is worse than no tool.
        if strict:
            raise AdvisorError(f"{which}: {e}") from e
        return None

    # A refusal or a safety block is a successful call with nothing parsed.
    # Guard before reading rather than raising out of a function documented
    # never to raise.
    if parsed is None:
        log.warning("advisory assessment returned no parsed output (%s)", which)
        if strict:
            raise AdvisorError(f"{which}: returned no parsed output")
        return None

    return parsed


def split(assessment: PlantAssessment) -> tuple[dict, dict]:
    """One assessment -> the two columns it is stored in.

    Species and advice are separated in the database because they have different
    futures: species is a candidate verification signal (a species that changes
    between visits is evidence of a swapped tree), and advice never will be.
    Storing them together would make that separation a refactor later.
    """
    species = {
        "common": assessment.species_common,
        "scientific": assessment.species_scientific,
        # Named to make its nature unmissable at every layer. This is the
        # model's opinion of itself, not a measured accuracy, and calling the
        # field `confidence` next to a column that genuinely IS a measured
        # confidence would be actively misleading.
        "self_reported_confidence": assessment.species_confidence,
        "model": model_name(),
    }
    advice = {
        "health": assessment.health,
        "observations": assessment.observations,
        "actions": assessment.actions,
        "limitations": assessment.limitations,
        "model": model_name(),
        "advisory_only": True,
    }
    return species, advice


# ---------------------------------------------------------------------------
# When to spend a call
# ---------------------------------------------------------------------------
#
# THE DESIGNED POLICY IS DECLINE-ONLY. The deterministic canopy signal in
# scoring.score_growth already flags a tree that has lost more than half its
# canopy since the last visit - that is the dying-tree detector, it costs
# nothing, and it is measured. Calling an LLM only when that fires is what keeps
# the per-tree cost defensible at scale:
#
#     ~3 cents a call. One million trees checked four times a year is
#     ~$120k on every visit, ~$6-12k on decline only.
#
# WHY IT IS CURRENTLY TRUE FOR EVERY CHECK-IN ANYWAY. The pilot is 6 trees and
# 9 check-ins, and most of those are first visits - where score_growth returns a
# neutral 0.5 because there is no previous canopy to compare against. A
# decline-only trigger would fire zero times on the data we actually have, and
# an advisory layer with nothing to advise on is not a feature.
#
# So this is a policy constant with both branches live, rather than a hardcoded
# call site. Both statements are true and both are defensible: we assess every
# visit at pilot scale, and the design for scale is decline-only.
ADVISE_ON_EVERY_CHECKIN = True

# Below this growth score, the tree is declining enough to be worth advice.
# Matches the 0.15 that score_growth assigns to >50% canopy loss.
DECLINE_GROWTH_SCORE = 0.2


def should_advise(checkin: dict) -> bool:
    """Is this check-in worth spending an API call on?"""
    if ADVISE_ON_EVERY_CHECKIN:
        return True

    growth = ((checkin.get("signals") or {}).get("scores") or {}).get("growth") or {}
    score = growth.get("score")
    # An unscored check-in has no decline evidence either way. Advising on it
    # would quietly restore "every check-in" through the back door.
    return score is not None and score <= DECLINE_GROWTH_SCORE


def advise_checkin(checkin_id: str, strict: bool = False) -> dict | None:
    """Assess one check-in and store the result. None if nothing was written.

    Fetches its own photos from storage, exactly as scoring does, so the request
    body cannot influence what gets assessed.
    """
    from . import store  # local: keeps the module importable without credentials

    row = store.get_checkin(checkin_id)
    if row is None:
        raise LookupError(f"No check-in {checkin_id}")

    if not should_advise(row):
        log.info("skipping advice for %s: no decline detected", checkin_id)
        return None

    tree = store.get_tree(row["tree_id"])

    def _photo(path: str | None) -> Image.Image | None:
        """A missing or unreadable photo costs us that photo, never the call."""
        if not path:
            return None
        try:
            return store.download_image(path)
        except Exception:  # noqa: BLE001
            log.warning("could not download %s", path, exc_info=True)
            return None

    assessment = assess(
        wide=_photo(row.get("wide_photo")),
        close=_photo(row.get("close_photo")),
        leaf=_photo(row.get("leaf_photo")),
        recorded_species=(tree or {}).get("species"),
        strict=strict,
    )
    if assessment is None:
        return None

    species, advice = split(assessment)
    store.write_advice(checkin_id, species, advice)
    log.info(
        "advised %s -> %s (species: %s)",
        checkin_id,
        assessment.health,
        assessment.species_common,
    )
    return {"species_guess": species, "advice": advice}
