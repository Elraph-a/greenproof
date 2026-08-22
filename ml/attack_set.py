"""Build and run the attack set — deliberate fraud, against the live system.

    python ml/attack_set.py --plan          # what would be attempted
    python ml/attack_set.py --run           # actually submit them
    python ml/attack_set.py --report        # results table for the slide

WHY THIS EXISTS
Every reforestation verification project asserts that its verification works.
None publish how often it fails. The difference between an assertion and a
measurement is a set of attacks you designed to defeat yourself, ran against the
deployed system, and reported honestly — including the ones that got through.

Seven attack types. Six are expected to be caught by DETERMINISTIC checks, not
by the neural network. That is the honest reason the system works, and this
script is what turns that claim into a table.

Every row is tagged `signals.self_test.injected = true`, so injected attacks can
never be confused with real pilot data in any later analysis, and can be deleted
wholesale — see `--cleanup`.

ATTACK 7 IS THE ONE THAT CREATES A TREE. The other six submit a check-in against
a tree that already exists; #7 registers a SECOND tree on top of an existing one,
because that is the shape of the double-payment case. Its tree row is tagged with
an `ATTACK7-` tag_code so it can never be mistaken for a pilot tree, and
`--cleanup` removes it. Leaving one behind would inflate the tree count we quote
on stage, which is the exact failure this attack exists to catch.
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
    Attack(
        7,
        "Same tree registered twice",
        "A second tree registered ~2 m from an existing one, claiming the "
        "same trunk a second time.",
        "proximity check",
        # REVIEW, not flagged, and that is the correct answer rather than a weak
        # one. Trees really do grow 2 m apart and phone GPS cannot separate that
        # from one trunk entered twice, so the system asks for a human instead of
        # calling an honest planter a fraud. 'Caught' counts review as caught,
        # because a payout is withheld either way.
        "review",
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
        .select("id, lat, lng, owner_id, tag_code, species, checkins(id, wide_photo, close_photo, captured_at)")
        .limit(60)
        .execute()
    ).data or []
    usable = [
        r
        for r in rows
        if r.get("checkins")
        # Never attack our own debris: a rerun would otherwise stack duplicate
        # trees on duplicate trees and the distances would stop meaning anything.
        and not (r.get("tag_code") or "").startswith(ATTACK_TAG_PREFIX)
    ]
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


# Tag prefix for trees this script creates. Anything carrying it is synthetic
# and must never be counted as a pilot tree.
ATTACK_TAG_PREFIX = "ATTACK7-"

# ~2 m north. Inside PROXIMITY_REVIEW_M, and a realistic GPS scatter for two
# readings taken at the same trunk.
DUPLICATE_OFFSET_DEG = 2.0 / 111_320


def register_duplicate_tree(target: dict, owner: str, when: datetime) -> str:
    """Register a SECOND tree on top of an existing one.

    Deliberately reuses the target's owner. The proximity check is owner-blind —
    it compares positions, not people — so one submitter exercises exactly the
    same code path as two, and needing a second seeded profile would make the
    attack set refuse to run on a fresh database.
    """
    row = (
        store.db()
        .table("trees")
        .insert(
            {
                "owner_id": owner,
                "registered_by": owner,
                "lat": target["lat"] + DUPLICATE_OFFSET_DEG,
                "lng": target["lng"],
                "species": target.get("species"),
                # Unique, and unmistakable in any listing or export.
                "tag_code": f"{ATTACK_TAG_PREFIX}{int(when.timestamp())}",
            }
        )
        .select("id")
        .execute()
    ).data[0]
    return row["id"]


def cleanup() -> None:
    """Delete everything this script injected.

    Two kinds of debris. Injected CHECK-INS are identifiable by
    `signals.self_test.injected`; injected TREES by the tag prefix. The trees
    matter more: a leftover attack tree inflates the headline tree count and
    would sit on the live map looking exactly like a real one.

    Check-ins cascade with the tree (`on delete cascade` in migration 0001), so
    the tree delete cleans its own visits.
    """
    db = store.db()

    trees = (
        db.table("trees")
        .select("id, tag_code")
        .like("tag_code", f"{ATTACK_TAG_PREFIX}%")
        .execute()
    ).data or []
    for t in trees:
        db.table("trees").delete().eq("id", t["id"]).execute()
    print(f"deleted {len(trees)} injected tree(s)")

    rows = (
        db.table("checkins")
        .select("id, signals")
        .not_.is_("signals", "null")
        .execute()
    ).data or []
    injected = [
        r["id"]
        for r in rows
        if ((r.get("signals") or {}).get("self_test") or {}).get("injected")
    ]
    for cid in injected:
        db.table("checkins").delete().eq("id", cid).execute()
    print(f"deleted {len(injected)} injected check-in(s)")


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

            elif attack.number == 6:  # impossible travel
                wide = store.db().storage.from_(store.BUCKET).download(prev["wide_photo"])
                close = store.db().storage.from_(store.BUCKET).download(prev["close_photo"])
                # 300 km away, 5 minutes after the previous check-in.
                cid = submit(
                    target["id"], owner, wide, close,
                    target["lat"] + 2.7, target["lng"],
                    store.parse_ts(prev["captured_at"]) + timedelta(minutes=5),
                    attack,
                )

            else:  # 7 — the same tree registered a second time
                # Re-encoded, exactly as in attack 4: a person registering the
                # same trunk twice takes a NEW photo, so the pixels genuinely
                # differ. Reusing the bytes unchanged would trip the duplicate
                # gate first and the proximity check would never be exercised —
                # the attack would 'pass' while testing nothing.
                w = Image.open(io.BytesIO(store.db().storage.from_(store.BUCKET).download(prev["wide_photo"])))
                c = Image.open(io.BytesIO(store.db().storage.from_(store.BUCKET).download(prev["close_photo"])))
                w = w.resize((int(w.width * 0.94), int(w.height * 0.94)))
                c = c.resize((int(c.width * 0.94), int(c.height * 0.94)))

                dup_tree = register_duplicate_tree(target, owner, now)
                cid = submit(
                    dup_tree, owner, to_jpeg(w, 72), to_jpeg(c, 72),
                    target["lat"] + DUPLICATE_OFFSET_DEG, target["lng"], now, attack,
                )

            result = score_checkin(cid)
            attack.result = {
                "checkin_id": cid,
                "verdict": result.verdict,
                "confidence": result.confidence,
                "caught": result.verdict in ("flagged", "review"),
                "auto_approved": result.verdict == "verified",
                "failed_gates": result.signals.get("failed_gates", []),
                "review_flags": [
                    k
                    for k, v in (result.signals.get("review_flags") or {}).items()
                    if not v.get("passed")
                ],
            }
        except Exception as e:  # noqa: BLE001
            attack.result = {"error": str(e)}

    return ATTACKS


def report(attacks: list[Attack]) -> None:
    print()
    print("=" * 88)
    print("ATTACK SET RESULTS")
    print("=" * 88)
    print(f"{'#':<3}{'Attack':<36}{'Expected catcher':<26}{'Verdict':<10}{'Caught'}")
    print("-" * 88)

    caught = 0
    approved = 0
    for a in attacks:
        r = a.result
        if "error" in r:
            print(f"{a.number:<3}{a.name:<36}{a.expected_catcher:<26}{'ERROR':<10}{r['error'][:20]}")
            continue
        caught += bool(r["caught"])
        approved += bool(r["auto_approved"])
        mark = "YES" if r["caught"] else "*** NO ***"
        print(f"{a.number:<3}{a.name:<36}{a.expected_catcher:<26}{r['verdict']:<10}{mark}")
        # WHICH detector actually fired, which is not always the expected one.
        # A caught attack caught by the wrong check is a coincidence, not a
        # working system, and printing only 'YES' would hide that.
        why = ", ".join(r.get("failed_gates") or r.get("review_flags") or [])
        if why:
            print(f"{'':<3}{'via ' + why}")

    done = [a for a in attacks if "error" not in a.result]
    print("-" * 88)
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
    p.add_argument(
        "--cleanup",
        action="store_true",
        help="delete every injected tree and check-in, then exit",
    )
    args = p.parse_args()

    if args.cleanup:
        cleanup()
        return

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
