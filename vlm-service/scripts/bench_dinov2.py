"""Quick empirical benchmark: DINOv2 same-vs-different margin on the committed fixtures.

Compares whole-frame vs segmented-crop inputs (the real Agent-1 path segments first). A trustworthy
same-instance backbone must give: self-sim ≈ 1.0, and same-item clearly above different-item.
"""
from __future__ import annotations

from pathlib import Path

import dino_embed
import segment

D = Path(__file__).resolve().parent.parent / "test_data"


def load(name: str) -> bytes:
    return (D / name).read_bytes()


def main() -> None:
    if not dino_embed.available():
        print("DINOv2 unavailable:", dino_embed.load_error())
        return

    cat = load("real_kurti_catalog.png")
    same = load("real_kurti_live.jpg")
    other = load("real_other_dress.png")

    print(f"self-similarity (cat vs cat): {dino_embed.cosine(cat, cat):.4f}  (expect ~1.0)\n")

    print("WHOLE FRAME:")
    ws, wo = dino_embed.cosine(cat, same), dino_embed.cosine(cat, other)
    print(f"  same-kurti  {ws:.4f}")
    print(f"  other-dress {wo:.4f}")
    print(f"  margin      {ws - wo:+.4f}\n")

    sc, ss, so = (segment.segment_garment(b) for b in (cat, same, other))
    print(f"SEGMENTED CROP (methods: cat={sc['method']} same={ss['method']} other={so['method']}):")
    cs, co = (
        dino_embed.cosine(sc["bytes"], ss["bytes"]),
        dino_embed.cosine(sc["bytes"], so["bytes"]),
    )
    print(f"  same-kurti  {cs:.4f}")
    print(f"  other-dress {co:.4f}")
    print(f"  margin      {cs - co:+.4f}")


if __name__ == "__main__":
    main()
