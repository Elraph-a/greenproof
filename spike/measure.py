"""GreenProof - can image matching identify a specific tree?

Standalone. Measures RANK-1 RETRIEVAL over the spike photos:

    for each photo, find its most similar photo among all the others.
    is that photo of the same tree?

That is the operational question - "a check-in arrives; does the right tree come
back first?" - and it needs no wide/close labels, which is why it is the metric
we trust. See FINDINGS.md for the three labelling approaches that failed.

Result on 28 Jul 2026: 54.2% rank-1 against 5.1% chance, pooled AUC 0.77.
Real signal, nowhere near enough to carry identity on its own.

RUN:  python spike/measure.py
"""

import os
import re
import sys
import glob
import itertools
import numpy as np
from PIL import Image

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

PHOTO_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "spike")
MODEL_REPO = "onnx-community/dinov2-small"

# The camera app burned a timestamp into the bottom-left of every photo. It is
# identical across all images, so leaving it in nudges every pair toward looking
# similar. Crop it off.
WATERMARK_CROP = 0.12
IMG_SIZE = 224                      # DINOv2 uses 14px patches; 224 = 16 x 14
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def load_index():
    """Map each photo file to its tree number.

    Files are numbered NEWEST-FIRST (photo_74 was shot first). Number cards sit
    at indices 74, 69, 64 ... 4 (i.e. index % 5 == 4) and each card is followed
    by that tree's four photos. Verified against the cards' burned-in times:
    photo_74 = card "1" at 14:33, photo_4 = card "15" at 14:52.
    """
    rows = []
    for f in sorted(glob.glob(os.path.join(PHOTO_DIR, "*.jpg"))):
        m = re.search(r"photo_(\d+)_", os.path.basename(f))
        if not m:
            continue
        idx = int(m.group(1))
        card_idx = idx + ((4 - idx) % 5)          # nearest card at or above idx
        if card_idx == idx:                        # this IS a card, not a tree
            continue
        rows.append({"path": f, "tree": (79 - card_idx) // 5, "idx": idx})
    if not rows:
        sys.exit(f"No photos found in {PHOTO_DIR}")
    return rows


def preprocess(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    img = img.crop((0, 0, w, int(h * (1 - WATERMARK_CROP))))
    # Resize the whole frame rather than centre-cropping: a centre crop throws
    # away the surroundings, and for the wide shots that IS the signal.
    img = img.resize((IMG_SIZE, IMG_SIZE), Image.BICUBIC)
    a = np.asarray(img, dtype=np.float32) / 255.0
    return ((a - _MEAN) / _STD).transpose(2, 0, 1)


def get_model_path():
    from huggingface_hub import hf_hub_download, list_repo_files
    onnx = [f for f in list_repo_files(MODEL_REPO) if f.endswith(".onnx")]
    full = [f for f in onnx if not any(q in f.lower() for q in
                                       ("quant", "int8", "uint8", "q4", "fp16", "bnb"))]
    return hf_hub_download(MODEL_REPO, sorted(full or onnx, key=len)[0])


def main():
    print(__doc__)
    rows = load_index()
    trees = np.array([r["tree"] for r in rows])

    # ONNX Runtime, not PyTorch - it is what the deployed ML service will use,
    # so this exercises the same runtime we ship.
    import onnxruntime as ort
    sess = ort.InferenceSession(get_model_path(),
                                providers=["CPUExecutionProvider"])
    name = sess.get_inputs()[0].name

    print(f"Embedding {len(rows)} photos (first run downloads ~90MB)...")
    E = []
    for i, r in enumerate(rows, 1):
        arr = sess.run(None, {name: preprocess(r["path"])[None, ...]})[0]
        v = arr[0, 0].astype(np.float32)          # CLS token summarises the image
        E.append(v / (np.linalg.norm(v) + 1e-9))  # unit length -> dot = cosine
        if i % 20 == 0:
            print(f"  {i}/{len(rows)}")
    E = np.stack(E)

    S = E @ E.T
    np.fill_diagonal(S, -np.inf)                  # never retrieve itself
    same = trees[np.argsort(-S, axis=1)] == trees[:, None]
    n = len(rows)

    print("\n" + "=" * 70)
    print("RESULT")
    print("=" * 70)
    chance = np.mean([(trees == t).sum() - 1 for t in trees]) / (n - 1)
    print(f"  {n} photos, {len(set(trees))} trees, chance rank-1 ~ {chance*100:.1f}%\n")
    for k in (1, 3, 5):
        print(f"  rank-{k}: {same[:, :k].any(axis=1).mean()*100:5.1f}%")

    print("\n  per tree (rank-1):")
    for t in sorted(set(trees)):
        acc = same[trees == t, 0].mean()
        print(f"    tree {t:2d}  {acc*100:5.1f}%  {'#' * int(acc * 20)}")

    from sklearn.metrics import roc_auc_score
    pairs = list(itertools.combinations(range(n), 2))
    y = np.array([1 if trees[a] == trees[b] else 0 for a, b in pairs])
    s = np.array([S[a, b] for a, b in pairs])
    print(f"\n  pooled AUC: {roc_auc_score(y, s):.4f}")
    print(f"    same tree      {y.sum():4d} pairs, mean {s[y == 1].mean():.3f}")
    print(f"    different tree {(1-y).sum():4d} pairs, mean {s[y == 0].mean():.3f}")

    print("""
READ THIS BEFORE QUOTING THE NUMBER
  Results are bimodal: near-perfect on trees with distinctive surroundings,
  near-zero inside a dense stand of one species. A plantation is the hard case.

  All photos were taken within ~19 minutes, so there is no weather, growth or
  lighting change. Real check-ins are a week apart - treat this as an UPPER
  BOUND on cross-week performance.
""")


if __name__ == "__main__":
    main()
