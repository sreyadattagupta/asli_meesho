"""Index the demo catalog images into Qdrant local mode so the qdrant TRIGGER source has data.

Run once (with uvicorn stopped — local mode is single-process):
    python index_catalog.py
"""
from __future__ import annotations

from pathlib import Path

import embed

# Marketplace-style titles for the seeded mock catalog under web/public/mock/.
_CATALOG = {
    "sarees-1.svg": "Banarasi Silk Saree — Magenta Zari",
    "sarees-2.svg": "Kanjivaram-style Festive Saree",
    "kurtis-1.svg": "Anarkali Kurti — Violet Block Print",
    "kurtis-2.svg": "Straight Cotton Kurti — Rose",
    "jewellery-1.svg": "Kundan Necklace Set — Bridal",
    "jewellery-2.svg": "Oxidised Jhumkas — Peacock",
    "footwear-1.svg": "Ethnic Juttis — Gold Thread",
    "footwear-2.svg": "Casual Sandals — Tan Strap",
}

_MOCK_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "mock"


def main() -> None:
    indexed = 0
    for name, title in _CATALOG.items():
        path = _MOCK_DIR / name
        if not path.exists():
            print(f"skip (missing): {name}")
            continue
        try:
            # Pillow rasterizes JPEG/PNG/WebP; SVG placeholders are skipped (need a raster catalog).
            embed.index_image(path.read_bytes(), {"title": title, "url": f"/mock/{name}"})
        except Exception as e:  # noqa: BLE001 - skip anything Pillow can't decode
            print(f"skip (unreadable {type(e).__name__}): {name}")
            continue
        indexed += 1
        print(f"indexed [{embed.method()}]: {title}")
    print(f"done — {indexed} images in the '{embed.method()}' catalog index.")
    if indexed == 0:
        print("note: no raster catalog images found — the qdrant trigger will yield no matches "
              "and TriggerSource falls through to the labelled mock (invariant #1 preserved).")


if __name__ == "__main__":
    main()
