"""Single source of truth for VLM prompts.

Both the local Ollama service and the deployed TypeScript Gemini provider load the SAME
templates from ``prompts/vlm-prompts.json`` (repo root) so wording never drifts between them.
Both jobs force STRICT JSON only — no prose, no markdown.
"""

import json
from pathlib import Path

_PROMPTS_PATH = Path(__file__).resolve().parent.parent / "prompts" / "vlm-prompts.json"
with _PROMPTS_PATH.open(encoding="utf-8") as _f:
    _PROMPTS = json.load(_f)


def match_prompt(code: str) -> str:
    """Agent 1 — Possession-Proof (composite/2-image prompt; used by the Gemini provider)."""
    return _PROMPTS["match_prompt"].replace("{{code}}", code)


def describe_catalog_prompt() -> str:
    """Agent 1 (local decomposition) — extract catalog garment attributes from ONE image."""
    return _PROMPTS["describe_catalog_prompt"]


def describe_live_prompt() -> str:
    """Agent 1 (local decomposition) — extract live garment attributes from ONE product image.

    The code is typed and text-verified upstream, so the live photo is product-only (no slip).
    """
    return _PROMPTS["describe_live_prompt"]


def measure_prompt(reference_object: str) -> str:
    """Agent 2 — Smart Sizing (direct-cm prompt; used by the Gemini provider)."""
    return _PROMPTS["measure_prompt"].replace("{{reference}}", reference_object)


def measure_boxes_prompt(reference_object: str) -> str:
    """Agent 2 (local metrology) — bounding boxes for reference + garment; cm computed in Python."""
    return _PROMPTS["measure_boxes_prompt"].replace("{{reference}}", reference_object)


def measure_corners_prompt(reference_object: str) -> str:
    """Agent 2 (homography) — reference 4 corners + garment/chest/waist boxes; cm via DLT in Python."""
    return _PROMPTS["measure_corners_prompt"].replace("{{reference}}", reference_object)


def delivery_prompt(title: str, category: str) -> str:
    """Agent 4 — delivery photo vs frozen catalog + promised attributes."""
    return _PROMPTS["delivery_prompt"].replace("{{title}}", title).replace("{{category}}", category)
