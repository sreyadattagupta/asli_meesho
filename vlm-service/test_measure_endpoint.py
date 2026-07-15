"""Endpoint test for /vlm/measure — real handler (detect → metrology), monkeypatched detection.

The handler keeps its quality + scene-coplanarity guards and now returns the augmented contract
(retake / provider / measurements / shoulder_cm + measure_engine-style signals) that the web fusion
layer consumes. We stub only the CV detectors so the test needs no real image or OpenCV.
"""
import io
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

import main
import cv
import detect


def _png(w=200, h=300) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, format="PNG")
    return buf.getvalue()


def _post(client):
    return client.post("/vlm/measure",
                       files={"flatlay": ("f.png", _png(), "image/png")},
                       data={"reference_object": "a4"})


def test_measure_endpoint_returns_augmented_shape(monkeypatch):
    monkeypatch.setattr(cv, "quality", lambda *a, **k: {"ok": True, "reason": "", "blur_var": 200.0})
    ref = {"corners": np.array([[10, 10], [210, 12], [208, 300], [8, 298]], float),
           "bbox": [8.0, 10.0, 210.0, 300.0], "aspect_err": 0.02}
    lm = {"garment": [50, 20, 160, 290], "shoulder": [50, 30, 160, 30],
          "chest": [55, 80, 150, 80], "waist": [60, 180, 140, 180],
          "fg_frac": 0.42, "landmark_ok": True}
    monkeypatch.setattr(detect, "detect_reference_quad", lambda *a, **k: ref)
    monkeypatch.setattr(detect, "detect_garment_landmarks", lambda *a, **k: lm)
    monkeypatch.setattr(detect, "scene_check",
                        lambda *a, **k: {"coplanar_ok": True, "reason": "", "clutter": 0.0,
                                         "garment_height_frac": 0.5})

    r = _post(TestClient(main.app))
    assert r.status_code == 200
    body = r.json()
    assert body["retake"] is False and body["provider"] == "cv"
    assert body["measurements"]["chest_cm"] > 0 and "shoulder_cm" in body["measurements"]
    assert {"seg_quality", "landmark_conf", "ref_aspect_err", "residual"} <= set(body["signals"])


def test_measure_endpoint_retake_on_no_reference(monkeypatch):
    monkeypatch.setattr(cv, "quality", lambda *a, **k: {"ok": True, "reason": "", "blur_var": 200.0})
    monkeypatch.setattr(detect, "detect_reference_quad", lambda *a, **k: None)
    monkeypatch.setattr(detect, "detect_garment_landmarks", lambda *a, **k: None)
    r = _post(TestClient(main.app))
    assert r.status_code == 200
    body = r.json()
    assert body["retake"] is True and body["measurements"] == {}
