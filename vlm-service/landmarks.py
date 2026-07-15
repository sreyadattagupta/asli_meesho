"""Garment landmarks from a silhouette mask (Agent 2).

The per-row width profile of a flat garment encodes its structure: the shoulder/sleeve band is the
widest run near the top, the waist the narrowest run in the mid/lower torso, the hem the width at
the bottom, the neck a local minimum at the very top. We read those lines off the profile — real
geometry per garment, not fixed fractions of the frame. A GPU seam (an RTMPose/YOLO11-seg-class model
fine-tuned via the HF Trainer, hosted on the HF Hub + served from an Inference Endpoint) can replace
this when HF_LANDMARK_ENDPOINT is set; the CPU silhouette is the default deployed path.
"""
from __future__ import annotations
import os
import numpy as np

import hub


def _row_widths(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-row (width, x_left, x_right) of the foreground; width 0 where the row is empty."""
    h = mask.shape[0]
    widths = np.zeros(h); lefts = np.zeros(h); rights = np.zeros(h)
    for y in range(h):
        xs = np.where(mask[y] > 0)[0]
        if xs.size:
            lefts[y], rights[y] = xs[0], xs[-1]
            widths[y] = xs[-1] - xs[0]
    return widths, lefts, rights


def _hspan(y: int, lefts, rights) -> tuple[int, int, int, int]:
    return (int(lefts[y]), int(y), int(rights[y]), int(y))


def landmarks_from_mask(mask: np.ndarray, bbox) -> dict:
    x0, y0, x1, y1 = bbox
    widths, lefts, rights = _row_widths(mask)
    ys = np.where(widths > 0)[0]
    if ys.size == 0:
        return {"shoulder": None, "chest": None, "waist": None, "hem": None, "neck": None,
                "sleeve": None, "cuff": None, "length": None, "landmark_conf": 0.0}
    top, bot = int(ys.min()), int(ys.max())
    span = max(1, bot - top)
    upper = np.arange(top, top + span // 2 + 1)          # torso upper half
    lower = np.arange(top + span // 3, bot + 1)          # mid -> hem

    shoulder_y = int(upper[np.argmax(widths[upper])])    # widest upper row
    waist_y = int(lower[np.argmin(np.where(widths[lower] > 0, widths[lower], 1e9))])  # narrowest lower run
    chest_y = int(top + span * 0.28)
    hem_y = bot
    neck_y = top                                         # local top; refined by min width near top
    near_top = np.arange(top, top + max(1, span // 12) + 1)
    if near_top.size:
        neck_y = int(near_top[np.argmin(np.where(widths[near_top] > 0, widths[near_top], 1e9))])

    found = [shoulder_y, chest_y, waist_y, hem_y, neck_y]
    conf = round(min(1.0, sum(1 for y in found if widths[y] > 0) / 5.0), 4)
    return {
        "shoulder": _hspan(shoulder_y, lefts, rights),
        "chest": _hspan(chest_y, lefts, rights),
        "waist": _hspan(waist_y, lefts, rights),
        "hem": _hspan(hem_y, lefts, rights),
        "neck": _hspan(neck_y, lefts, rights),
        "sleeve": None,                                  # not separable from a flat silhouette alone
        "cuff": None,
        "length": (int((lefts[top] + rights[top]) / 2), top, int((lefts[bot] + rights[bot]) / 2), bot),
        "landmark_conf": conf,
    }


def gpu_landmarks(image_bytes: bytes) -> dict | None:
    """GPU seam: landmarks from the HF-hosted model (Trainer-trained, HF Inference Endpoint) when
    HF_LANDMARK_ENDPOINT is configured, else None. CPU silhouette is the deployed default."""
    endpoint = hub.landmark_endpoint()
    if not endpoint:
        return None
    try:
        import requests
        r = requests.post(endpoint, data=image_bytes,
                          headers={"Authorization": f"Bearer {os.getenv('HF_TOKEN','')}",
                                   "Content-Type": "application/octet-stream"}, timeout=30)
        r.raise_for_status()
        return r.json()  # {shoulder,chest,waist,hem,neck,length,...,landmark_conf} — same shape as CPU path
    except Exception:
        return None  # any endpoint failure -> fall back to the CPU silhouette, never a fabricated line
