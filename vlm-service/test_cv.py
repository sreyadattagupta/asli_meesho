"""WS0 — shared CV foundation + confidence calibration."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageFilter

import calibration
import cv


def _jpeg(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def _sharp_image() -> bytes:
    # high-frequency checkerboard = large Laplacian variance
    a = np.indices((256, 256)).sum(axis=0) % 2 * 255
    return _jpeg(Image.fromarray(np.dstack([a.astype(np.uint8)] * 3)))


# ---- quality gate ---------------------------------------------------------
def test_quality_passes_sharp_large():
    q = cv.quality(_sharp_image())
    assert q["ok"] and q["resolution_ok"] and q["is_sharp"]


def test_quality_rejects_small():
    q = cv.quality(_jpeg(Image.new("RGB", (64, 64), (10, 20, 30))))
    assert not q["ok"] and not q["resolution_ok"]


def test_quality_rejects_blurred():
    sharp = Image.fromarray(
        np.dstack([(np.indices((256, 256)).sum(axis=0) % 2 * 255).astype(np.uint8)] * 3)
    )
    blurred = sharp.filter(ImageFilter.GaussianBlur(radius=6))
    assert cv.laplacian_variance(_jpeg(blurred)) < cv.laplacian_variance(_jpeg(sharp))
    assert not cv.quality(_jpeg(blurred))["is_sharp"]


# ---- similarity -----------------------------------------------------------
def test_similarity_identical_is_high():
    img = _jpeg(Image.new("RGB", (256, 256), (120, 40, 160)))
    assert cv.similarity(img, img)["score"] > 0.98


def test_similarity_different_is_lower_than_identical():
    a = _jpeg(Image.new("RGB", (256, 256), (200, 30, 30)))
    b = _jpeg(Image.fromarray(
        np.dstack([(np.indices((256, 256)).sum(axis=0) % 2 * 255).astype(np.uint8)] * 3)
    ))
    assert cv.similarity(a, b)["score"] < cv.similarity(a, a)["score"]


# ---- calibration: bounded + monotone -------------------------------------
def test_possession_monotone_in_cosine_and_code():
    lo = calibration.possession_confidence(0.4, 0.0)
    mid = calibration.possession_confidence(0.7, 0.5)
    hi = calibration.possession_confidence(0.95, 1.0)
    assert 0.0 <= lo < mid < hi <= 1.0


def test_possession_blur_penalises():
    assert calibration.possession_confidence(0.9, 1.0, blur_ok=False) < \
        calibration.possession_confidence(0.9, 1.0, blur_ok=True)


def test_sizing_monotone_and_bounded():
    good = calibration.sizing_confidence(0.02, 0.05, 1.0)
    bad = calibration.sizing_confidence(0.4, 0.6, 0.2)
    assert 0.0 <= bad < good <= 1.0


def test_delivery_monotone_and_bounded():
    kept = calibration.delivery_confidence(0.9, 1.0)
    mismatch = calibration.delivery_confidence(0.3, 0.0)
    assert 0.0 <= mismatch < kept <= 1.0
