"""Single-view garment metrology (Agent 2).

A flat-lay garment and a known reference object (A4 sheet or measuring tape) lie on the SAME
plane. Given the reference's four corners in the image, a planar homography (Criminisi, Reid &
Zisserman, IJCV 2000; Hartley & Zisserman, MVG) maps image pixels to real centimetres on that
plane — correcting the perspective foreshortening that a naive reference/garment pixel RATIO
ignores. We solve the homography by the Direct Linear Transform (DLT) with numpy only.

If the model cannot ground four reliable corners we fall back to the orientation-agnostic ratio
method (still real, just perspective-naive) and report lower confidence. Every path returns a
re-projection residual and reference-aspect error that feed calibration.sizing_confidence.
"""
from __future__ import annotations

import math

import numpy as np

# Reference real-world sizes in cm as (short_side, long_side).
REFERENCE_CM: dict[str, tuple[float, float]] = {
    "a4": (21.0, 29.7),      # ISO 216 A4
    "tape": (5.0, 30.0),     # a ~5 cm-wide tape showing a 30 cm span (documented approximation)
}


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as TL, TR, BR, BL using coordinate sums/diffs."""
    pts = np.asarray(pts, dtype=np.float64).reshape(4, 2)
    s = pts.sum(axis=1)
    d = (pts[:, 0] - pts[:, 1])
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmax(d)]
    bl = pts[np.argmin(d)]
    return np.array([tl, tr, br, bl], dtype=np.float64)


def homography(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """DLT homography mapping src (4x2 image px) -> dst (4x2 metric cm). Returns 3x3 H."""
    A = []
    for (x, y), (X, Y) in zip(src, dst):
        A.append([-x, -y, -1, 0, 0, 0, x * X, y * X, X])
        A.append([0, 0, 0, -x, -y, -1, x * Y, y * Y, Y])
    _, _, Vt = np.linalg.svd(np.asarray(A, dtype=np.float64))
    H = Vt[-1].reshape(3, 3)
    return H / H[2, 2] if H[2, 2] != 0 else H


def _apply(H: np.ndarray, pt) -> np.ndarray:
    v = H @ np.array([pt[0], pt[1], 1.0])
    return v[:2] / v[2] if v[2] != 0 else v[:2]


def _residual(H: np.ndarray, src: np.ndarray, dst: np.ndarray, scale_cm: float) -> float:
    err = float(np.mean([np.linalg.norm(_apply(H, s) - d) for s, d in zip(src, dst)]))
    return err / scale_cm if scale_cm else err


def _span(H: np.ndarray, box, axis: str) -> float:
    """Real-cm length of a box's horizontal ('h') or vertical ('v') mid-line under H."""
    x1, y1, x2, y2 = box
    if axis == "h":
        p1, p2 = (x1, (y1 + y2) / 2), (x2, (y1 + y2) / 2)
    else:
        p1, p2 = ((x1 + x2) / 2, y1), ((x1 + x2) / 2, y2)
    return float(np.linalg.norm(_apply(H, p1) - _apply(H, p2)))


def _box_sanity(reference_box, garment, chest, waist) -> float:
    """Cheap plausibility: garment bigger than the reference, chest/waist within the garment."""
    def area(b):
        return max(0.0, (b[2] - b[0])) * max(0.0, (b[3] - b[1])) if b else 0.0
    if not (garment and reference_box):
        return 0.4
    if area(garment) <= area(reference_box):
        return 0.5
    ok = 1.0
    for b in (chest, waist):
        if b and (b[2] - b[0]) > 1.3 * (garment[2] - garment[0]):
            ok -= 0.25
    return max(0.3, ok)


def measure(
    reference: str,
    reference_box,
    garment,
    chest=None,
    waist=None,
    reference_corners=None,
) -> dict:
    """Return garment cm + provenance. Uses homography when 4 corners are available."""
    ref = reference if reference in REFERENCE_CM else "a4"
    short_cm, long_cm = REFERENCE_CM[ref]
    chest = chest or garment
    waist = waist or chest

    if reference_box is None or garment is None:
        return {"chest_cm": 0.0, "length_cm": 0.0, "waist_cm": 0.0, "reference_used": ref,
                "method": "none", "ref_aspect_err": 1.0, "residual": 1.0, "box_sanity": 0.0}

    # reference-aspect error from the reference box (independent of the homography fit)
    rw, rh = reference_box[2] - reference_box[0], reference_box[3] - reference_box[1]
    box_short, box_long = min(rw, rh), max(rw, rh)
    detected_aspect = (box_long / box_short) if box_short else 0.0
    true_aspect = long_cm / short_cm
    ref_aspect_err = abs(detected_aspect / true_aspect - 1.0) if true_aspect else 1.0
    sanity = _box_sanity(reference_box, garment, chest, waist)

    corners = None
    if reference_corners is not None:
        try:
            corners = _order_corners(np.asarray(reference_corners, dtype=np.float64).reshape(4, 2))
        except (ValueError, TypeError):
            corners = None

    if corners is not None:
        # map the longer image side of the sheet to the longer cm side
        top = float(np.linalg.norm(corners[1] - corners[0]))
        left = float(np.linalg.norm(corners[3] - corners[0]))
        if top >= left:
            dst = np.array([[0, 0], [long_cm, 0], [long_cm, short_cm], [0, short_cm]], dtype=np.float64)
        else:
            dst = np.array([[0, 0], [short_cm, 0], [short_cm, long_cm], [0, long_cm]], dtype=np.float64)
        H = homography(corners, dst)
        residual = _residual(H, corners, dst, math.hypot(short_cm, long_cm))
        return {
            "chest_cm": round(_span(H, chest, "h"), 1),
            "length_cm": round(_span(H, garment, "v"), 1),
            "waist_cm": round(_span(H, waist, "h"), 1),
            "reference_used": ref, "method": "homography",
            "ref_aspect_err": round(ref_aspect_err, 3), "residual": round(residual, 3),
            "box_sanity": round(sanity, 2),
        }

    # ratio fallback — orientation-agnostic cm-per-pixel from the reference box
    scale = ((short_cm / box_short) + (long_cm / box_long)) / 2 if box_short and box_long else 0.0
    return {
        "chest_cm": round((chest[2] - chest[0]) * scale, 1),
        "length_cm": round((garment[3] - garment[1]) * scale, 1),
        "waist_cm": round((waist[2] - waist[0]) * scale, 1),
        "reference_used": ref, "method": "ratio",
        "ref_aspect_err": round(ref_aspect_err, 3), "residual": 0.25,  # unknown plane → moderate prior
        "box_sanity": round(sanity, 2),
    }
