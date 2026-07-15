import numpy as np
from measure_engine import measure_image


def test_no_reference_returns_retake(monkeypatch):
    import detect
    monkeypatch.setattr(detect, "detect_reference_quad", lambda *a, **k: None)
    out = measure_image(b"not-an-image", "a4")
    assert out["retake"] is True and out["measurements"] == {}


def test_measure_returns_dims_and_signals(monkeypatch):
    import detect
    # A4-ish quad ~200x290 px (maps to 21.0 x 29.7 cm) + a plausible garment silhouette.
    ref = {"corners": np.array([[10, 10], [210, 12], [208, 300], [8, 298]], float),
           "bbox": [8.0, 10.0, 210.0, 300.0], "aspect_err": 0.02}
    lm = {"garment": [50, 20, 160, 290], "shoulder": [50, 30, 160, 30],
          "chest": [55, 80, 150, 80], "waist": [60, 180, 140, 180],
          "fg_frac": 0.42, "landmark_ok": True}
    monkeypatch.setattr(detect, "detect_reference_quad", lambda *a, **k: ref)
    monkeypatch.setattr(detect, "detect_garment_landmarks", lambda *a, **k: lm)
    out = measure_image(b"img", "a4")
    assert out["retake"] is False
    assert {"chest_cm", "waist_cm", "length_cm", "shoulder_cm"} <= set(out["measurements"])
    assert all(v > 0 for v in out["measurements"].values())
    assert set(out["signals"]) >= {"seg_quality", "landmark_conf", "ref_aspect_err", "residual"}


def test_collapsed_garment_returns_retake(monkeypatch):
    import detect
    ref = {"corners": np.array([[10, 10], [210, 12], [208, 300], [8, 298]], float),
           "bbox": [8.0, 10.0, 210.0, 300.0], "aspect_err": 0.02}
    monkeypatch.setattr(detect, "detect_reference_quad", lambda *a, **k: ref)
    monkeypatch.setattr(detect, "detect_garment_landmarks", lambda *a, **k: None)
    out = measure_image(b"img", "a4")
    assert out["retake"] is True and out["measurements"] == {}
