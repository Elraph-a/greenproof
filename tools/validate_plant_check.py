#!/usr/bin/env python3
"""Measure the "is this even a plant?" check against public data.

WHY THIS EXISTS
Someone can photograph a chair, a wall, or a green cloth and register it as a
tree. The liveness signal does not stop that: it measures how much of the frame
is vegetation-COLOURED, so a green bedsheet scores 1.00. Measured, not assumed.

The proposed fix reuses the DINOv2 embedding we already compute for every photo
and asks whether it resembles anything in a reference set of known plants.

TWO WRONG VERSIONS OF THIS TEST CAME FIRST. Both are why this docstring is long.

  v1 compared plants against screenshots and Gaussian noise. Noise is trivially
     far from everything in embedding space, so separation looked perfect and
     meant nothing.

  v2 used PlantNet-300K as the reference set and scored AUC 1.000 against COCO,
     and then flagged 97% of OUR OWN photos as "not a plant". PlantNet images
     are square cropped specimens; ours are 960x1280 wide shots of a whole tree
     with sky, ground and buildings in frame. The check had learned
     "cropped specimen vs wide scene", not "plant vs not-plant". An AUC of 1.000
     is the tell: real problems do not separate perfectly.

THE REFERENCE SET MUST MATCH THE PHOTOS THE APP ACTUALLY CAPTURES. So the
reference here is our own field photos, and the negatives are COCO - ordinary
photographs of furniture, people, vehicles and rooms, which is what a chair
photographed on a phone actually looks like.

    python tools/validate_plant_check.py --reference ours --n 300

Threshold is chosen on the reference half and evaluated on a held-out half, so
nothing is tuned on the data it is reported against.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ml"))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

PLANTS = "mikehemberger/plantnet300K"
NOT_PLANTS = "sayakpaul/coco-30-val-2014"
CACHE = ROOT / ".tmp" / "embed_cache"


def cached(key: str, build):
    """Embeddings are the expensive part; a rerun should not pay for them twice."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{hashlib.sha1(key.encode()).hexdigest()[:16]}.npy"
    if f.exists():
        print(f"  cached: {key}", flush=True)
        return np.load(f)
    v = build()
    np.save(f, v)
    return v


def embed_all(images, what: str) -> np.ndarray:
    from greenproof_ml.embed import embed

    vecs = []
    for i, img in enumerate(images, 1):
        vecs.append(embed(img))
        if i % 50 == 0:
            print(f"    embedded {i}/{len(images)} {what}", flush=True)
    return np.stack(vecs)


def stream_embed(name: str, n: int, what: str) -> np.ndarray:
    def build():
        from datasets import load_dataset

        print(f"  streaming {n} from {name} ...", flush=True)
        imgs = []
        for ex in load_dataset(name, split="train", streaming=True):
            img = ex.get("image") or ex.get("img")
            if img is None:
                continue
            try:
                imgs.append(img.convert("RGB").copy())
            except Exception:  # noqa: BLE001 - a corrupt row is not a reason to stop
                continue
            if len(imgs) >= n:
                break
        return embed_all(imgs, what)

    return cached(f"{name}:{n}", build)


def ours() -> np.ndarray:
    files = sorted((ROOT / "data" / "spike").glob("*.jpg"))

    def build():
        return embed_all([Image.open(f) for f in files], "our field photos")

    return cached(f"spike:{len(files)}", build)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--reference", choices=["ours", "plantnet"], default="ours")
    args = ap.parse_args()

    print("BUILDING EMBEDDINGS")
    OURS = ours()
    NEG = stream_embed(NOT_PLANTS, args.n, "non-plants")
    PN = stream_embed(PLANTS, args.n, "plantnet plants")

    positives = OURS if args.reference == "ours" else PN
    other_domain = PN if args.reference == "ours" else OURS
    other_name = "PlantNet close-ups" if args.reference == "ours" else "our field photos"

    rng = np.random.default_rng(0)
    idx = rng.permutation(len(positives))
    half = len(positives) // 2
    ref, held = positives[idx[:half]], positives[idx[half:]]

    def nearest(V):
        """Vectors are L2-normalised by embed(), so a dot product IS the cosine."""
        return (V @ ref.T).max(axis=1)

    S = ref @ ref.T
    np.fill_diagonal(S, -1)
    # Tolerate wrongly flagging the least typical 5% of known-good photos.
    threshold = float(np.percentile(S.max(axis=1), 5))

    s_held, s_neg, s_other = nearest(held), nearest(NEG), nearest(other_domain)
    false_reject = float((s_held < threshold).mean())
    false_accept = float((s_neg >= threshold).mean())

    from sklearn.metrics import roc_auc_score

    y = np.r_[np.ones(len(s_held)), np.zeros(len(s_neg))]
    auc = float(roc_auc_score(y, np.r_[s_held, s_neg]))

    print("\n" + "=" * 66)
    print(f"PLANT-PLAUSIBILITY CHECK - reference: {args.reference}")
    print("=" * 66)
    print(f"  reference photos          {len(ref)}")
    print(f"  held-out same-domain      {len(held)}")
    print(f"  non-plants (COCO)         {len(NEG)}")
    print(f"\n  threshold                 {threshold:.3f}")
    print(f"  held-out plants  median   {np.median(s_held):.3f}")
    print(f"  non-plants       median   {np.median(s_neg):.3f}   p95 {np.percentile(s_neg,95):.3f}")
    print(f"\n  FALSE REJECT (real plant flagged)   {false_reject:6.1%}")
    print(f"  FALSE ACCEPT (chair accepted)       {false_accept:6.1%}   <- the one that matters")
    print(f"  AUC                                 {auc:.3f}")
    print(f"\n  {other_name} flagged: {float((s_other < threshold).mean()):6.1%}")
    print("     ^ cross-domain transfer. High is not a bug in the check, it is")
    print("       the limit of the reference set: it only recognises plants")
    print("       photographed the way the reference photos were.")

    out = ROOT / "docs" / "plant_check_validation.json"
    out.write_text(
        json.dumps(
            {
                "reference": args.reference,
                "negative_dataset": NOT_PLANTS,
                "n_reference": len(ref),
                "n_held_out": len(held),
                "n_non_plants": len(NEG),
                "threshold": threshold,
                "false_reject_rate": false_reject,
                "false_accept_rate": false_accept,
                "auc": auc,
                "cross_domain_flag_rate": float((s_other < threshold).mean()),
                "cross_domain_set": other_name,
            },
            indent=2,
        )
    )
    print(f"\n  written to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
