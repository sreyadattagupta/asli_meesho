"""WS2 — single-view metrology: homography DLT + calibrated sizing."""
from __future__ import annotations

import numpy as np

import metrology


def test_homography_recovers_known_correspondences():
    src = np.array([[100, 100], [310, 100], [310, 397], [100, 397]], dtype=float)
    dst = np.array([[0, 0], [21, 0], [21, 29.7], [0, 29.7]], dtype=float)
    H = metrology.homography(src, dst)
    for s, d in zip(src, dst):
        got = metrology._apply(H, s)
        assert np.allclose(got, d, atol=1e-6)


def test_measure_axis_aligned_recovers_cm_and_waist():
    # A4 imaged as a clean 210x297 px rectangle => 10 px/cm, no perspective.
    corners = [[100, 100], [310, 100], [310, 397], [100, 397]]
    reference_box = [100, 100, 310, 397]
    garment = [50, 100, 450, 800]      # 400 px wide, 700 px tall
    chest = [50, 300, 450, 320]        # 400 px  -> 40 cm
    waist = [70, 600, 430, 620]        # 360 px  -> 36 cm
    m = metrology.measure("a4", reference_box, garment, chest, waist, corners)
    assert m["method"] == "homography"
    assert abs(m["chest_cm"] - 40.0) < 0.5
    assert abs(m["length_cm"] - 70.0) < 0.5
    assert abs(m["waist_cm"] - 36.0) < 0.5          # measured, not chest*0.92 (=36.8)
    assert m["ref_aspect_err"] < 0.05
    assert m["residual"] < 0.02


def test_bad_reference_aspect_flags_low_confidence():
    # A square "reference" box is not an A4 (1.414) -> large aspect error, must not read confident.
    reference_box = [100, 100, 300, 300]  # aspect 1.0
    garment = [50, 100, 450, 800]
    m = metrology.measure("a4", reference_box, garment, None, None, None)
    assert m["ref_aspect_err"] > 0.25
    import calibration
    conf = calibration.sizing_confidence(m["ref_aspect_err"], m["residual"], m["box_sanity"])
    assert conf < 0.6


def test_ratio_fallback_without_corners():
    reference_box = [100, 100, 310, 397]  # 210x297 px, 10 px/cm
    garment = [50, 100, 450, 800]
    chest = [50, 300, 450, 320]
    m = metrology.measure("a4", reference_box, garment, chest, None, None)
    assert m["method"] == "ratio"
    assert abs(m["chest_cm"] - 40.0) < 1.0
    assert m["waist_cm"] > 0


def test_tape_uses_tape_dims_not_a4():
    # Same pixels, different reference type must yield different cm (no silent A4 substitution).
    corners = [[100, 100], [150, 100], [150, 400], [100, 400]]
    box = [100, 100, 150, 400]
    garment = [80, 100, 200, 500]
    a4 = metrology.measure("a4", box, garment, None, None, corners)
    tape = metrology.measure("tape", box, garment, None, None, corners)
    assert a4["reference_used"] == "a4" and tape["reference_used"] == "tape"
    assert a4["length_cm"] != tape["length_cm"]
