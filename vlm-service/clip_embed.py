"""CLIP ViT-B/32 image embeddings via ONNX Runtime — the SEMANTIC half of the Agent-1 AND-gate.

The same-item gate requires two complementary signals (measured on Marqo/deepfashion-inshop):
  CLIP    semantic — separates items that LOOK different (a floral vs a striped dress). Strong AUC
          on semantically-varied negatives; weak on look-alikes (rates two black jeans as "same").
  DINOv2  instance — separates look-alikes (same category+colour, different item). See dino_embed.py.
A listing must clear BOTH bars, so a false accept has to fool the semantic AND the instance signal.

Served with onnxruntime only (no torch): the vision encoder is exported once by
scripts/export_clip_onnx.py to a pinned model.onnx, then run here on the local py3.14 box and the
py3.11 Space identically. Degrades safely: model file absent → available() False, gate falls back to
DINOv2-only (documented downgrade), never a fabricated embedding.
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

EMBED_DIM = 512

# CLIP image-processor defaults: resize shortest edge → 224 (bicubic), center-crop 224, CLIP normalise.
_RESIZE = int(os.getenv("CLIP_RESIZE", "224"))
_CROP = int(os.getenv("CLIP_CROP", "224"))
_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)

_DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "clip-vit-b32" / "model.onnx"
_MODEL_PATH = Path(os.getenv("CLIP_ONNX_PATH", str(_DEFAULT_MODEL)))

_session = None
_input_name: Optional[str] = None
_output_name: Optional[str] = None
_load_error: Optional[str] = None


def _load():
    global _session, _input_name, _output_name, _load_error
    if _session is not None or _load_error is not None:
        return
    try:
        if not _MODEL_PATH.exists():
            _load_error = f"model file absent at {_MODEL_PATH}"
            return
        import onnxruntime as ort

        sess = ort.InferenceSession(str(_MODEL_PATH), providers=["CPUExecutionProvider"])
        _input_name = sess.get_inputs()[0].name
        _output_name = sess.get_outputs()[0].name
        _session = sess
    except Exception as e:  # noqa: BLE001 — degrade, never fabricate
        _load_error = f"{type(e).__name__}: {e}"


def available() -> bool:
    _load()
    return _session is not None


def load_error() -> Optional[str]:
    _load()
    return _load_error


def _preprocess(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    scale = _RESIZE / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BICUBIC)
    w2, h2 = img.size
    left, top = (w2 - _CROP) // 2, (h2 - _CROP) // 2
    img = img.crop((left, top, left + _CROP, top + _CROP))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - _MEAN) / _STD
    return np.ascontiguousarray(np.transpose(arr, (2, 0, 1))[None, ...], dtype=np.float32)


def embed(data: bytes) -> np.ndarray:
    """L2-normalised 512-d CLIP image embedding. Raises if unavailable."""
    _load()
    if _session is None:
        raise RuntimeError(f"CLIP ONNX unavailable ({_load_error})")
    out = _session.run([_output_name], {_input_name: _preprocess(data)})[0]
    v = np.asarray(out, dtype=np.float64).reshape(-1)
    n = np.linalg.norm(v)
    return (v / n) if n else v


def cosine(a: bytes, b: bytes) -> float:
    va, vb = embed(a), embed(b)
    return float(max(0.0, min(1.0, float(np.dot(va, vb)))))


def semantic_score(catalog_bytes: bytes, live_bytes: bytes) -> float:
    """Whole-frame CLIP cosine — the semantic same-item signal. CLIP is background-sensitive, but the
    whole frame gave the strongest semantic separation in eval; the DINOv2 half carries clutter
    robustness. Clamped to [0,1]."""
    return cosine(catalog_bytes, live_bytes)


if __name__ == "__main__":
    import sys

    if "--selftest" in sys.argv:
        d = Path(__file__).resolve().parent / "test_data"
        if not available():
            print(f"CLIP unavailable: {load_error()}")
            sys.exit(1)
        cat = (d / "real_kurti_catalog.png").read_bytes()
        same = (d / "real_kurti_live.jpg").read_bytes()
        other = (d / "real_other_dress.png").read_bytes()
        print(f"dim         : {embed(cat).shape}")
        print(f"same-kurti  : {cosine(cat, same):.4f}")
        print(f"other-dress : {cosine(cat, other):.4f}")
