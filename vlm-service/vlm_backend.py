"""Generative VLM backend — one call surface, two implementations.

The Agent 1/2 pipelines in ``main.py`` need a vision-language read ("describe this
garment", "ground these boxes"). Where that read runs depends on the host:

  * local dev / GPU box   -> Ollama + Qwen2.5-VL      ($0/call)          VLM_BACKEND=ollama
  * deployed HF Space CPU -> Gemini 2.0 Flash (REST)  (no GPU needed)    VLM_BACKEND=gemini

Both return a parsed JSON dict for the SAME prompts, so the deterministic CV + calibration
around them (cosine, OCR, metrology) is identical in every environment. This is what lets
the judge-facing URL run the real pipeline without a GPU.
"""
from __future__ import annotations

import base64
import json
import os
import re

import httpx

import ollama_client

VLM_BACKEND = os.getenv("VLM_BACKEND", "ollama").lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
_TIMEOUT = float(os.getenv("VLM_TIMEOUT", "120"))


def _extract_json(text: str) -> dict:
    """Pull the first balanced JSON object out of a response that may wrap it in prose/fences.

    Uses a brace-depth scanner (quote/escape aware) rather than a greedy regex, so trailing prose
    after the object — a common cause of JSONDecodeError on chatty replies — is dropped cleanly.
    """
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start = text.find("{")
    if start != -1:
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            elif ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    text = text[start:i + 1]
                    break
    return json.loads(text)


async def _gemini(prompt: str, images: list[bytes]) -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError("VLM_BACKEND=gemini but GEMINI_API_KEY is unset")
    parts: list[dict] = [{"text": prompt}]
    for img in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(img).decode()}})
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}"
        f":generateContent?key={GEMINI_API_KEY}"
    )
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0, "response_mime_type": "application/json"},
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.post(url, json=body)
        r.raise_for_status()
        data = r.json()
    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return _extract_json(text)


async def run_vlm(prompt: str, images: list[bytes]) -> dict:
    """Dispatch a prompt + images to the configured backend, return parsed JSON."""
    if VLM_BACKEND == "gemini":
        return await _gemini(prompt, images)
    return await ollama_client.run_vlm(prompt, images)


def backend_name() -> str:
    return "gemini" if VLM_BACKEND == "gemini" else "ollama"
