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
            # device_map="cpu" (accelerate) dispatches the weights shard-by-shard DIRECTLY onto CPU.
            # This is the root fix for two coupled Cloud Run failures seen in the logs: (1) the three
            # torch models loading near the 12Gi ceiling left SigLIP tensors on `meta` (a low-memory
            # partial materialisation) so the forward raised "Tensor on device meta is not on the
            # expected device cpu!", and (2) the previous `.eval().to("cpu")` remedy then raised
            # "Cannot copy out of meta tensor; use to_empty()" at load. device_map streams each shard to
            # its final CPU home (lower peak RAM) and never routes through a meta→cpu copy — so nothing
            # can remain on meta, and there is NO trailing .to() (device_map already placed everything).
            model = AutoModel.from_pretrained(
                MODEL_ID, torch_dtype=torch.float32, device_map="cpu").eval()
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


# ----------------------------------------------------------------------------
# Zero-shot COLOUR FAMILY (SigLIP text tower). Agent-1 colour-family guard.
#
# SigLIP's image cosine keys mostly on design/pattern/shape and is deliberately colour-tolerant, so a
# same-design garment in a DIFFERENT primary colour (pink vs green) scores like a genuine match. To
# catch "same design, wrong colour" we classify each garment's dominant CHROMATIC colour with the same
# SigLIP model's text tower (zero-shot, sigmoid scoring). Robust to shade/lighting because it reasons
# semantically ("is this green?"), not on raw pixels — light/dark/olive/mint all read as green.
# ----------------------------------------------------------------------------

_text_state: dict = {"loaded": False, "ok": False, "proc": None}

# Prompt → PRIMARY family. Several shades per family so the zero-shot has room to land within a family.
_COLOUR_PROMPTS: dict[str, str] = {
    "a red garment": "red", "a maroon garment": "red", "a crimson garment": "red",
    "a pink garment": "pink", "a rose pink garment": "pink", "a magenta garment": "pink",
    "an orange garment": "orange", "a peach garment": "orange",
    "a yellow garment": "yellow", "a mustard yellow garment": "yellow",
    "a green garment": "green", "an olive green garment": "green", "a mint green garment": "green",
    "a blue garment": "blue", "a navy blue garment": "blue", "a sky blue garment": "blue",
    "a purple garment": "purple", "a lavender garment": "purple",
    "a brown garment": "brown", "a beige garment": "brown", "a tan garment": "brown",
    "a black garment": "black",
    "a white garment": "white", "a cream garment": "white",
    "a grey garment": "grey",
}
_CHROMATIC = {"red", "pink", "orange", "yellow", "green", "blue", "purple", "brown"}
# Families that sit next to each other on the wheel — a shift between them is NOT a "clearly different
# primary colour family" and must not trigger a rejection (the seller spec: pink↔red↔peach are fine).
_ADJACENT: set[frozenset[str]] = {
    frozenset(p) for p in [
        ("red", "pink"), ("red", "orange"), ("red", "maroon"), ("pink", "purple"),
        ("orange", "yellow"), ("orange", "brown"), ("yellow", "green"), ("yellow", "brown"),
        ("green", "blue"), ("blue", "purple"), ("brown", "red"),
    ]
}


def families_adjacent(a: str, b: str) -> bool:
    """True if two primary families are the same or neighbours on the colour wheel (not a real diff)."""
    return a == b or frozenset((a, b)) in _ADJACENT


def _ensure_text() -> bool:
    """Load the full SigLIP processor (image + text tokenizer) once, for zero-shot text scoring."""
    if _text_state["loaded"]:
        return _text_state["ok"]
    with _lock:
        if _text_state["loaded"]:
            return _text_state["ok"]
        try:
            from transformers import AutoProcessor  # needs sentencepiece (in the image)

            if not _ensure_loaded():
                raise RuntimeError("SigLIP model not available")
            _text_state["proc"] = AutoProcessor.from_pretrained(MODEL_ID)
            _text_state["ok"] = True
            log.info("SigLIP zero-shot colour classifier ready.")
        except Exception as e:  # noqa: BLE001 — degrade to colour_sim-only, never crash
            log.warning("SigLIP zero-shot unavailable (%s): %s — colour guard uses colour_sim only.",
                        type(e).__name__, e)
            _text_state["ok"] = False
        _text_state["loaded"] = True
    return _text_state["ok"]


def colour_family(image_bytes: bytes) -> dict | None:
    """Zero-shot dominant colour family of a garment crop.

    Returns {family, prob, chromatic, chromatic_family, chromatic_prob} or None if unavailable.
    `family` is the top label overall; `chromatic_family` is the strongest NON-neutral colour (what
    matters for "same colour?" on a black/white garment with coloured accents).
    """
    if not _ensure_text():
        return None
    try:
        import torch
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        prompts = list(_COLOUR_PROMPTS.keys())
        inp = _text_state["proc"](text=prompts, images=img, padding="max_length", return_tensors="pt")
        with torch.no_grad():
            out = _state["model"](**inp)
        probs = torch.sigmoid(out.logits_per_image[0]).detach().cpu().numpy().astype("float32")

        # Best prob per PRIMARY family (max over that family's shade prompts).
        by_fam: dict[str, float] = {}
        for i, prompt in enumerate(prompts):
            fam = _COLOUR_PROMPTS[prompt]
            by_fam[fam] = max(by_fam.get(fam, 0.0), float(probs[i]))

        top_fam = max(by_fam, key=by_fam.get)
        chrom = {f: p for f, p in by_fam.items() if f in _CHROMATIC}
        chrom_fam = max(chrom, key=chrom.get) if chrom else None
        return {
            "family": top_fam,
            "prob": round(by_fam[top_fam], 3),
            "chromatic": top_fam in _CHROMATIC,
            "chromatic_family": chrom_fam,
            "chromatic_prob": round(chrom[chrom_fam], 3) if chrom_fam else 0.0,
        }
    except Exception as e:  # noqa: BLE001 — one bad classification must not fail the pipeline
        log.warning("SigLIP colour_family failed (%s): %s", type(e).__name__, e)
        return None
