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
    """Agent 1 — Possession-Proof. Substitute the live challenge code."""
    return _PROMPTS["match_prompt"].replace("{{code}}", code)


def measure_prompt(reference_object: str) -> str:
    """Agent 2 — Smart Sizing. Substitute the reference object type."""
    return _PROMPTS["measure_prompt"].replace("{{reference}}", reference_object)
