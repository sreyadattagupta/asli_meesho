"""Dedicated OCR cross-check for the challenge-code slip (Agent 1).

The VLM reads the handwritten code, but a second, purpose-built OCR pass raises recall on
messy handwriting and gives an independent signal (defence in depth). PaddleOCR (PP-OCRv4,
Apache-2.0) is the engine; ``paddlepaddle`` has no cp314 wheel, so on this dev box the import
fails and we report ``available: False`` — the pipeline then relies on the VLM read alone.
On the deployed HF Space (Python 3.11) PaddleOCR is active and fused with the VLM read.

Matching is fuzzy (normalised Levenshtein) so a single mis-read character on a handwritten
slip still counts as a match, while a wrong code does not.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

# ---- lazy, optional PaddleOCR ---------------------------------------------
_engine = None
_AVAILABLE: bool | None = None


def available() -> bool:
    global _engine, _AVAILABLE
    if _AVAILABLE is not None:
        return _AVAILABLE
    try:  # pragma: no cover - depends on local wheels (absent on py3.14)
        from paddleocr import PaddleOCR

        _engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        _AVAILABLE = True
    except Exception:  # noqa: BLE001 - paddleocr/paddlepaddle not installed here
        _engine = None
        _AVAILABLE = False
    return _AVAILABLE


def _norm(s: str) -> str:
    return "".join(ch for ch in str(s or "").upper() if ch.isalnum())


def _levenshtein(a: str, b: str) -> int:
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def match_score(candidate: str, expected: str) -> float:
    """Normalised similarity in [0,1] between an OCR token and the expected code."""
    c, e = _norm(candidate), _norm(expected)
    if not c or not e:
        return 0.0
    return max(0.0, 1.0 - _levenshtein(c, e) / max(len(c), len(e)))


def _texts(image_bytes: bytes) -> list[str]:
    """Run PaddleOCR, return detected text strings (defensive across API versions)."""
    img = np.asarray(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
    out: list[str] = []
    result = _engine.ocr(img)  # type: ignore[union-attr]
    # PaddleOCR shapes vary by version: [[ [box, (text, conf)], ... ]] or dict-like.
    for page in result or []:
        for line in page or []:
            try:
                txt = line[1][0] if isinstance(line[1], (list, tuple)) else line[1]
                if txt:
                    out.append(str(txt))
            except (IndexError, TypeError):
                continue
    return out


def read_code(image_bytes: bytes, expected: str, threshold: float = 0.75) -> dict:
    """Best fuzzy match of any OCR-detected token against the expected code.

    Returns {available, found, text, score, source}. `found` is a match at or above the
    fuzzy threshold; `score` is the best normalised similarity seen.
    """
    if not available():
        return {"available": False, "found": False, "text": "", "score": 0.0, "source": "ocr"}
    best_txt, best = "", 0.0
    try:
        for txt in _texts(image_bytes):
            s = match_score(txt, expected)
            if s > best:
                best_txt, best = txt, s
    except Exception:  # noqa: BLE001 - never let OCR crash the request
        return {"available": True, "found": False, "text": "", "score": 0.0, "source": "ocr"}
    return {
        "available": True,
        "found": best >= threshold,
        "text": best_txt,
        "score": round(best, 3),
        "source": "ocr",
    }
