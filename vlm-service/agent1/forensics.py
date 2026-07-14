"""Component 8 — authenticity forensics. Real image-tamper + AI-generation signals feeding the
trust score as weighted EVIDENCE (never a lone verdict — see [[asli-agent1-engine]] / invariant #1).

Always-available (pure numpy/Pillow, no heavy wheels):
  ela_score            Error-Level Analysis — recompression-residual energy. Spliced/edited regions
                       recompress differently from the background (Krawetz 2007). 0..1.
  noise_inconsistency  block-wise high-pass noise; splices show inconsistent local noise. 0..1.

Optional (run on the HF Space image; degrade cleanly on the py3.14 local box):
  copy_move            ORB keypoint self-matching (needs opencv) → cloned-region evidence. None if absent.
  aigen_score          pretrained AI-vs-real image classifier (needs transformers+torch).
                       Returns {available, score}; score 0.0 + available=False when the model is
                       absent — NEVER a fabricated probability.

manipulation_score fuses the available tamper signals; aigen is reported separately.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


def ela_score(data: bytes) -> float:
    """Mean recompression residual, normalized to 0..1. Higher ⇒ more edit-consistent artefacts."""
    orig = _open(data)
    buf = io.BytesIO()
    orig.save(buf, "JPEG", quality=90)
    resaved = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    a = np.asarray(orig, dtype=np.float64)
    b = np.asarray(resaved, dtype=np.float64)
    diff = np.abs(a - b)
    # mean absolute residual scaled: ~0 for a clean re-encode, rising with tamper artefacts.
    # /24 maps the typical 0..~24 residual band onto 0..1 (documented, tunable).
    return float(min(1.0, diff.mean() / 24.0))


def noise_inconsistency(data: bytes) -> float:
    """Spread of local noise across 32x32 blocks, normalized 0..1. High ⇒ inconsistent noise (splice)."""
    g = np.asarray(_open(data).convert("L"), dtype=np.float64)
    # high-pass residual = image minus a 3x3 box-blur (cheap Laplacian-of-mean proxy)
    pad = np.pad(g, 1, mode="edge")
    blur = (
        pad[:-2, :-2] + pad[:-2, 1:-1] + pad[:-2, 2:]
        + pad[1:-1, :-2] + pad[1:-1, 1:-1] + pad[1:-1, 2:]
        + pad[2:, :-2] + pad[2:, 1:-1] + pad[2:, 2:]
    ) / 9.0
    resid = g - blur
    h, w = resid.shape
    bs = 32
    stds = [
        resid[y : y + bs, x : x + bs].std()
        for y in range(0, h - bs + 1, bs)
        for x in range(0, w - bs + 1, bs)
    ]
    if len(stds) < 2:
        return 0.0
    stds = np.asarray(stds)
    mean = stds.mean()
    if mean <= 1e-6:
        return 0.0
    # coefficient of variation of block noise; clamp. Uniform noise ⇒ low; patchy ⇒ high.
    return float(min(1.0, (stds.std() / mean)))


def copy_move(data: bytes) -> float | None:
    """ORB self-similarity → cloned-region evidence in 0..1. None when opencv is unavailable."""
    try:
        import cv2  # optional — present on the HF Space, absent on py3.14 local
    except Exception:  # noqa: BLE001
        return None
    arr = np.asarray(_open(data).convert("L"))
    orb = cv2.ORB_create(nfeatures=1000)
    kp, des = orb.detectAndCompute(arr, None)
    if des is None or len(kp) < 10:
        return 0.0
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = bf.knnMatch(des, des, k=3)
    clones = 0
    for group in matches:
        for m in group:
            if m.queryIdx == m.trainIdx:
                continue
            p, q = kp[m.queryIdx].pt, kp[m.trainIdx].pt
            spatial = ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2) ** 0.5
            if m.distance < 20 and spatial > 20:  # near-identical descriptor, far apart ⇒ clone
                clones += 1
    return float(min(1.0, clones / max(1, len(kp))))


def manipulation_score(data: bytes) -> float:
    """Fuse the available tamper signals into one 0..1 manipulation-risk score."""
    signals = [ela_score(data), noise_inconsistency(data)]
    cm = copy_move(data)
    if cm is not None:
        signals.append(cm)
    return float(max(signals))


_AIGEN_MODEL = "Organika/sdxl-detector"  # Apache-2.0 AI-vs-real image classifier
_aigen_pipe = None
_aigen_tried = False


def aigen_score(data: bytes) -> dict:
    """Pretrained AI-generated-image probability. {available, score}. Degrades to score 0.0."""
    global _aigen_pipe, _aigen_tried
    if not _aigen_tried:
        _aigen_tried = True
        try:  # pragma: no cover — heavy, only on the HF Space
            from transformers import pipeline

            _aigen_pipe = pipeline("image-classification", model=_AIGEN_MODEL)
        except Exception:  # noqa: BLE001 — transformers/torch absent → degrade, no fake signal
            _aigen_pipe = None
    if _aigen_pipe is None:
        return {"available": False, "score": 0.0}
    try:  # pragma: no cover
        preds = _aigen_pipe(_open(data))
        ai = next((p["score"] for p in preds if "ai" in p["label"].lower()
                   or "fake" in p["label"].lower() or "artificial" in p["label"].lower()), 0.0)
        return {"available": True, "score": float(min(1.0, max(0.0, ai)))}
    except Exception:  # noqa: BLE001
        return {"available": False, "score": 0.0}
