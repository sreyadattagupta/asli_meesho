"""Deterministic garment + reference detection for Agent 2 (Smart Sizing).

WHY THIS EXISTS — root cause of the "always XXXL" bug:
The measure endpoint used to ask a 3B vision-language model to *ground* the A4 sheet's four
corners and the garment/chest/waist boxes as JSON. A small VLM cannot reliably emit structured
pixel coordinates — locally Qwen2.5-VL-3B returns garbage ("@@@@") and the call fails, after which
the web layer silently served a HARDCODED mock (chest 96 / length 118 / waist 88) → every image
mapped to XXXL. Coordinate-guessing by an LLM is not detection.

This module replaces that with real, classical computer vision — deterministic, per-image,
repeatable, CPU-only, no model download:

  detect_reference_quad(bytes, kind)   A4 (or card/tape) via Canny edges → contour → the best
                                       four-point convex quad whose aspect matches the reference and
                                       whose interior is paper-bright. Returns the ORDERED four
                                       corners in original-image pixels (feeds the homography), or
                                       None when no reliable reference is present.
  detect_garment_landmarks(bytes, ref) GrabCut foreground silhouette (Rother et al. 2004) with the
                                       reference region masked out → garment bounding box plus the
                                       chest and waist mid-lines read from the width profile of the
                                       silhouette (widest run in the upper torso band; narrowest run
                                       below it). Real landmarks, not a fixed fraction of the frame.

Both degrade safely (return None / whole-frame) if OpenCV is missing, so the service still imports.
The caller turns "no reference" or "low detection quality" into a RETAKE, never a fabricated size.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageOps

# ---- tunables (documented, not magic) ------------------------------------
_MAX_SIDE = 1024          # working resolution; corners are scaled back to the original frame
_MIN_QUAD_AREA_FRAC = 0.01  # a reference smaller than 1% of the frame is too small to trust as scale
_ASPECT_TOL = 0.30        # |detected aspect / true aspect − 1| must be within this to accept a quad
_PAPER_MIN_BRIGHT = 110   # mean interior intensity (0–255) for a quad to read as a bright sheet

# Reference true aspect ratio (long / short side).
_REF_ASPECT: dict[str, float] = {
    "a4": 29.7 / 21.0,    # 1.414
    "card": 8.56 / 5.398,  # ISO/IEC 7810 ID-1 (credit card) 1.586
    "tape": 6.0,          # a wide tape span — weak aspect prior, corner-fit still helps
}


def _open_gray_and_bgr(data: bytes) -> tuple[np.ndarray, np.ndarray, float]:
    """Return (gray, rgb, scale) at working resolution. `scale` maps working→original pixels."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")  # honour phone orientation
    w0, h0 = img.size
    work = img.copy()
    work.thumbnail((_MAX_SIDE, _MAX_SIDE))
    scale = w0 / work.size[0] if work.size[0] else 1.0
    rgb = np.asarray(work)
    gray = np.asarray(work.convert("L"))
    return gray, rgb, scale


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points TL, TR, BR, BL (matches metrology._order_corners)."""
    pts = np.asarray(pts, dtype=np.float64).reshape(4, 2)
    s = pts.sum(axis=1)
    d = pts[:, 0] - pts[:, 1]
    return np.array([pts[np.argmin(s)], pts[np.argmax(d)], pts[np.argmax(s)], pts[np.argmin(d)]],
                    dtype=np.float64)


def detect_reference_quad(data: bytes, kind: str = "a4") -> dict | None:
    """Detect the reference sheet's four corners with classical CV.

    Returns {corners: 4x2 float (original px), aspect_err, bbox, brightness, quad_score} or None.
    Deterministic: the same image always yields the same corners.
    """
    try:
        import cv2
    except Exception:  # noqa: BLE001 — no OpenCV ⇒ caller falls back / retakes
        return None

    gray, rgb, scale = _open_gray_and_bgr(data)
    h, w = gray.shape
    frame_area = float(h * w)
    true_aspect = _REF_ASPECT.get(kind, _REF_ASPECT["a4"])

    # Edges: blur to suppress fabric texture, then median-adaptive Canny, then close small gaps.
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    med = float(np.median(blur))
    lo, hi = int(max(0, 0.66 * med)), int(min(255, 1.33 * med))
    edges = cv2.Canny(blur, lo, hi)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    best: dict | None = None
    for c in contours:
        area = cv2.contourArea(c)
        if area < _MIN_QUAD_AREA_FRAC * frame_area:
            continue
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue
        quad = approx.reshape(4, 2).astype(np.float64)
        (cw, ch) = cv2.minAreaRect(approx)[1]
        if min(cw, ch) < 1:
            continue
        detected_aspect = max(cw, ch) / min(cw, ch)
        aspect_err = abs(detected_aspect / true_aspect - 1.0)
        if aspect_err > _ASPECT_TOL:
            continue
        # Interior brightness — a paper sheet is markedly brighter than fabric/background.
        mask = np.zeros(gray.shape, np.uint8)
        cv2.fillPoly(mask, [approx], 255)
        brightness = float(cv2.mean(gray, mask=mask)[0])
        if brightness < _PAPER_MIN_BRIGHT:
            continue
        # Prefer a clean aspect, a bright interior, and a larger sheet (more scale support).
        score = (1.0 - aspect_err) * 0.6 + (brightness / 255.0) * 0.25 + (area / frame_area) * 0.15
        if best is None or score > best["quad_score"]:
            xs, ys = quad[:, 0], quad[:, 1]
            best = {
                "corners": (_order_corners(quad) * scale),
                "aspect_err": round(aspect_err, 3),
                "brightness": round(brightness, 1),
                "quad_score": score,
                "bbox": [float(xs.min() * scale), float(ys.min() * scale),
                         float(xs.max() * scale), float(ys.max() * scale)],
            }
    return best


def _iou(a: list, b: list) -> float:
    """Intersection-over-union of two [x1,y1,x2,y2] boxes."""
    ix0, iy0 = max(a[0], b[0]), max(a[1], b[1])
    ix1, iy1 = min(a[2], b[2]), min(a[3], b[3])
    iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
    inter = iw * ih
    ua = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    ub = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    return inter / (ua + ub - inter) if (ua + ub - inter) > 0 else 0.0


def scene_check(ref: dict, landmarks: dict, img_wh: tuple[int, int]) -> dict:
    """Guard the coplanarity assumption single-view metrology depends on.

    Homography from the A4 corners only yields correct centimetres when the A4 lies on the SAME plane
    as the thing being measured — i.e. the sheet is placed ON the flat-laid garment. If the A4 is
    detached from the garment (a corner overlay, or a person standing behind a floating sheet), the
    scale is valid for the A4's plane but meaningless on the subject — the pipeline would otherwise
    return a confident WRONG measurement (observed: a 46.6 cm chest on an on-body dress photo).

    Returns {coplanar_ok, gap, overlap, garment_height_frac, reason}. `coplanar_ok` False ⇒ the caller
    must ask for a proper flat-lay rather than measure.
    """
    w, h = img_wh
    g = landmarks["garment"]
    garment_h_frac = (g[3] - g[1]) / h if h else 0.0
    # Primary signal: background clutter outside the garment + A4. A flat-lay on a plain surface has
    # near-zero background edges; an on-body / real-world 3D scene (where the A4 floats at a different
    # depth than the subject, breaking the coplanarity homography assumes) is busy. Threshold from the
    # fixtures: plain flat-lay ≈ 0.00, on-body outdoor ≈ 0.17.
    clutter = float(landmarks.get("bg_edge_density", 0.0))

    coplanar_ok = clutter <= 0.06
    reason = "" if coplanar_ok else (
        "Busy background detected — this looks like an on-body or in-scene photo, not a flat-lay. "
        "Lay the garment FLAT on a plain surface with an A4 sheet beside it and shoot straight down.")

    return {"coplanar_ok": coplanar_ok, "clutter": round(clutter, 4),
            "garment_height_frac": round(garment_h_frac, 3), "reason": reason}


def _width_profile(fg: np.ndarray) -> np.ndarray:
    """Foreground pixel count per row — the garment's horizontal width at each height."""
    return fg.sum(axis=1).astype(np.float64)


def detect_garment_landmarks(data: bytes, reference_bbox: list | None = None) -> dict | None:
    """Segment the garment and read chest / waist / length landmarks from its silhouette.

    Returns pixel-space boxes ready for metrology (`garment`, `chest`, `waist` as [x1,y1,x2,y2]),
    plus fg_frac and a `landmark_ok` flag. Chest/waist are DERIVED from the silhouette width
    profile, so they move with the actual garment shape — a fitted kurta and a wide saree read
    differently. None when segmentation is unavailable.
    """
    try:
        import cv2
    except Exception:  # noqa: BLE001
        return None

    _, rgb, scale = _open_gray_and_bgr(data)
    h, w = rgb.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (int(w * 0.05), int(h * 0.05), int(w * 0.90), int(h * 0.90))
    try:
        cv2.grabCut(rgb, mask, rect, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                    5, cv2.GC_INIT_WITH_RECT)
    except Exception:  # noqa: BLE001
        return None
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)

    # Background-clutter signal (coplanarity proxy). A flat-lay is shot on a plain surface, so the
    # region OUTSIDE the garment + A4 has almost no edges; an on-body / real-world 3D scene (garden,
    # room) is busy. Measured on the fixtures: plain flat-lay ≈ 0.00, on-body outdoor ≈ 0.17. This is
    # what separates a valid flat-lay (A4 beside/on the garment, same plane) from a photo where the
    # A4 floats at a different depth than the subject — the homography would then mis-scale.
    edges = cv2.Canny(cv2.GaussianBlur(np.asarray(Image.fromarray(rgb).convert("L")), (3, 3), 0), 50, 150)
    bg_mask = np.ones((h, w), np.uint8)
    if reference_bbox is not None:
        rx0, ry0, rx1, ry1 = (int(round(v / scale)) for v in reference_bbox)
        bg_mask[max(0, ry0):min(h, ry1), max(0, rx0):min(w, rx1)] = 0  # exclude the A4 from background
        # Remove the reference sheet from the garment mask so it can't be measured as fabric.
        fg[max(0, ry0):min(h, ry1), max(0, rx0):min(w, rx1)] = 0

    frac = float(fg.mean())
    if frac < 0.03:
        return None  # segmentation collapsed — nothing to measure

    ys, xs = np.where(fg > 0)
    y0, y1, x0, x1 = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
    gh = max(1, y1 - y0)

    prof = _width_profile(fg)

    def widest_in(a: float, b: float) -> tuple[int, int, int]:
        """Row of maximum width within the band [a,b] of the garment height; return (y, xl, xr)."""
        lo, hi = y0 + int(a * gh), y0 + int(b * gh)
        band = prof[lo:hi]
        if band.size == 0 or band.max() == 0:
            yy = (lo + hi) // 2
            return yy, x0, x1
        yy = lo + int(np.argmax(band))
        row = np.where(fg[yy] > 0)[0]
        return yy, int(row.min()), int(row.max())

    def narrowest_in(a: float, b: float) -> tuple[int, int, int]:
        """Row of minimum non-zero width within a band — the waist pinch below the chest."""
        lo, hi = y0 + int(a * gh), y0 + int(b * gh)
        band = prof[lo:hi].copy()
        if band.size == 0 or band.max() == 0:
            yy = (lo + hi) // 2
            return yy, x0, x1
        band[band == 0] = band.max() + 1  # ignore empty rows when seeking the minimum
        yy = lo + int(np.argmin(band))
        row = np.where(fg[yy] > 0)[0]
        return yy, int(row.min()), int(row.max())

    # Shoulder = widest run in the top band; chest = widest in the upper torso; waist = narrowest below.
    sy, sxl, sxr = widest_in(0.0, 0.18)
    cy, cxl, cxr = widest_in(0.12, 0.45)
    wy, wxl, wxr = narrowest_in(0.45, 0.72)

    # Background edge density: exclude the garment box too, then measure edges in what remains.
    bg_mask[y0:y1, x0:x1] = 0
    outside = edges[bg_mask > 0]
    bg_edge_density = float((outside > 0).mean()) if outside.size else 0.0

    s = scale
    return {
        "garment": [x0 * s, y0 * s, x1 * s, y1 * s],
        "shoulder": [sxl * s, sy * s, sxr * s, sy * s],
        "chest": [cxl * s, cy * s, cxr * s, cy * s],
        "waist": [wxl * s, wy * s, wxr * s, wy * s],
        "fg_frac": round(frac, 3),
        "bg_edge_density": round(bg_edge_density, 4),
        "landmark_ok": bool(0.08 <= frac <= 0.95),
    }


if __name__ == "__main__":  # self-check on the committed fixtures
    import sys
    from pathlib import Path

    if "--selftest" in sys.argv:
        d = Path(__file__).resolve().parent
        for name in ("test_data/flatlay_real.jpg", "../web/public/proof/flatlay_real.jpg"):
            p = d / name
            if p.exists():
                b = p.read_bytes()
                ref = detect_reference_quad(b, "a4")
                lm = detect_garment_landmarks(b, ref["bbox"] if ref else None)
                print(name, "ref=", None if not ref else ref["aspect_err"], "landmarks=", bool(lm))
                break
