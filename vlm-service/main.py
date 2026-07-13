"""Asli Meesho — own VLM API.

Self-hosted FastAPI wrapper over a local Ollama vision model (Qwen2.5-VL).
Zero per-call cost. Two endpoints:

  POST /vlm/match    Agent 1 — possession proof (catalog vs live photo + code)
  POST /vlm/measure  Agent 2 — garment measurement (flat-lay + reference object)

Run:
  ollama serve
  uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import compose  # noqa: F401 — kept for the composite reference; local match now decomposes
import ollama_client
import prompts


def _norm(value) -> str:
    """Lowercase alphanumeric only — robust color/code comparison."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _box(value):
    """Coerce a model-returned box into [x1, y1, x2, y2] floats, or None.

    Qwen may nest a single box as [[x1,y1,x2,y2]]; unwrap that. Coordinates are in the model's own
    scaled space, which is fine — metrology uses the reference/garment RATIO, not absolute pixels.
    """
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], list):
        value = value[0]
    if isinstance(value, list) and len(value) >= 4:
        try:
            x1, y1, x2, y2 = (float(value[i]) for i in range(4))
            return [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]
        except (TypeError, ValueError):
            return None
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load the model in the background so the first real /vlm call is warm
    # (avoids the cold-load 500). Non-blocking — the server accepts traffic now.
    asyncio.create_task(ollama_client.warm())
    yield


app = FastAPI(title="Asli Meesho VLM Service", version="0.1.0", lifespan=lifespan)

# allow the Next.js dev server to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 10 * 1024 * 1024  # 10 MB per image


async def _read(upload: UploadFile, field: str) -> bytes:
    if upload.content_type and not upload.content_type.startswith("image/"):
        raise HTTPException(400, f"{field} must be an image, got {upload.content_type}")
    data = await upload.read()
    if not data:
        raise HTTPException(400, f"{field} is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"{field} exceeds 10 MB")
    return data


@app.get("/health")
async def health():
    ok = await ollama_client.ping()
    return {
        "status": "ok" if ok else "degraded",
        "ollama_reachable": ok,
        "model": ollama_client.OLLAMA_MODEL,
    }


@app.post("/vlm/match")
async def vlm_match(
    catalog: UploadFile = File(..., description="Seller's catalog/listing photo"),
    live: UploadFile = File(..., description="Live camera photo of product + code slip"),
    code: str = Form(..., description="Expected dynamic challenge code"),
):
    """Agent 1 — Possession-Proof. Returns same_item / code_visible / confidence / reason.

    Decomposed for reliability on small local models: extract garment attributes from EACH image
    separately (single-image reads are accurate), then compare deterministically. Cross-image
    reasoning in one shot is unreliable on a 3B VLM; the Gemini provider uses the composite prompt.
    """
    catalog_bytes = await _read(catalog, "catalog")
    live_bytes = await _read(live, "live")

    try:
        cat = await ollama_client.run_vlm(prompts.describe_catalog_prompt(), images=[catalog_bytes])
        liv = await ollama_client.run_vlm(prompts.describe_live_prompt(code), images=[live_bytes])
    except Exception as e:  # noqa: BLE001 — surface model/Ollama errors to caller
        raise HTTPException(502, f"VLM error: {e}") from e

    cat_color, liv_color = _norm(cat.get("color")), _norm(liv.get("color"))
    # Same item if the dominant colors match (substring-tolerant: "blue" ⊂ "darkblue").
    same_item = bool(cat_color) and bool(liv_color) and (
        cat_color == liv_color or cat_color in liv_color or liv_color in cat_color
    )
    code_visible = bool(_norm(code)) and _norm(liv.get("code")) == _norm(code)
    passed = same_item and code_visible

    if passed:
        confidence = 0.9
    elif same_item and not code_visible:
        confidence = 0.5   # right item, code unclear → re-challenge territory
    elif not same_item and code_visible:
        confidence = 0.3   # wrong item, right code → possession not proven
    else:
        confidence = 0.2

    reason = (
        f"Catalog: {cat.get('color', '?')} {cat.get('type', '')}. "
        f"Live: {liv.get('color', '?')} {liv.get('type', '')}, slip reads '{liv.get('code', '')}'. "
        f"same_item={same_item}, code_visible={code_visible}."
    ).strip()

    return {
        "same_item": same_item,
        "code_visible": code_visible,
        "confidence": confidence,
        "reason": reason,
        "passed": passed,
    }


@app.post("/vlm/measure")
async def vlm_measure(
    flatlay: UploadFile = File(..., description="Garment laid flat with reference object"),
    reference_object: str = Form("a4", description="'a4' or 'tape'"),
):
    """Agent 2 — Smart Sizing. Returns chest_cm / length_cm / waist_cm.

    Single-view metrology (Criminisi et al.): the model grounds pixel bounding boxes for the reference
    object and the garment; we calibrate pixels→cm from the reference and measure in Python. Small VLMs
    reliably ground boxes but cannot do the arithmetic — so the math lives here, not in the prompt.
    """
    flatlay_bytes = await _read(flatlay, "flatlay")

    try:
        boxes = await ollama_client.run_vlm(
            prompts.measure_boxes_prompt(reference_object),
            images=[flatlay_bytes],
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"VLM error: {e}") from e

    ref = _box(boxes.get("reference") or boxes.get("a4_sheet") or boxes.get("a4"))
    garment = _box(boxes.get("garment"))
    chest = _box(boxes.get("chest")) or garment

    # Reference real-world size (cm). A4 = 21.0 × 29.7; default to A4 if unknown.
    ref_short, ref_long = (21.0, 29.7)

    if ref and garment:
        rw, rh = ref[2] - ref[0], ref[3] - ref[1]
        box_short, box_long = min(rw, rh), max(rw, rh)
        # Orientation-agnostic scale (cm per pixel-unit), averaged over both reference sides.
        scale = ((ref_short / box_short) + (ref_long / box_long)) / 2 if box_short and box_long else 0
        chest_cm = round((chest[2] - chest[0]) * scale, 1)
        length_cm = round((garment[3] - garment[1]) * scale, 1)
        waist_cm = round(chest_cm * 0.92, 1)  # flat waist estimated from chest span
        confidence = 0.8
    else:
        # Grounding failed — return a labelled low-confidence fallback rather than crashing.
        chest_cm, length_cm, waist_cm, confidence = 0.0, 0.0, 0.0, 0.2

    return {
        "chest_cm": chest_cm,
        "length_cm": length_cm,
        "waist_cm": waist_cm,
        "reference_used": reference_object,
        "confidence": confidence,
    }


@app.post("/vlm/embed")
async def vlm_embed(image: UploadFile = File(..., description="Image to embed")):
    """Embedding for the Qdrant TRIGGER source — CLIP vector or perceptual-hash bits."""
    data = await _read(image, "image")
    try:
        import embed  # imported lazily so /match /measure work even if the embed stack is absent
        return embed.embed_vector(data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"embed unavailable: {e}") from e


@app.post("/vlm/similar")
async def vlm_similar(
    image: UploadFile = File(..., description="Query image"),
    top_k: int = Form(5),
):
    """Similarity search over the local Qdrant catalog. TRIGGER only (invariant #1)."""
    data = await _read(image, "image")
    try:
        import embed
        return {"matches": embed.similar(data, top_k=top_k), "method": embed.method()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"similar unavailable: {e}") from e
