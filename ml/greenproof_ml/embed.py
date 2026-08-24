"""DINOv2 embeddings via ONNX Runtime.

Preprocessing is deliberately IDENTICAL to spike/measure.py. That file produced
the numbers we publish - rank-1 54.2%, AUC 0.77 - and if production resized or
normalised differently, those numbers would no longer describe this system. The
published figure has to be a measurement of the thing we shipped.

The one intentional difference: the spike cropped a camera-app timestamp
watermark off the bottom of every frame. App photos have no watermark, so the
crop is zero here and configurable rather than deleted, so the spike can be
re-run against production-shaped inputs.
"""

from __future__ import annotations

import functools
import threading

import numpy as np
from PIL import Image

MODEL_REPO = "onnx-community/dinov2-small"

# DINOv2 uses 14px patches; 224 = 16 x 14.
IMG_SIZE = 224
EMBED_DIM = 384

# ImageNet statistics - what DINOv2 was trained with.
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_lock = threading.Lock()


def _model_path() -> str:
    """Download the full-precision ONNX weights, skipping quantised variants.

    Quantised weights would halve memory but shift every cosine similarity
    slightly, which moves the thresholds we cross-validated. Not worth it at
    ~90 MB on a 16 GB box.
    """
    from huggingface_hub import hf_hub_download, list_repo_files

    onnx = [f for f in list_repo_files(MODEL_REPO) if f.endswith(".onnx")]
    full = [
        f
        for f in onnx
        if not any(q in f.lower() for q in ("quant", "int8", "uint8", "q4", "fp16", "bnb"))
    ]
    return hf_hub_download(MODEL_REPO, sorted(full or onnx, key=len)[0])


@functools.lru_cache(maxsize=1)
def _session():
    import onnxruntime as ort

    opts = ort.SessionOptions()
    # Free Spaces gives 2 vCPUs. Letting ORT spawn more threads than that makes
    # it slower, not faster.
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    return ort.InferenceSession(
        _model_path(), sess_options=opts, providers=["CPUExecutionProvider"]
    )


def warm() -> None:
    """Force model download + graph load at startup rather than on first request."""
    sess = _session()
    name = sess.get_inputs()[0].name
    sess.run(None, {name: np.zeros((1, 3, IMG_SIZE, IMG_SIZE), dtype=np.float32)})


def preprocess(img: Image.Image, watermark_crop: float = 0.0) -> np.ndarray:
    img = img.convert("RGB")
    if watermark_crop:
        w, h = img.size
        img = img.crop((0, 0, w, int(h * (1 - watermark_crop))))

    # Resize the WHOLE frame rather than centre-cropping. For the wide shot the
    # surroundings are a large part of the signal - the spike showed matching
    # works partly off the background - and a centre crop throws exactly that
    # away.
    img = img.resize((IMG_SIZE, IMG_SIZE), Image.BICUBIC)
    a = np.asarray(img, dtype=np.float32) / 255.0
    return ((a - _MEAN) / _STD).transpose(2, 0, 1)


def embed(img: Image.Image) -> np.ndarray:
    """L2-normalised 384-d CLS embedding. Dot product of two of these is cosine."""
    x = preprocess(img)[None, ...]
    with _lock:  # ORT sessions are not guaranteed thread-safe for concurrent run()
        out = _session().run(None, {_session().get_inputs()[0].name: x})[0]
    v = out[0, 0].astype(np.float32)  # CLS token summarises the image
    return v / (np.linalg.norm(v) + 1e-9)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))
