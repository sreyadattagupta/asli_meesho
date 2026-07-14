"""Local-feature corroboration for Agent 1 — a WEAK, tertiary same-instance signal.

CLIP-on-the-crop (see segment.py + cv.similarity) is the PRIMARY same-product evidence. This module
adds an independent, non-neural cross-check: ORB keypoints (Rublee et al. 2011) matched with Lowe's
ratio test (Lowe 2004). We count distinctive local correspondences on the garment's print/embroidery.

Deliberately NOT a RANSAC homography gate: cloth is deformable and non-planar, so a rigid planar
transform rejects valid matches and manufactures false ones off busy backgrounds — measured on the
real fixtures, homography inliers did not separate same-vs-different reliably (same 4 vs other 0, but
same 7 vs other 8 on the full frame). So we use the good-match COUNT only, on the segmented crops,
as a small confidence nudge and an explainability signal — never as a lone verdict (invariant #1/#8).

Degrades safely: OpenCV absent → {available: False}, and the caller ignores the signal.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

_MAX_SIDE = 900
_LOWE_RATIO = 0.75      # Lowe's ratio test — the standard 0.7–0.8 band
_ORB_FEATURES = 2000


def _gray(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("L")
    img.thumbnail((_MAX_SIDE, _MAX_SIDE))
    return np.asarray(img)


def color_similarity(a: bytes, b: bytes) -> float:
    """HSV-histogram correlation between two garment crops, in [-1, 1] (1 = same colour makeup).

    A deterministic, VLM-free colour signal. CLIP on a segmented crop is dominated by SHAPE, so two
    same-silhouette garments in different colours can score a high cosine (a solid blue vs a solid red
    tee ≈0.85). Colour histogram correlation separates them (≈1.0 same colour, ≈0.0 different) without
    an inference call. We mask out the near-black zeroed background so the crop border can't dominate.
    Returns 0.0 if OpenCV is unavailable (caller then leans on the VLM attribute read instead).
    """
    try:
        import cv2
    except Exception:  # noqa: BLE001
        return 0.0

    def hist(data: bytes):
        rgb = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        mask = (hsv[:, :, 2] > 20).astype(np.uint8)  # drop the masked (near-black) background
        h = cv2.calcHist([hsv], [0, 1], mask, [32, 32], [0, 180, 0, 256])
        cv2.normalize(h, h)
        return h

    try:
        return float(cv2.compareHist(hist(a), hist(b), cv2.HISTCMP_CORREL))
    except Exception:  # noqa: BLE001
        return 0.0


def good_matches(a: bytes, b: bytes) -> dict:
    """Count Lowe-ratio good ORB matches between two images.

    Returns {available, good, kp_a, kp_b, texture_ok}. `texture_ok` is False for a low-texture
    garment (few keypoints on a plain/solid fabric) — the caller then leans on CLIP + the VLM read
    rather than this signal, because ORB has little to grip on unpatterned cloth.
    """
    try:
        import cv2  # optional
    except Exception:  # noqa: BLE001
        return {"available": False, "good": 0, "kp_a": 0, "kp_b": 0, "texture_ok": False}

    ga, gb = _gray(a), _gray(b)
    orb = cv2.ORB_create(nfeatures=_ORB_FEATURES)
    ka, da = orb.detectAndCompute(ga, None)
    kb, db = orb.detectAndCompute(gb, None)
    kp_a, kp_b = len(ka or []), len(kb or [])
    # A plain garment yields few keypoints; below this the ORB signal is unreliable, not "no match".
    texture_ok = kp_a >= 60 and kp_b >= 60
    if da is None or db is None or kp_a < 8 or kp_b < 8:
        return {"available": True, "good": 0, "kp_a": kp_a, "kp_b": kp_b, "texture_ok": texture_ok}

    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    knn = bf.knnMatch(da, db, k=2)
    good = 0
    for pair in knn:
        if len(pair) == 2:
            m, n = pair
            if m.distance < _LOWE_RATIO * n.distance:
                good += 1
    return {"available": True, "good": int(good), "kp_a": kp_a, "kp_b": kp_b, "texture_ok": texture_ok}


if __name__ == "__main__":  # self-check on the real fixtures
    import sys
    from pathlib import Path

    if "--selftest" in sys.argv:
        d = Path(__file__).resolve().parent / "test_data"
        cat = (d / "real_kurti_catalog.png").read_bytes()
        print("same ", good_matches(cat, (d / "real_kurti_live.jpg").read_bytes()))
        print("other", good_matches(cat, (d / "real_other_dress.png").read_bytes()))
