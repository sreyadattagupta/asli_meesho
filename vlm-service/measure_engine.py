"""Agent 2 — measure ONE image end to end (deterministic, per-image scale).

reference quad (detect) → garment silhouette landmarks (detect) → planar homography px→cm
(metrology) → per-dimension cm + the quality signals that feed dimension_confidence. No reference or
collapsed silhouette → retake (never a fabricated number). Chest/waist/length/shoulder share ONE
homography; sleeve is not separable from a flat silhouette, so it is left unmeasured rather than
invented. This composes the existing real CV modules — no mock, no fixed size table.
"""
from __future__ import annotations

import detect
import metrology


def _seg_quality(fg_frac: float | None) -> float:
    if fg_frac is None or fg_frac < 0:
        return 0.3
    # peak quality near a mid coverage (~0.4); collapse or fill-everything → low.
    return round(max(0.0, 1.0 - abs(fg_frac - 0.4) / 0.4), 4)


def _retake(reason: str, ref_ok: bool) -> dict:
    return {
        "retake": True, "reason": reason, "provider": "cv", "measurements": {},
        "signals": {"seg_quality": 0.0, "landmark_conf": 0.0,
                    "ref_aspect_err": 0.5 if ref_ok else 1.0,
                    "residual": 0.5 if ref_ok else 1.0,
                    "resolution_ok": 0.5 if ref_ok else 0.0, "method": "none"},
    }


def measure_image(image_bytes: bytes, reference: str = "a4") -> dict:
    ref = detect.detect_reference_quad(image_bytes, reference)
    if ref is None:
        return _retake("no_reference", ref_ok=False)

    lm = detect.detect_garment_landmarks(image_bytes, ref.get("bbox"))
    if lm is None or not lm.get("landmark_ok", False):
        return _retake("no_garment", ref_ok=True)

    corners = detect._order_corners(ref["corners"])
    m = metrology.measure(
        reference, ref["bbox"], lm["garment"], lm["chest"], lm["waist"],
        reference_corners=corners, shoulder=lm.get("shoulder"),
    )
    if m["method"] == "none":
        return _retake("no_scale", ref_ok=True)

    measurements: dict[str, float] = {}
    for key in ("chest_cm", "waist_cm", "length_cm", "shoulder_cm"):
        v = m.get(key)
        if isinstance(v, (int, float)) and v > 0:
            measurements[key] = float(v)
    if len(measurements) < 2:
        return _retake("insufficient_dims", ref_ok=True)

    signals = {
        "seg_quality": _seg_quality(lm.get("fg_frac")),
        "landmark_conf": 0.9 if lm.get("landmark_ok") else 0.4,
        "ref_aspect_err": m["ref_aspect_err"],
        "residual": m["residual"],
        "resolution_ok": 1.0,
        "method": m["method"],
    }
    return {"retake": False, "reason": "", "provider": "cv",
            "measurements": measurements, "signals": signals}
