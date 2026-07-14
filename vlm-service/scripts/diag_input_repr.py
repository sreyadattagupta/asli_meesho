"""Diagnostic: which input representation gives DINOv2 the cleanest same-vs-different separation?

Compares three garment representations on the committed fixtures:
  whole        the full frame (background folded in)
  zeroed_crop  GrabCut crop with background zeroed to black (the CLIP-era hack)
  bbox_crop    the GrabCut bounding box, natural pixels kept (no zeroing)

We want same-instance ≫ different-instance AND a sane absolute scale.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image

import dino_embed

D = Path(__file__).resolve().parent.parent / "test_data"
_MAX_SIDE = 800


def _grabcut_bbox(data: bytes, zero_bg: bool) -> bytes:
    import cv2

    img = Image.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((_MAX_SIDE, _MAX_SIDE))
    a = np.asarray(img)
    h, w = a.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (int(w * 0.06), int(h * 0.06), int(w * 0.88), int(h * 0.88))
    cv2.grabCut(a, mask, rect, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                5, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
    frac = float(fg.mean())
    if not (0.08 <= frac <= 0.95):
        return data  # collapsed → whole image
    ys, xs = np.where(fg > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = a[y0:y1, x0:x1].copy()
    if zero_bg:
        crop = crop * fg[y0:y1, x0:x1][:, :, None]
    buf = io.BytesIO()
    Image.fromarray(crop).save(buf, format="PNG")
    return buf.getvalue()


def rep(data: bytes, kind: str) -> bytes:
    if kind == "whole":
        return data
    return _grabcut_bbox(data, zero_bg=(kind == "zeroed_crop"))


def main() -> None:
    if not dino_embed.available():
        print("DINOv2 unavailable:", dino_embed.load_error())
        return
    cat = (D / "real_kurti_catalog.png").read_bytes()
    same = (D / "real_kurti_live.jpg").read_bytes()
    other = (D / "real_other_dress.png").read_bytes()

    for kind in ("whole", "zeroed_crop", "bbox_crop"):
        c, s, o = rep(cat, kind), rep(same, kind), rep(other, kind)
        sim_same = dino_embed.cosine(c, s)
        sim_other = dino_embed.cosine(c, o)
        print(f"{kind:12s}  same={sim_same:.4f}  other={sim_other:.4f}  margin={sim_same - sim_other:+.4f}")


if __name__ == "__main__":
    main()
