"""Fine-tuned garment same-INSTANCE embedding via ONNX Runtime — the Agent-1 root-fix matcher.

WHY THIS MODULE EXISTS
The generic SigLIP/CLIP/DINOv2 embeddings are trained for semantic similarity, so a GENUINE same
garment shown very differently — an on-model studio catalog shot vs a flat-lay on the floor — can
dip below the same-item bar (measured: a real green tee pair scored SigLIP cosine 0.735, just under
the 0.75 bar, and the cloud VLM tie-breaker that was supposed to rescue it 503'd). The fix is a
matcher TRAINED on exactly that gap: DINOv2-small fine-tuned with metric learning on DeepFashion
(same instance across pose = positives; same category+colour different item = hard negatives), so
same-instance cosine sits well ABOVE different-instance across pose/lighting/framing — no external
tie-breaker needed. Training lives in training/train_garment_embed.py; export in
scripts/export_garment_onnx.py; this module only SERVES the exported artifact.

RUNTIME
Served with onnxruntime alone (no torch), identical to clip_embed.py / dino_embed.py — one pinned
model.onnx, loaded once, CPU. The fine-tuned backbone shares DINOv2's preprocessing (shortest-edge
resize → centre crop → ImageNet normalise) and emits last_hidden_state (1, 1+P, D); we pool with the
strategy the calibration selected. If the weights are absent (not yet trained / not synced) or the
session fails to load, available() is False and the caller falls back to the SigLIP → CLIP → phash
cascade — never a fabricated embedding, never a hard crash.
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

# Fine-tuned DINOv2-small backbone: 384-d token dim; we emit the full token sequence and pool at
# serve time (same contract as dino_embed) so the pooling can be re-picked from calibration without
# re-exporting the ONNX.
EMBED_DIM = 384

# Preprocessing MUST match training exactly. DINOv2 image-processor defaults, reproduced in PIL/numpy
# so the runtime needs no transformers/torch (mirrors dino_embed._preprocess).
_RESIZE_SHORTEST = int(os.getenv("GARMENT_RESIZE", "256"))
_CROP = int(os.getenv("GARMENT_CROP", "224"))
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# Pooling of the token sequence into one descriptor — set by training/calibration (default cls_mean,
# the strongest instance-discriminating pool in the DINOv2 eval). Env-selectable, no re-export needed.
_POOLING = os.getenv("GARMENT_POOLING", "cls_mean").lower()

_DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "garment-dinov2" / "model.onnx"
_MODEL_PATH = Path(os.getenv("GARMENT_ONNX_PATH", str(_DEFAULT_MODEL)))

_session = None
_input_name: Optional[str] = None
_output_name: Optional[str] = None
_load_error: Optional[str] = None


def _load():
    """Lazily build the onnxruntime session. Records (not raises) any load error so callers degrade.

    Best-effort Hub sync first: if GARMENT_HF_REPO is set and the local artifact is missing, pull it
    once (like hub.sync_grading). On any failure the local/absent state stands and available() is False.
    """
    global _session, _input_name, _output_name, _load_error
    if _session is not None:
        return  # already loaded — short-circuit
    try:
        if not _MODEL_PATH.exists():
            _sync_from_hub()  # no-op unless GARMENT_HF_REPO is configured
        if not _MODEL_PATH.exists():
            # Absent is TRANSIENT (a cold-start Hub sync may not have run/finished) — record but DO NOT
            # cache as a permanent error, so the next call (or the startup warmup) retries the sync.
            _load_error = (f"model file absent at {_MODEL_PATH}"
                           + (" (GARMENT_HF_REPO set — will retry sync)" if os.getenv("GARMENT_HF_REPO")
                              else " (no GARMENT_HF_REPO)"))
            return
        import onnxruntime as ort

        so = ort.SessionOptions()
        so.intra_op_num_threads = int(os.getenv("GARMENT_THREADS", "0")) or 0  # 0 → ort default
        sess = ort.InferenceSession(str(_MODEL_PATH), so, providers=["CPUExecutionProvider"])
        _input_name = sess.get_inputs()[0].name
        _output_name = sess.get_outputs()[0].name  # last_hidden_state (1, 1+P, 384)
        _session = sess
        _load_error = None
    except Exception as e:  # noqa: BLE001 — any failure → degrade to the SigLIP/CLIP cascade
        _load_error = f"{type(e).__name__}: {e}"


def warmup() -> bool:
    """Eagerly sync (from the Hub) + load at startup so the first verification is warm and the sync
    runs while the container is fully networked (not mid-request). Safe to call repeatedly."""
    _load()
    return _session is not None


_CAL_PATH = Path(__file__).resolve().parent / "models" / "garment_calibration.json"
_threshold: Optional[float] = None


def _sync_from_hub() -> None:
    """Pull model.onnx AND garment_calibration.json from the Hub repo if configured and missing.
    Silent on failure — the serving path keeps working via the fallback cascade. Syncing the
    calibration too keeps the same-item BAR data-driven (the learned gate_threshold), not a hand-set
    env number."""
    repo = os.getenv("GARMENT_HF_REPO")
    if not repo:
        return
    import shutil

    from huggingface_hub import hf_hub_download

    _MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    for fname, dst in (("model.onnx", _MODEL_PATH), ("garment_calibration.json", _CAL_PATH)):
        if dst.exists():
            continue
        try:
            p = hf_hub_download(repo_id=repo, filename=fname, repo_type="model",
                                revision=os.getenv("GARMENT_HF_REVISION", "main"),
                                token=os.getenv("HF_TOKEN"))
            shutil.copyfile(p, dst)
        except Exception:  # noqa: BLE001 — model must sync; calibration is best-effort (bar falls back)
            pass


def available() -> bool:
    _load()
    return _session is not None


def load_error() -> Optional[str]:
    _load()
    return _load_error


def threshold() -> Optional[float]:
    """The learned same-item PASS bar (gate_threshold) from the Hub-synced garment_calibration.json —
    DATA-DRIVEN, written by training, not a hand-set number. None if the calibration isn't present
    (caller then uses its GARMENT_THRESHOLD env/default). Cached after first read; loads the model
    (and thus syncs the calibration) on first call."""
    global _threshold
    if _threshold is not None:
        return _threshold
    _load()  # ensures the Hub sync (model + calibration) has run
    try:
        import json as _json

        _threshold = float(_json.loads(_CAL_PATH.read_text()).get("gate_threshold"))
    except Exception:  # noqa: BLE001 — no/invalid calibration → caller falls back
        _threshold = None
    return _threshold


def model_id() -> str:
    return os.getenv("GARMENT_HF_REPO") or str(_MODEL_PATH)


def _preprocess(data: bytes) -> np.ndarray:
    """bytes → (1, 3, 224, 224) float32 — identical to dino_embed / training preprocessing."""
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    scale = _RESIZE_SHORTEST / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BICUBIC)
    w2, h2 = img.size
    left, top = (w2 - _CROP) // 2, (h2 - _CROP) // 2
    img = img.crop((left, top, left + _CROP, top + _CROP))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    arr = (arr - _MEAN) / _STD
    return np.ascontiguousarray(np.transpose(arr, (2, 0, 1))[None, ...], dtype=np.float32)


def _l2(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return (v / n) if n else v


def _pool(seq: np.ndarray, pooling: str) -> np.ndarray:
    """last_hidden_state (1, 1+P, D) → one L2-normalised descriptor (same strategy set as dino_embed)."""
    a = np.asarray(seq, dtype=np.float64)
    if a.ndim == 3:
        a = a[0]
    cls = a[0]
    patch_mean = a[1:].mean(axis=0) if a.shape[0] > 1 else cls
    if pooling == "cls":
        return _l2(cls)
    if pooling == "mean":
        return _l2(patch_mean)
    return _l2(np.concatenate([_l2(cls), _l2(patch_mean)]))  # cls_mean


def embed(data: bytes, pooling: Optional[str] = None) -> Optional[np.ndarray]:
    """L2-normalised fine-tuned garment descriptor, or None if the model/image is unusable.

    Returns None (not raise) on an unavailable model or a bad image so the /vlm/match cascade can
    fall through cleanly — mirrors siglip_embed.embed's None-on-failure contract.
    """
    _load()
    if _session is None:
        return None
    try:
        out = _session.run([_output_name], {_input_name: _preprocess(data)})[0]
        return _pool(out, pooling or _POOLING)
    except Exception:  # noqa: BLE001 — one bad image must not fail the pipeline
        return None


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity of two already-normalised descriptors, clamped to [0,1]."""
    return float(max(0.0, min(1.0, float(np.dot(a, b)))))


if __name__ == "__main__":  # self-check on the committed real fixtures
    import sys

    if "--selftest" in sys.argv:
        d = Path(__file__).resolve().parent / "test_data"
        if not available():
            print(f"garment matcher unavailable: {load_error()}")
            sys.exit(1)
        cat = (d / "real_kurti_catalog.png").read_bytes()
        same = (d / "real_kurti_live.jpg").read_bytes()
        other = (d / "real_other_dress.png").read_bytes()
        ec, es, eo = embed(cat), embed(same), embed(other)
        print(f"dim         : {ec.shape}")
        print(f"same-kurti  : {cosine(ec, es):.4f}  (expect HIGH)")
        print(f"other-dress : {cosine(ec, eo):.4f}  (expect LOWER)")
        print(f"margin      : {cosine(ec, es) - cosine(ec, eo):+.4f}")
