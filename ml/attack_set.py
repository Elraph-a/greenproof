"""Build and run the attack set — deliberate fraud, against the live system.

    python ml/attack_set.py --plan          # what would be attempted
    python ml/attack_set.py --run           # actually submit them
    python ml/attack_set.py --report        # results table for the slide

WHY THIS EXISTS
Every reforestation verification project asserts that its verification works.
None publish how often it fails. The difference between an assertion and a
measurement is a set of attacks you designed to defeat yourself, ran against the
deployed system, and reported honestly — including the ones that got through.

Six attack types. Five are expected to be caught by DETERMINISTIC checks, not by
the neural network. That is the honest reason the system works, and this script
is what turns that claim into a table.

Every row is tagged `signals.self_test.injected = true`, so injected attacks can
never be confused with real pilot data in any later analysis, and can be deleted
wholesale.
"""

from __future__ import annotations

import argparse
import io
import json
import random
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

from greenproof_ml import store  # noqa: E402
from greenproof_ml.pipeline import score_checkin  # noqa: E402


@dataclass
class Attack:
    number: int
    name: str
    description: str
    expected_catcher: str
    expected_verdict: str
    uses_ai: bool = False
    result: dict = field(default_factory=dict)


ATTACKS = [
    Attack(
        1,
        "Resubmit an identical photo",
        "Take a genuine past check-in's photos and submit them again unchanged.",
        "duplicate gate (pHash)",
        "flagged",
    ),
    Attack(
        2,
        "Internet photo of the same species",
        "A stock photo of the same species, submitted at the correct GPS.",
        "duplicate gate + liveness",
        "flagged",
    ),
    Attack(
        3,
        "Correct tree, wrong place",
        "Genuine photos of the tree, but GPS from 200 m away.",
        "GPS gate",
        "flagged",
    ),
    Attack(
        4,
        "Different tree at the correct GPS",
        "Another tree's photos submitted against this tree, at this tree's GPS.",
        "image matching",
        "review",
        uses_ai=True,
    ),
    Attack(
        5,
        "Dead or brown plant",
        "A photo with no living vegetation, at the correct GPS.",
        "liveness (excess green)",
        "flagged",
    ),
    Attack(
        6,
        "Impossible travel",
        "Two check-ins minutes apart from locations hours apart.",
        "travel-speed gate",
        "flagged",
    ),
]


# ---------------------------------------------------------------------------
# Synthetic imagery for the attacks that need it
# ---------------------------------------------------------------------------


def dead_plant_image() -> Image.Image:
    """A brown, textured, plausible-looking dead stick against soil.

    Deliberately not a flat brown rectangle — that would be a straw man. It has
    noise and structure so it fails on VEGETATION INDEX rather than on being
    obviously synthetic.
    """
    rng = np.random.default_rng(7)
    a = rng.normal(loc=[125, 95, 62], scale=18, size=(800, 600, 3))
    # A darker vertical "trunk"
    a[:, 260:340] *= 0.55
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def to_jpeg(img: Image.Image, quality: int = 75) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Running
# ---------------------------------------------------------------------------


def pick_targets(limit: int = 6) -> list[dict]:
    """Real trees with at least one verified check-in to attack."""
    db = store.db()
    rows = (
        db.table("trees")
        .select("id, lat, lng, owner_id, tag_code, checkins(id, wide_photo, close_photo, captured_at)")
        .limit(60)
        .execute()
    ).data or []
    usable = [r for r in rows if r.get("checkins")]
    random.seed(11)
    random.shuffle(usable)
    return usable[:limit]


def submit(
    tree_id: str,
    submitter: str,
    wide: bytes,
    close: bytes,
    lat: float,
    lng: float,
    captured_at: datetime,
    attack: Attack,
) -> str:
    """Insert an attack check-in, tagged so it can never pollute real analysis."""
    db = store.db()
    capture_id = f"attack-{attack.number}-{int(captured_at.timestamp())}"
    wide_path = f"{submitter}/{capture_id}/wide.jpg"
    close_path = f"{submitter}/{capture_id}/close.jpg"

    db.storage.from_(store.BUCKET).upload(
        wide_path, wide, {"content-type": "image/jpeg", "upsert": "true"}
    )
    db.storage.from_(store.BUCKET).upload(
        close_path, close, {"content-type": "image/jpeg", "upsert": "true"}
    )

    row = (
        db.table("checkins")
        .insert(
            {
                "tree_id": tree_id,
                "submitted_by": submitter,
                "wide_photo": wide_path,
                "close_photo": close_path,
                "captured_at": captured_at.isoformat(),
                "lat": lat,
                "lng": lng,
                "gps_accuracy_m": 6.0,
            }
        )
        .select("id")
        .execute()
    ).data[0]

    # Tag it BEFORE scoring, so even a crash mid-run leaves the row identifiable.
    db.table("checkins").update(
        {
            "signals": {
                "self_test": {
                    "injected": True,
                    "attack_type": attack.name,
                    "attack_number": attack.number,
                    "expected_verdict": attack.expected_verdict,
                }
            }
        }
    ).eq("id", row["id"]).execute()

    return row["id"]


def run() -> list[Attack]:
    targets = pick_targets()
    if not targets:
        sys.exit("No trees with check-ins to attack. Run T0 first.")

    now = datetime.now(timezone.utc)

    for attack in ATTACKS:
        target = targets[(attack.number - 1) % len(targets)]
        prev = sorted(target["checkins"], key=lambda c: c["captured_at"])[-1]
        owner = target["owner_id"]

        try:
            if attack.number == 1:
                wide = store.db().storage.from_(store.BUCKET).download(prev["wide_photo"])
                close = store.db().storage.from_(store.BUCKET).download(prev["close_photo"])
                cid = submit(target["id"], owner, wide, close, target["lat"], target["lng"], now, attack)

            elif attack.number == 2:
                # Stand-in for a stock photo: a genuine photo of a DIFFERENT
                # tree, which is the same failure mode — an image that exists
                # elsewhere in the system.
                other = next(t for t in targets if t["id"] != target["id"])
                op = sorted(other["checkins"], key=lambda c: c["captured_at"])[-1]
                wide = store.db().storage.from_(store.BUCKET).download(op["wide_photo"])
                close = store.db().storage.from_(store.BUCKET).download(op["close_photo"])
                cid = submit(target["id"], owner, wide, close, target["lat"], target["lng"], now, attack)

            elif attack.number == 3:
                wide = store.db().storage.from_(store.BUCKET).download(prev["wide_photo"])
                close = store.db().storage.from_(store.BUCKET).download(prev["close_photo"])
                # ~200 m north
                cid = submit(
                    target["id"], owner, wide, close,
                    target["lat"] + 0.0018, target["lng"], now, attack,
                )

            elif attack.number == 4:
                other = next(t for t in targets if t["id"] != target["id"])
                op = sorted(other["checkins"], key=lambda c: c["captured_at"])[-1]
                # Re-encode so the duplicate gate does NOT catch it — this
                # attack must be forced through to the AI, which is the whole
                # point of including it.
                w = Image.open(io.BytesIO(store.db().storage.from_(store.BUCKET).download(op["wide_photo"])))
                c = Image.open(io.BytesIO(store.db().storage.from_(store.BUCKET).download(op["close_photo"])))
                w = w.resize((int(w.width * 0.92), int(w.height * 0.92)))
                c = c.resize((int(c.width * 0.92), int(c.height * 0.92)))
                cid = submit(target["id"], owner, to_jpeg(w, 70), to_jpeg(c, 70),
                             target["lat"], target["lng"], now, attack)

            elif attack.number == 5:
                dead = to_jpeg(dead_plant_image())
                cid = submit(target["id"], owner, dead, dead, target["lat"], target["lng"], now, attack)

            else:  # 6 — impossible travel
                wide = store.db().storage.from_(store.BUCKET).download(prev["wide_photo"])
                close = store.db().storage.from_(store.BUCKET).download(prev["close_photo"])
                # 300 km away, 5 minutes after the previous check-in.
                cid = submit(
                    target["id"], owner, wide, close,
                    target["lat"] + 2.7, target["lng"],
                    store.parse_ts(prev["captured_at"]) + timedelta(minutes=5),
                    attack,
                )

            result = score_checkin(cid)
            attack.result = {
                "checkin_id": cid,
                "verdict": result.verdict,
                "confidence": result.confidence,
                "caught": result.verdict in ("flagged", "review"),
                "auto_approved": result.verdict == "verified",
                "failed_gates": result.signals.get("failed_gates", []),
            }
        except Exception as e:  # noqa: BLE001
            attack.result = {"error": str(e)}

    return ATTACKS


def report(attacks: list[Attack]) -> None:
    print()
    print("=" * 84)
    print("ATTACK SET RESULTS")
    print("=" * 84)
    print(f"{'#':<3}{'Attack':<38}{'Expected catcher':<24}{'Verdict':<10}{'Caught'}")
    print("-" * 84)

    caught = 0
    approved = 0
    for a in attacks:
        r = a.result
        if "error" in r:
            print(f"{a.number:<3}{a.name:<38}{a.expected_catcher:<24}{'ERROR':<10}{r['error'][:20]}")
            continue
        caught += bool(r["caught"])
        approved += bool(r["auto_approved"])
        mark = "YES" if r["caught"] else "*** NO ***"
        print(f"{a.number:<3}{a.name:<38}{a.expected_catcher:<24}{r['verdict']:<10}{mark}")

    done = [a for a in attacks if "error" not in a.result]
    print("-" * 84)
    print(f"  Caught: {caught}/{len(done)}")
    print(f"  WRONGLY AUTO-APPROVED: {approved}/{len(done)}   <- the number that matters")
    print()
    print("  A wrongly rejected genuine visit is annoying.")
    print("  A wrongly approved fraud is fatal. Report both, lead with the second.")
    print()

    ai_only = [a for a in done if a.uses_ai]
    print(f"  Caught by deterministic checks, no AI: {len([a for a in done if not a.uses_ai and a.result['caught']])}"
          f"/{len([a for a in done if not a.uses_ai])}")
    print(f"  Requiring image matching:              {len(ai_only)}")
    print()

    out = Path(__file__).resolve().parent.parent / "docs" / "attack_results.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(
        json.dumps(
            [{"number": a.number, "name": a.name, "expected_catcher": a.expected_catcher,
              "uses_ai": a.uses_ai, **a.result} for a in attacks],
            indent=2,
        )
    )
    print(f"  written to {out}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--plan", action="store_true", help="list the attacks without running")
    p.add_argument("--run", action="store_true", help="submit and score the attacks")
    args = p.parse_args()

    if args.plan or not args.run:
        print("\nATTACK PLAN\n" + "=" * 78)
        for a in ATTACKS:
            print(f"\n{a.number}. {a.name}")
            print(f"   {a.description}")
            print(f"   expected catcher : {a.expected_catcher}")
            print(f"   expected verdict : {a.expected_verdict}")
            print(f"   needs the AI     : {'YES' if a.uses_ai else 'no'}")
        print("\nRun with --run to submit these against the live system.\n")
        return

    report(run())


if __name__ == "__main__":
    main()
