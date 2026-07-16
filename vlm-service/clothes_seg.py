"""Clothing segmentation via SegFormer (mattmdjaga/segformer_b2_clothes) from the Hugging Face Hub.

A SegFormer-B2 fine-tuned on clothing parsing (ATR 18-class) — pulled from the Hub and cached in-process
(loaded ONCE, like siglip_embed). It produces a real garment mask (union of the clothing classes:
Upper-clothes / Skirt / Pants / Dress), which beats GrabCut at isolating the garment from background,
skin, and props — feeding cleaner crops to the Agent-1 SigLIP embedding and cleaner boundaries to
Agent-2 sizing.

Graceful: if torch/transformers or the weights can't load, available() is False and callers fall back
to the existing GrabCut path — never a crash. All stages log for debugging.
"""
from __future__ import annotations

import io
import logging
import os
import threading

import numpy as np
from PIL import Image

log = logging.getLogger("agent.clothes_seg")

MODEL_ID = os.getenv("CLOTHES_SEG_MODEL", "mattmdjaga/segformer_b2_clothes")
# ATR label ids that are the MAIN garment (exclude bg/skin/hair/shoes/bag/accessories).
_GARMENT_IDS = {4, 5, 6, 7}  # Upper-clothes, Skirt, Pants, Dress
_MIN_FRAC = 0.02  # below this the mask is too small to trust → fall back

_lock = threading.Lock()
_state: dict = {"loaded": False, "ok": False, "model": None, "proc": None}


def _ensure_loaded() -> bool:
    if _state["loaded"]:
        return _state["ok"]
    with _lock:
        if _state["loaded"]:
            return _state["ok"]
        try:
            import torch  # noqa: F401
            from transformers import AutoModelForSemanticSegmentation, SegformerImageProcessor

            log.info("clothes-seg: loading %s from the Hugging Face Hub …", MODEL_ID)
            _state["proc"] = SegformerImageProcessor.from_pretrained(MODEL_ID)
            _state["model"] = AutoModelForSemanticSegmentation.from_pretrained(MODEL_ID).eval()
            _state["ok"] = True
            log.info("clothes-seg: %s ready.", MODEL_ID)
        except Exception as e:  # noqa: BLE001 — degrade to GrabCut, never crash
            log.warning("clothes-seg unavailable (%s): %s", type(e).__name__, e)
            _state["ok"] = False
        _state["loaded"] = True
    return _state["ok"]


def warmup() -> bool:
    return _ensure_loaded()


def available() -> bool:
    return _ensure_loaded()


def _garment_mask(img: Image.Image) -> np.ndarray | None:
    import torch
    import torch.nn.functional as F

    inputs = _state["proc"](images=img, return_tensors="pt")
    with torch.no_grad():
        logits = _state["model"](**inputs).logits  # (1, C, h, w)
    up = F.interpolate(logits, size=img.size[::-1], mode="bilinear", align_corners=False)
    pred = up.argmax(dim=1)[0].cpu().numpy()  # (H, W) class ids
    mask = np.isin(pred, list(_GARMENT_IDS)).astype(np.uint8)
    return mask


def garment_crop(data: bytes, zero_bg: bool = True) -> dict | None:
    """Garment crop {bytes, method, fg_frac, bbox} from the SegFormer mask, or None to fall back.

    Mirrors segment.segment_garment's shape so it is a drop-in primary. zero_bg blacks out the
    background inside the bbox (right for CLIP/SigLIP embeddings)."""
    if not _ensure_loaded():
        return None
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        arr = np.asarray(img)
        mask = _garment_mask(img)
        frac = float(mask.mean())
        if frac < _MIN_FRAC:
            return None  # too little garment found → let GrabCut try
        ys, xs = np.where(mask > 0)
        y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
        crop = arr[y0:y1, x0:x1].copy()
        if zero_bg:
            m = mask[y0:y1, x0:x1]
            crop[m == 0] = 0
        buf = io.BytesIO()
        Image.fromarray(crop).save(buf, format="JPEG", quality=92)
        return {"bytes": buf.getvalue(), "method": "segformer", "fg_frac": round(frac, 3),
                "bbox": (x0, y0, x1, y1)}
    except Exception as e:  # noqa: BLE001 — one bad image must not fail the pipeline
        log.warning("clothes-seg crop failed (%s): %s", type(e).__name__, e)
        return None
