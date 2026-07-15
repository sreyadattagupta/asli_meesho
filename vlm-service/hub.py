"""Read-only Hugging Face Hub seam for Agent 2 — deployed-safe (no torch/transformers, no write).

sync_grading() pulls the versioned grading params from the Hub grader repo into models/ (the committed
cache grading.py reads). On any Hub failure or missing token it keeps the existing committed cache, so
the service serves without network or GPU. landmark_endpoint() returns the HF Inference Endpoint URL
for the GPU landmark seam (Task 6), or None on the CPU-only deployed default.
"""
from __future__ import annotations
import os, pathlib, shutil

_HERE = pathlib.Path(__file__).resolve().parent
_MODELS = _HERE / "models"


def sync_grading() -> bool:
    """Refresh models/grading.json + grading_eval.json from the Hub grader repo. Returns True on a
    live sync, False when it kept the committed cache (offline / no repo configured)."""
    repo = os.getenv("HF_GRADER_REPO")
    if not repo:
        return False
    try:
        from huggingface_hub import hf_hub_download
        _MODELS.mkdir(exist_ok=True)
        for name in ("grading.json", "grading_eval.json"):
            p = hf_hub_download(repo_id=repo, filename=name, repo_type="model",
                                revision=os.getenv("HF_GRADER_REVISION", "main"),
                                token=os.getenv("HF_TOKEN"))
            shutil.copyfile(p, _MODELS / name)
        return True
    except Exception:
        return False  # committed cache remains authoritative — deployed demo never hard-fails


def landmark_endpoint() -> str | None:
    return os.getenv("HF_LANDMARK_ENDPOINT") or None
