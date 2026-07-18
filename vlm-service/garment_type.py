"""Agent-2 garment-type classification via a fine-tuned Hugging Face model.

The model dsreya/garment-type-classifier (ViT fine-tuned on Colab GPU —
notebooks/agent2_garment_classifier_colab.ipynb) is pulled from the HF Hub and cached in-process
(loaded ONCE at startup, like siglip_embed). This replaces the ad-hoc VLM garment-type read with a
real trained model — so Agent 2's detected garment type comes from HF-hosted training, not an LLM.

Graceful: if torch/transformers or the weights can't load, available() is False and the caller falls
back (VLM read, then None) — never a crash, never a fabricated label. Logs every stage.
"""
from __future__ import annotations

import io
import logging
import os
import threading

log = logging.getLogger("agent2.garment_type")

MODEL_ID = os.getenv("GARMENT_MODEL", "dsreya/garment-type-classifier")

_lock = threading.Lock()
_state: dict = {"loaded": False, "ok": False, "pipe": None}


def _ensure_loaded() -> bool:
    if _state["loaded"]:
        return _state["ok"]
    with _lock:
        if _state["loaded"]:
            return _state["ok"]
        try:
            from transformers import pipeline

            log.info("garment-type: loading %s from the Hugging Face Hub …", MODEL_ID)
            # device_map="cpu" (accelerate) materialises the ViT weights directly onto CPU, shard by
            # shard — same root fix as siglip_embed: under the concurrent 12Gi load this classifier was
            # intermittently left on `meta` ("Cannot copy out of meta tensor"), which killed Agent-2's
            # trained garment-type read. Streaming placement cuts peak RAM and never touches meta.
            _state["pipe"] = pipeline("image-classification", model=MODEL_ID, device_map="cpu")
            _state["ok"] = True
            log.info("garment-type: %s ready.", MODEL_ID)
        except Exception as e:  # noqa: BLE001 — degrade to the VLM read, never crash
            log.warning("garment-type unavailable (%s): %s", type(e).__name__, e)
            _state["ok"] = False
        _state["loaded"] = True
    return _state["ok"]


def warmup() -> bool:
    return _ensure_loaded()


def available() -> bool:
    return _ensure_loaded()


def classify(image_bytes: bytes) -> dict | None:
    """Top garment-type prediction {type, confidence}, or None if the model/image is unusable."""
    if not _ensure_loaded():
        return None
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        top = _state["pipe"](img)[0]
        return {"type": str(top["label"]), "confidence": round(float(top["score"]), 4)}
    except Exception as e:  # noqa: BLE001 — one bad image must not fail the pipeline
        log.warning("garment-type classify failed (%s): %s", type(e).__name__, e)
        return None
