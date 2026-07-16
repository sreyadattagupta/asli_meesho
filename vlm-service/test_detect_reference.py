"""detect_reference_quad on imperfect, real-world paper.

Regression: a real seller flat-lay (dark kurti, A4 laid on top) was rejected with "No A4 sheet
detected" while the sheet was plainly in frame. The sheet cleared every discriminating gate —
paper-bright interior (203/255) and A4 aspect (err 0.08) — but approxPolyDP at a single tight
epsilon (0.02 * perimeter) simplified its curled outline to 7 vertices, and the detector required
exactly 4. These rebuild that failure mode synthetically (no personal photo committed) and pin both
directions: imperfect paper is still found, non-paper is still rejected.
"""
import io

import numpy as np
import pytest
from PIL import Image

import detect

cv2 = pytest.importorskip("cv2")

# A4 aspect (29.7/21.0) at a size well above the 1%-of-frame floor.
_SHEET_W, _SHEET_H = 210, 297
_FRAME_W, _FRAME_H = 640, 660


def _render(sheet_poly: np.ndarray, sheet_fill: int = 245, bg: int = 30) -> bytes:
    """Dark fabric background with one bright sheet polygon drawn on it → PNG bytes."""
    img = np.full((_FRAME_H, _FRAME_W), bg, np.uint8)
    # fabric texture, so the sheet is not the only thing generating edges
    rng = np.random.default_rng(7)
    img = np.clip(img.astype(np.int16) + rng.integers(-12, 12, img.shape), 0, 255).astype(np.uint8)
    cv2.fillPoly(img, [sheet_poly.astype(np.int32)], sheet_fill)
    buf = io.BytesIO()
    Image.fromarray(img, mode="L").convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


def _clean_sheet() -> np.ndarray:
    x, y = 200, 180
    return np.array([[x, y], [x + _SHEET_W, y], [x + _SHEET_W, y + _SHEET_H], [x, y + _SHEET_H]], float)


def _curled_sheet() -> np.ndarray:
    """A4 that curls where it lies over the garment — the real-photo failure mode.

    Paper on fabric bows rather than staying a crisp rectangle. approxPolyDP's tolerance scales with
    the contour PERIMETER, so a jagged edge actually *raises* the tolerance and gets smoothed away;
    what survives a tight epsilon is a smooth, sustained bow, which is exactly what a curled sheet
    has (and what the real photo showed: 7 vertices at eps=0.02, a clean quad at 0.05). The sheet
    stays paper-bright and A4-aspect throughout — only its outline is imperfect.
    """
    x, y = 200, 180
    sag = 30.0  # bow depth; must exceed 0.02*perimeter (~20px) to survive a tight simplification
    pts: list[list[float]] = []
    for i in range(9):  # top edge, bowed upward
        t = i / 8
        pts.append([x + t * _SHEET_W, y - sag * np.sin(np.pi * t)])
    pts.append([x + _SHEET_W, y + _SHEET_H])
    for i in range(9):  # bottom edge, bowed downward (right → left)
        t = i / 8
        pts.append([x + _SHEET_W - t * _SHEET_W, y + _SHEET_H + sag * np.sin(np.pi * t)])
    pts.append([x, y])
    return np.array(pts, float)


def test_clean_sheet_is_detected():
    ref = detect.detect_reference_quad(_render(_clean_sheet()), "a4")
    assert ref is not None
    assert ref["aspect_err"] < detect._ASPECT_TOL
    assert ref["brightness"] >= detect._PAPER_MIN_BRIGHT


def test_curled_sheet_is_detected_despite_extra_vertices():
    """The regression itself: a tight epsilon alone cannot fit a curled sheet.

    A real seller was told "No A4 sheet detected" with the sheet plainly in frame."""
    poly = _curled_sheet()
    data = _render(poly)

    # Precondition — prove the sheet really does defeat the old single-epsilon rule, so this test
    # keeps failing for the original reason if the ladder is ever removed.
    gray, _, _ = detect._open_gray_and_bgr(data)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    med = float(np.median(blur))
    edges = cv2.dilate(cv2.Canny(blur, int(max(0, 0.66 * med)), int(min(255, 1.33 * med))),
                       np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    biggest = max(contours, key=cv2.contourArea)
    tight = cv2.approxPolyDP(biggest, 0.02 * cv2.arcLength(biggest, True), True)
    assert len(tight) != 4, "fixture no longer reproduces the >4-vertex failure mode"

    ref = detect.detect_reference_quad(data, "a4")
    assert ref is not None, "torn/curled A4 must still be found — it is paper-bright and A4-aspect"
    assert ref["aspect_err"] < detect._ASPECT_TOL


def test_dark_object_is_not_mistaken_for_paper():
    """The looser ladder must not admit non-paper: brightness still discriminates."""
    assert detect.detect_reference_quad(_render(_clean_sheet(), sheet_fill=60), "a4") is None


def test_wrong_aspect_is_rejected():
    """A bright but square sheet is not an A4 — aspect still discriminates."""
    x, y = 200, 180
    square = np.array([[x, y], [x + 260, y], [x + 260, y + 260], [x, y + 260]], float)
    assert detect.detect_reference_quad(_render(square), "a4") is None


def test_detection_is_deterministic():
    data = _render(_curled_sheet())
    a = detect.detect_reference_quad(data, "a4")
    b = detect.detect_reference_quad(data, "a4")
    assert np.allclose(a["corners"], b["corners"])


# ---- scene_check: flat-lay vs on-body -------------------------------------
# The clutter limit separates two measured populations. Pinning both edges as literals so a future
# tweak has to consciously break a named case rather than quietly re-block real sellers (or start
# admitting on-body photos, which produce a confident WRONG chest measurement).
_REAL_SELLER_BEDSHEET_CLUTTER = 0.0733  # measured: genuine flat-lay on a patterned bedsheet
_ON_BODY_CLUTTER = 0.17                 # inherited calibration: on-body / in-scene photo


def _scene(clutter: float) -> dict:
    return detect.scene_check(
        ref={"bbox": [200.0, 180.0, 410.0, 477.0]},
        landmarks={"garment": [100, 60, 540, 620], "bg_edge_density": clutter},
        img_wh=(_FRAME_W, _FRAME_H),
    )


def test_plain_flatlay_passes():
    assert _scene(0.0)["coplanar_ok"] is True


def test_real_seller_on_patterned_bedsheet_is_not_rejected():
    """Regression: a valid flat-lay on a patterned surface must measure, not loop on RETAKE.

    The seller cannot 'retake' their way out of owning a patterned bedsheet.
    """
    out = _scene(_REAL_SELLER_BEDSHEET_CLUTTER)
    assert out["coplanar_ok"] is True, out["reason"]


def test_on_body_photo_is_still_rejected():
    """The gate must keep doing its job: an on-body photo breaks coplanarity → wrong cm, not a retake."""
    out = _scene(_ON_BODY_CLUTTER)
    assert out["coplanar_ok"] is False
    assert "flat-lay" in out["reason"]


def test_clutter_limit_keeps_margin_on_both_sides():
    assert _REAL_SELLER_BEDSHEET_CLUTTER < detect._MAX_SCENE_CLUTTER < _ON_BODY_CLUTTER


# ---- reproducibility -------------------------------------------------------
def test_landmarks_are_reproducible_across_runs():
    """One photo → one size chart, every time.

    GrabCut seeds its k-means from OpenCV's global RNG, so identical calls used to return slightly
    different silhouettes: waist_cm drifted 2.0 cm (≈0.8 of a 2.5 cm size step) over 5 runs of the
    same real flat-lay. A chart badged "measured, not guessed" must not move when nothing moved.
    """
    runs = [_garment_landmarks() for _ in range(4)]
    assert all(r is not None for r in runs)
    for key in ("garment", "chest", "waist", "shoulder", "hip"):
        values = [tuple(r[key]) for r in runs]
        assert len(set(values)) == 1, f"{key} is not reproducible across identical runs: {values}"


def test_grabcut_seed_is_pinned():
    """The seed is the mechanism the test above depends on — keep it explicit."""
    assert isinstance(detect._GRABCUT_SEED, int)


# ---- landmark sanity -------------------------------------------------------
def _garment_landmarks():
    """A tapered garment silhouette (wide shoulders → narrower waist → flared hem) on a plain field."""
    img = np.full((_FRAME_H, _FRAME_W), 240, np.uint8)
    body = np.array([
        [250, 60], [390, 60],      # shoulders
        [420, 150], [400, 300],    # chest → waist taper
        [370, 380],                # waist pinch
        [430, 600], [210, 600],    # flared hem (hip)
        [270, 380], [240, 300], [220, 150],
    ], np.int32)
    cv2.fillPoly(img, [body], 40)
    buf = io.BytesIO()
    Image.fromarray(img, mode="L").convert("RGB").save(buf, format="PNG")
    return detect.detect_garment_landmarks(buf.getvalue(), None)


def test_landmarks_are_anatomically_ordered():
    """shoulder above chest above waist above hip.

    Regression: the waist (0.45–0.72) and hip (0.55–0.95) search bands overlapped, so on a real
    flat-lay the hip was found at 57% of the garment while the waist sat at 72% — a hip measured
    ABOVE the waist. Order is a property of the garment; it is now enforced by construction.
    """
    lm = _garment_landmarks()
    assert lm is not None
    ys = [lm[k][1] for k in ("shoulder", "chest", "waist", "hip")]
    assert ys == sorted(ys), f"landmarks out of anatomical order (y px): {ys}"


def test_hip_is_below_waist():
    lm = _garment_landmarks()
    assert lm["hip"][1] > lm["waist"][1]


def test_no_neck_landmark_is_invented():
    """A neckline is an interior hole; the outer silhouette cannot see it.

    The old `narrowest_in(0.0, 0.12)` returned the topmost sliver of the mask and called it a neck —
    32.9 cm on a real kurti. Omit, exactly as sleeve is omitted, rather than report an artifact.
    """
    assert "neck" not in _garment_landmarks()
