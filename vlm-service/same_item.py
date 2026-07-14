"""Agent-1 same-INSTANCE decision — CLIP (via ONNX) is the gate; DINOv2 is reported evidence.

Design is EVIDENCE-DRIVEN, not assumed. We evaluated CLIP-ViT-B/32 and DINOv2-small on
Marqo/deepfashion-inshop (scripts/eval_matcher.py) over same-instance positives, same-category
"semantic" negatives, and same-category+colour "look-alike" negatives:

  * CLIP reliably catches OBVIOUSLY-DIFFERENT products (semantic AUC ~0.88) — the achievable job.
  * NO embedding (CLIP or DINOv2) separates same-category+colour LOOK-ALIKES (all AUC 0.53-0.67).
    DINOv2, contrary to the instance-retrieval literature, was NOT better here and added no
    discrimination — so it is wired as reported evidence only, never a hard gate.

Therefore the visual gate is CLIP/max ≥ Tc (max of whole-frame and zeroed-crop cosine — the crop
adds robustness when the live capture is cluttered). Adversarial look-alike substitution is out of
reach for any single embedding and is deferred to the challenge code, liveness/reuse detection, and
the human review queue — the possession proof never rested on the embedding alone.

Served with onnxruntime only (no torch). Thresholds come from models/same_item_calibration.json
(env-overridable). FAIL-CLOSED: if CLIP's ONNX is absent we degrade to DINOv2 alone (documented,
stricter) and, if neither is present, report available() False so the caller uses its legacy path —
never an auto-pass.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import clip_embed
import dino_embed

_CAL_PATH = Path(os.getenv("SAME_ITEM_CALIBRATION",
                           str(Path(__file__).resolve().parent / "models" / "same_item_calibration.json")))
_DEFAULTS = {"gate_signal": "clip/max", "gate_threshold": 0.78, "evidence_signal": "dino/max/cls"}


def _config() -> dict:
    cfg = dict(_DEFAULTS)
    try:
        art = json.loads(_CAL_PATH.read_text())
        for k in ("gate_signal", "gate_threshold", "evidence_signal"):
            if k in art:
                cfg[k] = art[k]
    except Exception:  # noqa: BLE001 — artifact absent/malformed → defaults
        pass
    cfg["gate_signal"] = os.getenv("SAME_ITEM_GATE_SIGNAL", cfg["gate_signal"])
    cfg["evidence_signal"] = os.getenv("SAME_ITEM_EVIDENCE_SIGNAL", cfg["evidence_signal"])
    cfg["gate_threshold"] = float(os.getenv("SAME_ITEM_THRESHOLD", cfg["gate_threshold"]))
    return cfg


def available() -> bool:
    """True if at least one backbone can produce a real embedding."""
    return clip_embed.available() or dino_embed.available()


def _clip_score(signal: str, catalog: bytes, live: bytes) -> float:
    """clip/whole = whole-frame cosine; clip/max = max(whole, zeroed-crop) for clutter robustness."""
    if signal == "clip/max":
        import segment

        cc = segment.segment_garment(catalog, zero_bg=True)["bytes"]  # zeroed crop = CLIP's regime
        lc = segment.segment_garment(live, zero_bg=True)["bytes"]
        return max(clip_embed.cosine(catalog, live), clip_embed.cosine(cc, lc))
    return clip_embed.cosine(catalog, live)


def _dino_evidence(signal: str, catalog: bytes, live: bytes) -> Optional[dict]:
    if not dino_embed.available():
        return None
    _, repr_, pool = signal.split("/")  # dino/<repr>/<pool>
    return dino_embed.instance_score(catalog, live, repr=repr_, pooling=pool)


def decide(catalog_bytes: bytes, live_bytes: bytes) -> dict:
    """Run the same-item gate. CLIP decides; DINOv2 is attached as evidence (non-gating)."""
    cfg = _config()
    tc = cfg["gate_threshold"]
    have_clip = clip_embed.available()

    dino = _dino_evidence(cfg["evidence_signal"], catalog_bytes, live_bytes)
    dino_score = dino["score"] if dino else None

    if have_clip:
        clip_score = _clip_score(cfg["gate_signal"], catalog_bytes, live_bytes)
        same_item = bool(clip_score >= tc)
        method, degraded = "clip", False
    elif dino_score is not None:
        # CLIP ONNX missing: fall back to DINOv2 as the gate (documented, stricter degrade).
        clip_score = None
        same_item = bool(dino_score >= float(os.getenv("SAME_ITEM_DINO_FALLBACK_THRESHOLD", "0.80")))
        method, degraded = "dinov2-fallback", True
    else:
        clip_score, same_item, method, degraded = None, False, "none", True

    return {
        "same_item": same_item,
        "gate_score": None if clip_score is None else round(clip_score, 4),
        "gate_signal": cfg["gate_signal"], "threshold": tc,
        "dino_evidence": dino_score, "dino_signal": cfg["evidence_signal"],
        "dino_detail": dino, "method": method, "degraded": degraded,
    }


if __name__ == "__main__":
    import sys

    if "--selftest" in sys.argv:
        d = Path(__file__).resolve().parent / "test_data"
        cat = (d / "real_kurti_catalog.png").read_bytes()
        for name in ("real_kurti_live.jpg", "real_other_dress.png"):
            r = decide(cat, (d / name).read_bytes())
            print(f"{name:26s} same={r['same_item']!s:5s} clip={r['gate_score']} "
                  f"(Tc={r['threshold']}) dino_evidence={r['dino_evidence']} [{r['method']}]")
