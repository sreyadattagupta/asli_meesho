"""Stitch two images into ONE labeled side-by-side composite.

Sending a single CATALOG | LIVE image (with banners + a divider) is far more
reliable than passing two separate images to the VLM — the model reasons about
"left vs right halves of one picture" instead of juggling image ordering.
"""
from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageFont

PANEL_W = 640
PANEL_H = 640
BANNER_H = 56
DIVIDER = 6

_CATALOG = (139, 92, 246)   # violet #8B5CF6
_LIVE = (236, 72, 153)      # pink   #EC4899
_BLACK = (0, 0, 0)
_WHITE = (255, 255, 255)


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("arialbd.ttf", "arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _panel(image_bytes: bytes, label: str, color: tuple[int, int, int]) -> Image.Image:
    src = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    # letterbox the source into the panel body, preserving aspect ratio
    body_h = PANEL_H - BANNER_H
    src.thumbnail((PANEL_W, body_h))
    panel = Image.new("RGB", (PANEL_W, PANEL_H), _WHITE)
    ox = (PANEL_W - src.width) // 2
    oy = BANNER_H + (body_h - src.height) // 2
    panel.paste(src, (ox, oy))

    draw = ImageDraw.Draw(panel)
    draw.rectangle([0, 0, PANEL_W, BANNER_H], fill=color)
    font = _font(30)
    tw = draw.textlength(label, font=font)
    draw.text(((PANEL_W - tw) / 2, (BANNER_H - 30) / 2), label, fill=_WHITE, font=font)
    return panel


def side_by_side(catalog_bytes: bytes, live_bytes: bytes) -> bytes:
    """Return JPEG bytes: [CATALOG panel] | black divider | [LIVE panel]."""
    left = _panel(catalog_bytes, "CATALOG", _CATALOG)
    right = _panel(live_bytes, "LIVE PHOTO", _LIVE)

    w = PANEL_W * 2 + DIVIDER
    canvas = Image.new("RGB", (w, PANEL_H), _BLACK)
    canvas.paste(left, (0, 0))
    canvas.paste(right, (PANEL_W + DIVIDER, 0))

    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=90)
    return out.getvalue()
