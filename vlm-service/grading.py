"""Grade a full size chart from ONE measured garment + its seller-declared true size.

Given the fitted per-size-step slopes (training/fit_grading.py, hosted on the HF Hub) we anchor at the
declared size and add/subtract the slope for every other size. The measured garment IS the anchor row
(returned verbatim), so the chart is generated from real geometry, not a fixed table. Categories
without a slope for a dimension (e.g. sleeve on bottoms) omit it. Params come from the Hub-synced
committed cache (models/grading.json via hub.sync_grading()); best-effort refresh on import, but the
committed cache is authoritative so this stays pure + deploy-safe with no runtime Hub dependency.
"""
from __future__ import annotations
import json, pathlib

import hub

_HERE = pathlib.Path(__file__).parent
hub.sync_grading()  # best-effort Hub refresh; no-op/fallback to committed cache when offline
_PARAMS = json.loads((_HERE / "models" / "grading.json").read_text())
_ORD = {s: i for i, s in enumerate(_PARAMS["sizes"])}


def grade_chart(category: str, declared_size: str, measured: dict[str, float]) -> dict:
    cat = _PARAMS["categories"].get(category) or _PARAMS["categories"].get("top")
    dims = cat["dims"]
    d_ord = _ORD.get(declared_size)
    if d_ord is None:
        raise ValueError(f"unknown size {declared_size!r}")
    sizes = []
    for size, ord_ in _ORD.items():
        row = {"size": size}
        for d, p in dims.items():
            base = measured.get(d)
            if base is None:
                continue
            row[d] = round(base + p["slope"] * (ord_ - d_ord), 1)
        sizes.append(row)
    return {"sizes": sizes, "anchored_on": declared_size, "sized_by": cat["sized_by"]}
