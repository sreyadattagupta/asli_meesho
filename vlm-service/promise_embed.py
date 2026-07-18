"""Fine-tuned delivery-vs-catalog same-PRODUCT embedding via ONNX Runtime — the Agent-4 matcher.

WHY THIS MODULE EXISTS
Agent 4 compares a frozen studio catalog image against a photo the BUYER took of the parcel:
handheld, indoor light, off-axis, re-JPEGed. The generic cascade cannot span that gap. Measured on
the deployed service against a real pair (same kurti, studio vs handheld) the phash floor scored
0.5938 — BELOW the 0.72 legacy bar — while a genuinely different dress scored 0.4688. A 0.12 margin
with the bar above both means every honest delivery was returned as `same_product: false`, and the
strict gate in promiseKeeper.ts then showed the buyer "Different product detected" on a correct
parcel. The Hub calibration measures the same thing: the pretrained baseline false-accuses 64.6% of
honest deliveries (auc 0.655); the fine-tune drops that to 6.6% (auc 0.966, pos_mean 0.859 vs
neg_mean 0.336).

WHY NOT AGENT 1's MATCHER
garment_embed learned studio↔studio (DeepFashion In-shop cross-pose). Agent 4's second image is a
consumer parcel photo — a different domain. The two models stay distinct on purpose, and the delivery
bar is deliberately LOWER (neg_quantile 0.90 vs Agent 1's 0.95): Agent 4's expensive error is
accusing an honest seller and docking their trust score, not letting a thief through.

RUNTIME
Served with onnxruntime alone (no torch), identical to garment_embed / dino_embed — one pinned
model.onnx, loaded once, CPU. Shares DINOv2 preprocessing (shortest-edge resize → centre crop →
ImageNet normalise) and emits last_hidden_state (1, 1+P, D), pooled with the strategy the calibration
selected. If the weights are absent or the session fails to load, available() is False and the caller
falls back to the legacy cv.similarity cascade — never a fabricated embedding, never a hard crash.
"""
from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

# Fine-tuned DINOv2-small backbone: 384-d token dim; the full token sequence is emitted and pooled at
# serve time (same contract as garment_embed) so pooling can be re-picked from calibration without
# re-exporting the ONNX.
EMBED_DIM = 384

# Preprocessing MUST match training exactly — DINOv2 image-processor defaults in PIL/numpy so the
# runtime needs no transformers/torch (mirrors garment_embed._preprocess).
_RESIZE_SHORTEST = int(os.getenv("PROMISE_RESIZE", "256"))
_CROP = int(os.getenv("PROMISE_CROP", "224"))
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# Pooling of the token sequence into one descriptor — set by training/calibration (cls_mean, per the
# artifact's "gate_signal": "promise/cls_mean"). Env-selectable, no re-export needed.
_POOLING = os.getenv("PROMISE_POOLING", "cls_mean").lower()

_DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "promise-dinov2" / "model.onnx"
_MODEL_PATH = Path(os.getenv("PROMISE_ONNX_PATH", str(_DEFAULT_MODEL)))
_CAL_PATH = Path(__file__).resolve().parent / "models" / "promise_calibration.json"

_session = None
_input_name: Optional[str] = None
_output_name: Optional[str] = None
_load_error: Optional[str] = None
_threshold: Optional[float] = None
# Why the last Hub sync failed. Swallowing this was a mistake: the first deploy reported only "model
# file absent", which is indistinguishable between a download that is still running and one that
# cannot succeed, so there was nothing to debug from.
_sync_error: Optional[str] = None


def _sync_from_hub() -> None:
    """Pull model.onnx AND promise_calibration.json from the Hub repo if configured and missing.
    Silent on failure — the serving path keeps working via the legacy cascade. Syncing the calibration
    too keeps the same-product BAR data-driven (the learned gate_threshold), not a hand-set env number.
    """
    global _sync_error
    repo = os.getenv("PROMISE_HF_REPO")
    if not repo:
        return
    import shutil

    from huggingface_hub import hf_hub_download

    try:
        _MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    except Exception as e:  # noqa: BLE001 — e.g. a read-only image layer
        _sync_error = f"mkdir {_MODEL_PATH.parent}: {type(e).__name__}: {e}"
        return
    for fname, dst in (("model.onnx", _MODEL_PATH), ("promise_calibration.json", _CAL_PATH)):
        if dst.exists():
            continue
        try:
            p = hf_hub_download(repo_id=repo, filename=fname, repo_type="model",
                                revision=os.getenv("PROMISE_HF_REVISION", "main"),
                                token=os.getenv("HF_TOKEN"),
                                cache_dir=os.getenv("HF_HOME") or None)
            shutil.copyfile(p, dst)
        except Exception as e:  # noqa: BLE001 — degrade, but SAY WHY (health surfaces sync_error)
            _sync_error = f"{fname}: {type(e).__name__}: {e}"


def _load():
    """Lazily build the onnxruntime session. Records (not raises) any load error so callers degrade.

    Best-effort Hub sync first: if PROMISE_HF_REPO is set and the local artifact is missing, pull it
    once. On any failure the local/absent state stands and available() is False.
    """
    global _session, _input_name, _output_name, _load_error
    if _session is not None:
        return  # already loaded — short-circuit
    try:
        if not _MODEL_PATH.exists():
            _sync_from_hub()  # no-op unless PROMISE_HF_REPO is configured
        if not _MODEL_PATH.exists():
            # Absent is TRANSIENT (a cold-start Hub sync may not have run/finished) — record but DO NOT
            # cache as a permanent error, so the next call (or the startup warmup) retries the sync.
            # In the serving image HF_HUB_OFFLINE=1 blocks Hub access, so the model is BAKED at build
            # time (see Dockerfile) and a missing file means the bake step did not run — say that,
            # rather than promising a retry that cannot happen.
            offline = os.getenv("HF_HUB_OFFLINE") in ("1", "true", "True")
            _load_error = (f"model file absent at {_MODEL_PATH}"
                           + (" (HF_HUB_OFFLINE=1 — must be baked into the image at build)" if offline
                              else " (PROMISE_HF_REPO set — will retry sync)" if os.getenv("PROMISE_HF_REPO")
                              else " (no PROMISE_HF_REPO)"))
            return
        import onnxruntime as ort

        so = ort.SessionOptions()
        so.intra_op_num_threads = int(os.getenv("PROMISE_THREADS", "0")) or 0  # 0 → ort default
        sess = ort.InferenceSession(str(_MODEL_PATH), so, providers=["CPUExecutionProvider"])
        _input_name = sess.get_inputs()[0].name
        _output_name = sess.get_outputs()[0].name  # last_hidden_state (1, 1+P, 384)
        _session = sess
        _load_error = None
    except Exception as e:  # noqa: BLE001 — any failure → degrade to the legacy cascade
        _load_error = f"{type(e).__name__}: {e}"


def warmup() -> bool:
    """Eagerly sync (from the Hub) + load at startup so the first delivery check is warm and the sync
    runs while the container is fully networked (not mid-request). Safe to call repeatedly."""
    _load()
    return _session is not None


def available() -> bool:
    _load()
    return _session is not None


def load_error() -> Optional[str]:
    _load()
    return _load_error


def sync_error() -> Optional[str]:
    """Why the Hub pull failed, if it did — surfaced on /health so an absent model is diagnosable."""
    _load()
    return _sync_error


def threshold() -> Optional[float]:
    """The learned same-product PASS bar (gate_threshold) from the Hub-synced promise_calibration.json
    — DATA-DRIVEN, written by training, not a hand-set number. None if the calibration isn't present
    (caller then uses its PROMISE_THRESHOLD env/default). Cached after first read."""
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
    return os.getenv("PROMISE_HF_REPO") or str(_MODEL_PATH)


def _preprocess(data: bytes) -> np.ndarray:
    """bytes → (1, 3, 224, 224) float32 — identical to garment_embed / training preprocessing."""
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
    """L2-normalised fine-tuned delivery descriptor, or None if the model/image is unusable.

    Returns None (not raise) so the delivery path can fall through to the legacy cascade cleanly —
    mirrors garment_embed.embed's None-on-failure contract.
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


def similarity(catalog: bytes, delivery: bytes) -> Optional[dict]:
    """Delivery-vs-catalog same-product similarity, or None when the matcher is unavailable.

    Shape mirrors cv.similarity ({score, method}) so /vlm/verify_delivery can swap between this and
    the legacy cascade without branching on the payload.
    """
    ec, ed = embed(catalog), embed(delivery)
    if ec is None or ed is None:
        return None
    return {"score": round(cosine(ec, ed), 4), "method": "promise-dinov2"}


if __name__ == "__main__":  # self-check on the committed real fixtures
    import sys

    if "--selftest" in sys.argv:
        d = Path(__file__).resolve().parent / "test_data"
        if not available():
            print(f"promise matcher unavailable: {load_error()}")
            sys.exit(1)
        cat = (d / "real_kurti_catalog.png").read_bytes()
        same = (d / "real_kurti_live.jpg").read_bytes()
        other = (d / "real_other_dress.png").read_bytes()
        bar = threshold()
        s_same = similarity(cat, same)["score"]
        s_other = similarity(cat, other)["score"]
        print(f"bar         : {bar}")
        print(f"same-kurti  : {s_same:.4f}  (expect ABOVE bar — phash scored 0.5938 and failed)")
        print(f"other-dress : {s_other:.4f}  (expect BELOW bar)")
        print(f"margin      : {s_same - s_other:+.4f}")
        sys.exit(0 if (bar and s_same >= bar > s_other) else 1)
