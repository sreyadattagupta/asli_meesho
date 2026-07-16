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
# |detected aspect / true aspect − 1| must be within this to accept a quad. Kept BELOW 0.293 on
# purpose: that is exactly where a SQUARE sits relative to A4 (1.0 vs 1.414), so the previous 0.30
# accepted a square notepad as an A4 and silently scaled every measurement by ~41%. A wrong scale is
# worse than no scale — it produces a confident, wrong size chart instead of an honest RETAKE.
# Real A4s measured on genuine flat-lays land at err 0.004–0.086, so 0.20 keeps >2x headroom for
# perspective while ruling out non-A4 rectangles.
_ASPECT_TOL = 0.20
_PAPER_MIN_BRIGHT = 110   # mean interior intensity (0–255) for a quad to read as a bright sheet
# approxPolyDP tolerances (fraction of contour perimeter) tried in order until a contour reduces to a
# convex quad. A single tight epsilon only fits paper that is perfectly flat and cleanly cut: a real
# seller's sheet curls at the corners, creases where it lies over a seam, and is often torn from a
# notebook (a perforated edge alone adds vertices). Measured on a real flat-lay, the A4 simplified to
# 7 vertices at 0.02 and to a clean quad at 0.05 — every other gate (paper-bright interior, A4
# aspect, min area) passed, so the sheet was rejected purely by simplification tolerance and the
# seller was told "No A4 sheet detected" with the sheet plainly in frame. Widening the LADDER (not
# the discriminating gates) keeps detection deterministic while tolerating real-world paper.
_QUAD_EPS_LADDER = (0.02, 0.03, 0.04, 0.05, 0.06, 0.08)
# Max background-edge density for a frame to read as a flat-lay (see scene_check for the calibration).
_MAX_SCENE_CLUTTER = 0.12
# Fixed seed for GrabCut's internal k-means → the same photo always yields the same silhouette, so a
# seller's size chart is reproducible rather than drifting between identical runs.
_GRABCUT_SEED = 20260716

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


def _approx_quad(contour, peri: float):
    """Reduce a contour to a convex 4-point polygon, loosening the tolerance until it fits.

    Returns the 4x2 approx (as approxPolyDP does) or None if no tolerance in the ladder yields a
    convex quad. The caller still gates on aspect + brightness + area, so a looser fit here cannot
    admit a non-reference: it only lets an imperfect *rectangle* be recognised as one.
    """
    import cv2

    for eps in _QUAD_EPS_LADDER:
        approx = cv2.approxPolyDP(contour, eps * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            return approx
    return None


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
        approx = _approx_quad(c, peri)
        if approx is None:
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
    # depth than the subject, breaking the coplanarity homography assumes) is busy.
    #
    # Calibration (measured, not guessed): repo fixtures span 0.0000–0.0486, but those are all shot on
    # clean surfaces. A real seller flat-lay on a PATTERNED BEDSHEET — the normal surface in a Bharat
    # home, and a perfectly valid flat-lay — measures 0.0733, so the previous 0.06 limit rejected it
    # with "Busy background" and no retake could ever fix it (the seller owns that bedsheet). The
    # limit now sits between that and the on-body case (≈0.17 per the original calibration), keeping
    # margin on both sides. NOTE: this is a proxy for the real question ("is the A4 coplanar with the
    # garment?"); the direct test is A4/garment overlap. Revisit with an on-body fixture — the repo
    # has none, so the 0.17 figure is inherited, not re-verified here.
    clutter = float(landmarks.get("bg_edge_density", 0.0))

    coplanar_ok = clutter <= _MAX_SCENE_CLUTTER
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
        # GrabCut seeds its internal k-means from OpenCV's global RNG, so the same photo segments
        # slightly differently on every call and the measured cm move with it. Pinning the seed makes
        # the whole pipeline reproducible: one photo → one size chart, every time. Without this the
        # waist drifted 2.0 cm (≈0.8 of a size step) across identical runs — the product promises
        # "measured, not guessed", and a number that changes when nothing changed is neither.
        cv2.setRNGSeed(_GRABCUT_SEED)
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

    # Landmarks are extrema of the width profile, and GrabCut's mask is not bit-identical run to run
    # (its internal k-means seeds randomly). A raw argmin/argmax therefore latches onto whichever
    # single row the noise happened to nick: measured on one real flat-lay, waist_cm swung 55.7–57.7
    # across 5 runs of the SAME image (2.0 cm ≈ 0.8 of a size step) while chest/length/shoulder — read
    # off a broad plateau rather than a shallow valley — were rock stable at 0.0 spread. A chart that
    # says "measured, not guessed" cannot move a size between identical runs, so both the profile and
    # the chosen row's extent are smoothed over a neighbourhood instead of trusting one pixel row.
    _smooth_win = max(3, int(0.05 * gh) | 1)  # odd window ≈5% of garment height

    def _smoothed(band: np.ndarray) -> np.ndarray:
        if band.size < _smooth_win:
            return band.astype(np.float64)
        kern = np.ones(_smooth_win) / _smooth_win
        return np.convolve(band.astype(np.float64), kern, mode="same")

    def _extent_near(yy: int) -> tuple[int, int]:
        """Median left/right edge over rows around `yy` — one row's edges are noise, the local
        consensus is the landmark."""
        half = _smooth_win // 2
        lefts, rights = [], []
        for r in range(max(0, yy - half), min(fg.shape[0], yy + half + 1)):
            row = np.where(fg[r] > 0)[0]
            if row.size:
                lefts.append(int(row.min()))
                rights.append(int(row.max()))
        if not lefts:
            return x0, x1
        return int(np.median(lefts)), int(np.median(rights))

    def widest_in(a: float, b: float) -> tuple[int, int, int]:
        """Row of maximum width within the band [a,b] of the garment height; return (y, xl, xr)."""
        lo, hi = y0 + int(a * gh), y0 + int(b * gh)
        band = prof[lo:hi]
        if band.size == 0 or band.max() == 0:
            yy = (lo + hi) // 2
            return yy, x0, x1
        yy = lo + int(np.argmax(_smoothed(band)))
        xl, xr = _extent_near(yy)
        return yy, xl, xr

    def narrowest_in(a: float, b: float) -> tuple[int, int, int]:
        """Row of minimum non-zero width within a band — the waist pinch below the chest."""
        lo, hi = y0 + int(a * gh), y0 + int(b * gh)
        band = prof[lo:hi].copy()
        if band.size == 0 or band.max() == 0:
            yy = (lo + hi) // 2
            return yy, x0, x1
        band[band == 0] = band.max() + 1  # ignore empty rows when seeking the minimum
        yy = lo + int(np.argmin(_smoothed(band)))
        xl, xr = _extent_near(yy)
        return yy, xl, xr

    # Shoulder = widest run in the top band; chest = widest in the upper torso; waist = narrowest below.
    sy, sxl, sxr = widest_in(0.0, 0.18)
    cy, cxl, cxr = widest_in(0.12, 0.45)
    wy, wxl, wxr = narrowest_in(0.45, 0.72)
    # Hip = widest run BELOW the waist. The band must start under the measured waist row, not at a
    # fixed 0.55: the waist and hip search bands used to overlap (0.45–0.72 vs 0.55–0.95), so on a
    # real flat-lay the "hip" was found at 57% of the garment while the "waist" sat at 72% — a hip
    # measured above the waist, which is not a hip. Anatomical order is a property of the garment, so
    # it is enforced by construction rather than hoped for.
    waist_frac = (wy - y0) / gh
    hip_lo = min(waist_frac + 0.02, 0.93)
    hy, hxl, hxr = widest_in(hip_lo, 0.95)

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
        "hip": [hxl * s, hy * s, hxr * s, hy * s],
        # NOTE: no "neck". A neckline is an INTERIOR hole; this module reads the OUTER silhouette's
        # width profile, which cannot see it. The previous `narrowest_in(0.0, 0.12)` could only ever
        # return the topmost sliver where the garment starts — measured 32.9 cm on a real kurti (an
        # impossible neckline) and 17.5 cm on another, i.e. an artifact of where the mask began, not
        # a measurement. Same call as sleeve (below): omit rather than invent. Measuring a real
        # neckline needs the hole in the mask (or a parts segmenter), not the silhouette.
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
