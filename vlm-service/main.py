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
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import compose
import ollama_client
import prompts


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
    """Agent 1 — Possession-Proof. Returns same_item / code_visible / confidence / reason."""
    catalog_bytes = await _read(catalog, "catalog")
    live_bytes = await _read(live, "live")
    # stitch into one labeled CATALOG | LIVE image — reliable vs multi-image input
    composite = compose.side_by_side(catalog_bytes, live_bytes)

    try:
        result = await ollama_client.run_vlm(
            prompts.match_prompt(code),
            images=[composite],
        )
    except Exception as e:  # noqa: BLE001 — surface model/Ollama errors to caller
        raise HTTPException(502, f"VLM error: {e}") from e

    # decide pass/fail here so the web layer stays dumb
    result["passed"] = bool(result.get("same_item")) and bool(result.get("code_visible"))
    return result


@app.post("/vlm/measure")
async def vlm_measure(
    flatlay: UploadFile = File(..., description="Garment laid flat with reference object"),
    reference_object: str = Form("a4", description="'a4' or 'tape'"),
):
    """Agent 2 — Smart Sizing. Returns chest_cm / length_cm / waist_cm."""
    flatlay_bytes = await _read(flatlay, "flatlay")

    try:
        result = await ollama_client.run_vlm(
            prompts.measure_prompt(reference_object),
            images=[flatlay_bytes],
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"VLM error: {e}") from e

    return result


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
