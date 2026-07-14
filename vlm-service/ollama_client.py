"""Thin wrapper around the local Ollama HTTP API.

Ollama must be running (`ollama serve`) with the vision model pulled
(`ollama pull qwen2.5vl`). We call /api/generate with base64 images and ask the
model for strict JSON, then parse defensively (strip fences, retry once).
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5vl:latest")
TIMEOUT = float(os.getenv("VLM_TIMEOUT", "120"))
# Force layers onto CPU when GPU VRAM is too small (e.g. 8B vision model on a 4GB
# card). Set OLLAMA_NUM_GPU=0 for full CPU, 99 for full GPU. Unset = let Ollama decide.
_NUM_GPU = os.getenv("OLLAMA_NUM_GPU")
# Keep the model (and its loaded vision projector) resident between calls so a demo doesn't pay
# the cold-load again after an idle gap. "-1" = never unload; "30m" = 30 minutes. Ollama default 5m.
_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m")

def _tiny_jpeg() -> bytes | None:
    """A small valid JPEG to warm the vision projector. Built with Pillow; None if unavailable
    (warm then degrades to a text-only ping — harmless, just a slower first vision call)."""
    try:
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGB", (32, 32), (128, 128, 128)).save(buf, "JPEG")
        return buf.getvalue()
    except Exception:  # noqa: BLE001 — Pillow absent → skip image warm
        return None


_TINY_JPEG = _tiny_jpeg()


def _b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")


def _extract_json(text: str) -> dict:
    """Pull a JSON object out of a model response that may wrap it in prose/fences."""
    text = text.strip()
    # strip ```json ... ``` fences if present
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    else:
        # otherwise grab the first {...} block
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            text = brace.group(0)
    return json.loads(text)


async def _generate(client: httpx.AsyncClient, payload: dict) -> str:
    """POST /api/generate, retrying on transient 5xx (Ollama cold-load races
    return a 500 while the model is still loading). Returns the raw response text.
    """
    last: Exception | None = None
    for attempt in range(3):
        try:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json().get("response", "")
        except httpx.HTTPStatusError as e:
            last = e
            if e.response.status_code < 500:
                raise
            await asyncio.sleep(2 * (attempt + 1))  # back off, let the model load
    assert last is not None
    raise last


async def run_vlm(prompt: str, images: list[bytes]) -> dict:
    """Send prompt + images to Ollama, return parsed JSON dict.

    Resilient to (1) transient 5xx during model cold-load and (2) a first response
    that isn't valid JSON — retried once with a stricter nudge.
    """
    options: dict = {"temperature": 0}
    if _NUM_GPU is not None and _NUM_GPU != "":
        options["num_gpu"] = int(_NUM_GPU)
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "images": [_b64(img) for img in images],
        "stream": False,
        "options": options,
        "keep_alive": _KEEP_ALIVE,
    }

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for attempt in range(2):
            raw = await _generate(client, payload)
            try:
                return _extract_json(raw)
            except (json.JSONDecodeError, ValueError):
                if attempt == 0:
                    payload["prompt"] = (
                        prompt + "\n\nReturn ONLY the JSON object. No other text."
                    )
                    continue
                raise ValueError(
                    f"Model did not return valid JSON. Raw output: {raw[:500]}"
                )


async def warm() -> None:
    """Pre-load the model AND its vision projector so the first real /vlm/match isn't a ~17s
    cold load. Sends a tiny image (not just text) — the vision path is what's slow to warm.
    Best-effort — failures are swallowed (health still reports reachability)."""
    options: dict = {}
    if _NUM_GPU is not None and _NUM_GPU != "":
        options["num_gpu"] = int(_NUM_GPU)
    body: dict = {
        "model": OLLAMA_MODEL,
        "prompt": "ok",
        "stream": False,
        "options": options,
        "keep_alive": _KEEP_ALIVE,
    }
    if _TINY_JPEG is not None:
        body["images"] = [base64.b64encode(_TINY_JPEG).decode()]
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            await client.post(f"{OLLAMA_URL}/api/generate", json=body)
    except httpx.HTTPError:
        pass


async def ping() -> bool:
    """True if Ollama is reachable."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            return r.status_code == 200
    except httpx.HTTPError:
        return False
