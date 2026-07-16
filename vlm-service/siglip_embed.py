"""Agent-1 Live-Proof same-product embedding via SigLIP (Hugging Face Hub), loaded once at startup.

Production vision-embedding gate. A SigLIP image encoder — google/siglip-large-patch16-384 by default,
overridable with SIGLIP_MODEL — is pulled from the Hugging Face Hub and cached in-process (loaded ONCE,
not per request). We embed the BACKGROUND-ZEROED garment crop of each image and compare by COSINE, so
the decision keys on the garment itself (colour, pattern, print, logo, texture, shape) and is robust to
background, lighting, pose, camera angle and rotation. No raw-pixel comparison.

Fails gracefully: if torch/transformers or the weights can't load, available() is False and the caller
falls back to the ONNX gate — never a crash, never a fabricated pass. All stages log for debugging.
"""
from __future__ import annotations

import io
import logging
import os
import threading

import numpy as np

log = logging.getLogger("agent1.siglip")

MODEL_ID = os.getenv("SIGLIP_MODEL", "google/siglip-large-patch16-384")

_lock = threading.Lock()
_state: dict = {"loaded": False, "ok": False, "model": None, "proc": None}


def _ensure_loaded() -> bool:
    """Load the SigLIP model + image processor once (thread-safe). Returns True if usable."""
    if _state["loaded"]:
        return _state["ok"]
    with _lock:
        if _state["loaded"]:
            return _state["ok"]
        try:
            import torch
            from transformers import AutoImageProcessor, AutoModel

            log.info("SigLIP: loading %s from the Hugging Face Hub …", MODEL_ID)
            # AutoImageProcessor (not AutoProcessor) → image path only, no text tokenizer / sentencepiece.
            # The fast processor needs torchvision; fall back to the slow (PIL/numpy) one if it's absent.
            try:
                proc = AutoImageProcessor.from_pretrained(MODEL_ID)
            except Exception:  # noqa: BLE001 — torchvision missing → slow processor is equivalent here
                proc = AutoImageProcessor.from_pretrained(MODEL_ID, use_fast=False)
            model = AutoModel.from_pretrained(MODEL_ID).eval()
            try:
                torch.set_num_threads(max(1, os.cpu_count() or 1))
            except Exception:  # noqa: BLE001 — thread hint is best-effort
                pass
            _state.update(model=model, proc=proc, ok=True)
            log.info("SigLIP: %s ready.", MODEL_ID)
        except Exception as e:  # noqa: BLE001 — degrade to the ONNX gate, never crash the service
            log.warning("SigLIP unavailable (%s): %s — falling back to the ONNX gate.",
                        type(e).__name__, e)
            _state["ok"] = False
        _state["loaded"] = True
    return _state["ok"]


def warmup() -> bool:
    """Eagerly load at app startup so the first verification is warm. Safe to call repeatedly."""
    return _ensure_loaded()


def available() -> bool:
    return _ensure_loaded()


def embed(image_bytes: bytes) -> np.ndarray | None:
    """L2-normalised SigLIP image embedding, or None if the model/image is unusable."""
    if not _ensure_loaded():
        return None
    try:
        import torch
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inp = _state["proc"](images=img, return_tensors="pt")
        with torch.no_grad():
            out = _state["model"].get_image_features(**inp)
        # get_image_features returns a tensor on some versions and a *ModelOutput on others — pull the
        # pooled image embedding out of whatever shape it is.
        t = out
        if not isinstance(out, torch.Tensor):
            t = None
            for attr in ("pooler_output", "image_embeds", "last_hidden_state"):
                v = getattr(out, attr, None) if not isinstance(out, dict) else out.get(attr)
                if v is not None:
                    t = v
                    break
            if t is None:
                raise TypeError(f"unexpected image-features type {type(out).__name__}")
        arr = np.squeeze(t.detach().cpu().numpy().astype("float32"))
        # If it's a per-patch sequence (P, D) rather than a pooled (D,) vector, mean-pool the patches.
        if arr.ndim > 1:
            arr = arr.mean(axis=0)
        norm = float(np.linalg.norm(arr))
        return arr / norm if norm else arr
    except Exception as e:  # noqa: BLE001 — one bad image must not fail the pipeline
        log.warning("SigLIP embed failed (%s): %s", type(e).__name__, e)
        return None


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity of two already-normalised embeddings."""
    return float(np.dot(a, b))
