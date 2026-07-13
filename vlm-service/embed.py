"""Image-embedding trigger source — Qdrant local mode (PPT-declared vector DB).

Primary method is CLIP (openai/clip-vit-base-patch32, 512-d, cosine). Torch wheels can fail on
Python 3.14 on this box — so we degrade cleanly to a 64-bit perceptual hash (imagehash + Pillow)
with the SAME endpoints and payload shape. The reverse-image search is a TRIGGER only (invariant #1).

Run the indexer BEFORE starting uvicorn — Qdrant local mode is single-process (file lock):
    python index_catalog.py
    uvicorn main:app --port 8000
"""
from __future__ import annotations

import io
import json
from pathlib import Path

from PIL import Image

_QDRANT_PATH = str(Path(__file__).resolve().parent / "qdrant_data")
_COLLECTION = "catalog"

# ---- method selection: CLIP if the heavy stack imports, else perceptual hash ----
_METHOD = "phash"
_clip_model = None
_clip_proc = None
try:  # pragma: no cover - depends on local wheels
    import torch
    from transformers import CLIPModel, CLIPProcessor

    _clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    _clip_proc = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    _clip_model.eval()
    _METHOD = "clip"
except Exception:  # noqa: BLE001 - torch/transformers unavailable → phash fallback
    import imagehash  # lightweight, pure-Python wheels

_DIM = 512 if _METHOD == "clip" else 64


def method() -> str:
    return _METHOD


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


def _vector(data: bytes) -> list[float]:
    img = _open(data)
    if _METHOD == "clip":  # pragma: no cover
        inputs = _clip_proc(images=img, return_tensors="pt")
        with torch.no_grad():
            feat = _clip_model.get_image_features(**inputs)[0]
        feat = feat / feat.norm()
        return feat.tolist()
    import imagehash

    bits = imagehash.phash(img).hash.flatten()  # 8x8 → 64 bits
    return [1.0 if b else 0.0 for b in bits]


def _hash_hex(data: bytes) -> str:
    import imagehash

    return str(imagehash.phash(_open(data)))


# ---- Qdrant local-mode store ----------------------------------------------
_client = None


def _qc():
    global _client
    if _client is None:
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, VectorParams

        _client = QdrantClient(path=_QDRANT_PATH)
        try:
            _client.get_collection(_COLLECTION)
        except Exception:  # noqa: BLE001 - collection missing on first run
            _client.recreate_collection(
                _COLLECTION,
                vectors_config=VectorParams(size=_DIM, distance=Distance.COSINE),
            )
    return _client


def index_image(data: bytes, payload: dict) -> None:
    from qdrant_client.models import PointStruct

    hex_hash = _hash_hex(data)
    pid = int(hex_hash[:15], 16)  # stable numeric id from the perceptual hash
    _qc().upsert(
        _COLLECTION,
        [PointStruct(id=pid, vector=_vector(data), payload={**payload, "image_hash": hex_hash})],
    )


def similar(data: bytes, top_k: int = 5) -> list[dict]:
    hits = _qc().search(_COLLECTION, query_vector=_vector(data), limit=top_k)
    return [
        {
            "score": float(h.score),
            "image_hash": (h.payload or {}).get("image_hash", ""),
            "payload": {"title": (h.payload or {}).get("title", ""), "url": (h.payload or {}).get("url", "")},
        }
        for h in hits
    ]


def embed_vector(data: bytes) -> dict:
    return {"vector": _vector(data), "method": _METHOD}


if __name__ == "__main__":  # simple self-check
    import sys

    if "--selftest" in sys.argv:
        # A tiny solid image embedded against itself must be maximally self-similar.
        buf = io.BytesIO()
        Image.new("RGB", (64, 64), (120, 40, 160)).save(buf, format="JPEG")
        raw = buf.getvalue()
        index_image(raw, {"title": "selftest", "url": "selftest"})
        top = similar(raw, top_k=1)
        print(json.dumps({"method": _METHOD, "top": top}, indent=2))
        assert top and top[0]["score"] > 0.98, "self-similarity too low"
        print("selftest OK")
