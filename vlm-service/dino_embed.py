"""DINOv2 image embeddings via ONNX Runtime — the same-INSTANCE backbone for Agent 1.

Why DINOv2 over CLIP here (research-grounded, not a guess): CLIP is trained image-text
contrastive, so its space clusters by *semantic category* — two DIFFERENT black floral kurtis
land close together, which is exactly the case a possession gate must separate. DINOv2 is
self-supervised (self-distillation on images only) and its features are markedly stronger at
*instance-level* retrieval and fine-grained discrimination — top-1 precision in particular
(Oquab et al. 2023, arXiv:2304.07193; corroborated by public CLIP-vs-DINOv2 retrieval studies).

Runtime choice: we serve with **onnxruntime only** (no torch). torch is used once, offline, to
export `facebook/dinov2-small` → a pinned `model.onnx` (see scripts/export_dinov2_onnx.py); the
serving container then stays lean and its behaviour is frozen against transformers upgrades.
onnxruntime ships cp314 wheels, so this identical path runs on the local Python 3.14 box AND the
Python 3.11 CPU Space — killing the old silent CLIP→phash degrade.

Degrades safely: if the ONNX model file is absent or the session fails to load, `available()` is
False and the caller falls back to the perceptual-hash path (never a fabricated embedding).
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

# DINOv2-small emits a 384-d descriptor (vs CLIP ViT-B/32's 512-d): more discriminative for
# instance matching AND cheaper to store/compare in Qdrant.
EMBED_DIM = 384

# HF DINOv2 image-processor defaults (BitImageProcessor) — reproduced here in pure PIL/numpy so
# the runtime needs no transformers/torch. shortest-edge resize → center crop → ImageNet normalise.
_RESIZE_SHORTEST = int(os.getenv("DINOV2_RESIZE", "256"))
_CROP = int(os.getenv("DINOV2_CROP", "224"))  # 224 = 16×14, a whole number of ViT-S/14 patches
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "dinov2-small" / "model.onnx"
_MODEL_PATH = Path(os.getenv("DINOV2_ONNX_PATH", str(_DEFAULT_MODEL)))

# Pooling of the token sequence into one descriptor. From eval: "cls_mean" (concat of the CLS token
# and the mean of patch tokens, each L2-normalised) separates instances best while keeping a healthy
# cosine scale; "cls" and "mean" are available for comparison. Env-selectable, no re-export needed.
_POOLING = os.getenv("DINOV2_POOLING", "cls_mean").lower()

_session = None
_input_name: Optional[str] = None
_output_name: Optional[str] = None
_load_error: Optional[str] = None


def _load():
    """Lazily build the onnxruntime session. Records (not raises) any load error so callers degrade."""
    global _session, _input_name, _output_name, _load_error
    if _session is not None or _load_error is not None:
        return
    try:
        if not _MODEL_PATH.exists():
            _load_error = f"model file absent at {_MODEL_PATH}"
            return
        import onnxruntime as ort

        so = ort.SessionOptions()
        so.intra_op_num_threads = int(os.getenv("DINOV2_THREADS", "0")) or 0  # 0 → ort default
        sess = ort.InferenceSession(str(_MODEL_PATH), so, providers=["CPUExecutionProvider"])
        _input_name = sess.get_inputs()[0].name
        _output_name = sess.get_outputs()[0].name  # last_hidden_state (1, 1+P, 384)
        _session = sess
    except Exception as e:  # noqa: BLE001 — any failure → degrade to phash, never fabricate
        _load_error = f"{type(e).__name__}: {e}"


def available() -> bool:
    _load()
    return _session is not None


def load_error() -> Optional[str]:
    _load()
    return _load_error


def _preprocess(data: bytes) -> np.ndarray:
    """bytes → (1, 3, 224, 224) float32, matching the HF DINOv2 processor."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    # Resize shortest edge to _RESIZE_SHORTEST (bicubic), preserving aspect ratio.
    scale = _RESIZE_SHORTEST / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BICUBIC)
    # Center-crop the _CROP×_CROP square.
    w2, h2 = img.size
    left, top = (w2 - _CROP) // 2, (h2 - _CROP) // 2
    img = img.crop((left, top, left + _CROP, top + _CROP))
    arr = np.asarray(img, dtype=np.float32) / 255.0          # rescale to [0,1]
    arr = (arr - _MEAN) / _STD                               # ImageNet normalise
    arr = np.transpose(arr, (2, 0, 1))[None, ...]            # HWC → NCHW
    return np.ascontiguousarray(arr, dtype=np.float32)


def _l2(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return (v / n) if n else v


def _pool(seq: np.ndarray, pooling: str) -> np.ndarray:
    """Pool last_hidden_state (1, 1+P, D) → one descriptor per the given strategy.

    token 0 is the CLS token; tokens 1: are the P patch tokens.
      cls       CLS token only (D)                       — global, shape-leaning.
      mean      mean of patch tokens (D)                 — texture/local, background-sensitive.
      cls_mean  concat(L2(CLS), L2(mean-patch)) (2D)     — CLS + texture.
    The returned descriptor is L2-normalised as a whole so `cosine` is a dot product.
    """
    a = np.asarray(seq, dtype=np.float64)
    if a.ndim == 3:
        a = a[0]                          # (1+P, D) → drop batch
    cls = a[0]
    patch_mean = a[1:].mean(axis=0) if a.shape[0] > 1 else cls
    if pooling == "cls":
        return _l2(cls)
    if pooling == "mean":
        return _l2(patch_mean)
    return _l2(np.concatenate([_l2(cls), _l2(patch_mean)]))  # cls_mean


def embed(data: bytes, pooling: Optional[str] = None) -> np.ndarray:
    """Return the L2-normalised DINOv2 descriptor for one image. Raises if unavailable."""
    _load()
    if _session is None:
        raise RuntimeError(f"DINOv2 ONNX unavailable ({_load_error})")
    x = _preprocess(data)
    out = _session.run([_output_name], {_input_name: x})[0]
    return _pool(out, pooling or _POOLING)


def cosine(a: bytes, b: bytes, pooling: Optional[str] = None) -> float:
    """Cosine similarity of two DINOv2 descriptors, clamped to [0,1] (both are unit vectors)."""
    va, vb = embed(a, pooling), embed(b, pooling)
    return float(max(0.0, min(1.0, float(np.dot(va, vb)))))


def instance_score(catalog_bytes: bytes, live_bytes: bytes,
                   repr: str = "max", pooling: Optional[str] = None) -> dict:
    """DINOv2 same-INSTANCE similarity for the given representation.

    repr:
      whole  whole-frame cosine — strongest when both sides are clean studio shots.
      crop   natural-crop cosine — strongest when the live capture is cluttered (bedsheet, hands);
             black-matted crops are OOD for DINOv2, so the crop keeps natural pixels (zero_bg=False).
      max    max(whole, crop) — domain-robust: picks whichever regime applies without detecting
             clutter. A DIFFERENT item stays low in BOTH, so max does not manufacture a false accept.
    Returns {score, method, pooling, whole, crop, picked}.
    """
    pooling = pooling or _POOLING
    whole = cosine(catalog_bytes, live_bytes, pooling) if repr in ("whole", "max") else 0.0
    crop = 0.0
    if repr in ("crop", "max"):
        import segment  # lazy — segment pulls cv2; keep dino_embed importable without it

        cc = segment.segment_garment(catalog_bytes, zero_bg=False)["bytes"]
        lc = segment.segment_garment(live_bytes, zero_bg=False)["bytes"]
        crop = cosine(cc, lc, pooling)
    score = max(whole, crop) if repr == "max" else (whole if repr == "whole" else crop)
    return {
        "score": round(score, 4), "method": "dinov2", "pooling": pooling, "repr": repr,
        "whole": round(whole, 4), "crop": round(crop, 4),
        "picked": "crop" if crop >= whole else "whole",
    }


if __name__ == "__main__":  # self-check on the committed real fixtures
    import sys

    if "--selftest" in sys.argv:
        d = Path(__file__).resolve().parent / "test_data"
        if not available():
            print(f"DINOv2 unavailable: {load_error()}")
            sys.exit(1)
        cat = (d / "real_kurti_catalog.png").read_bytes()
        same = (d / "real_kurti_live.jpg").read_bytes()
        other = (d / "real_other_dress.png").read_bytes()
        print(f"dim           : {embed(cat).shape}")
        print(f"same-kurti    : {cosine(cat, same):.4f}  (expect HIGH)")
        print(f"other-dress   : {cosine(cat, other):.4f}  (expect LOWER)")
        print(f"margin        : {cosine(cat, same) - cosine(cat, other):+.4f}")
