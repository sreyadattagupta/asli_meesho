"""Garment segmentation — isolate the product from a cluttered live photo.

Why this exists (Agent 1, Possession-Proof): a global CLIP embedding of the WHOLE frame folds the
background in with the garment. On a real seller capture the garment is often <50% of the pixels
(the rest is bed, floor, hands), so full-frame similarity between the SAME kurti and a DIFFERENT
dress collapses to a ~0.04 margin — indistinguishable. Measured on the committed real fixtures:

    full-frame CLIP   same 0.74  vs  other 0.70   (margin 0.04 — unusable)
    garment-crop CLIP same 0.81  vs  other 0.63   (margin 0.18 — clean separation)

So we segment the garment first, THEN embed the crop. Segmentation is unsupervised GrabCut
(Rother et al. 2004) seeded with a centre rectangle — no model download, deterministic, CPU-only.
GrabCut can collapse on an already-clean studio shot (garment fills the frame, nothing to cut); we
detect that via the foreground fraction and fall back to the WHOLE image, which is correct there.

Degrades safely: if OpenCV is unavailable the function returns the whole image unchanged, so the
match pipeline still runs (on full frames) rather than crashing.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

# Plausible garment coverage of the frame. Outside this band GrabCut has failed (collapsed to a
# sliver, or selected everything), so the crop is untrustworthy → use the whole image instead.
FG_FRAC_MIN = 0.08
FG_FRAC_MAX = 0.95
# Working resolution for GrabCut — full phone photos are needlessly heavy and can OOM the iteration.
_MAX_SIDE = 800


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


def _encode(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def segment_garment(data: bytes, zero_bg: bool = True) -> dict:
    """Return {bytes, method, fg_frac} — the garment crop or the whole image.

    method: "grabcut" when a plausible garment mask was found and cropped to; "whole" when GrabCut
    collapsed / OpenCV is absent (the image is used unchanged). fg_frac is the foreground fraction
    GrabCut assigned (−1.0 when it could not run) — an explainability signal, never a lone gate.

    zero_bg: True zeroes the background inside the bbox to black — right for CLIP (background-
    sensitive, keys on shape). False keeps the natural pixels inside the bbox — right for DINOv2,
    which is background-robust and whose features degrade on out-of-distribution black-matted inputs
    (measured: zeroing compressed DINOv2 same-instance cosine and produced degenerate embeddings).
    """
    # PRIMARY: SegFormer clothing segmentation (mattmdjaga/segformer_b2_clothes, HF Hub) — isolates the
    # garment from background/skin/props far better than GrabCut. Falls back to GrabCut below if the
    # model is unavailable or found too little garment. Respects zero_bg (DINOv2 wants natural pixels).
    try:
        import clothes_seg
        seg = clothes_seg.garment_crop(data, zero_bg=zero_bg)
        if seg is not None:
            return {"bytes": seg["bytes"], "method": seg["method"], "fg_frac": seg["fg_frac"]}
    except Exception:  # noqa: BLE001 — never let the seam break the classic path
        pass

    img = _open(data)
    img.thumbnail((_MAX_SIDE, _MAX_SIDE))
    try:
        import cv2  # optional — present in the service env; absent → whole-image fallback
    except Exception:  # noqa: BLE001
        return {"bytes": _encode(img), "method": "whole", "fg_frac": -1.0}

    a = np.asarray(img)
    h, w = a.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    # Seed rect: the garment is assumed roughly centred; a 6% inset avoids frame-edge clutter.
    rect = (int(w * 0.06), int(h * 0.06), int(w * 0.88), int(h * 0.88))
    try:
        cv2.grabCut(
            a, mask, rect,
            np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
            5, cv2.GC_INIT_WITH_RECT,
        )
        fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 1, 0).astype(np.uint8)
        frac = float(fg.mean())
    except Exception:  # noqa: BLE001 — GrabCut can throw on degenerate inputs
        return {"bytes": _encode(img), "method": "whole", "fg_frac": -1.0}

    if not (FG_FRAC_MIN <= frac <= FG_FRAC_MAX):
        # Collapsed or selected-everything → the whole image is the better representation.
        return {"bytes": _encode(img), "method": "whole", "fg_frac": round(frac, 3)}

    ys, xs = np.where(fg > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = a[y0:y1, x0:x1]
    if zero_bg:
        crop = crop * fg[y0:y1, x0:x1][:, :, None]  # zero the background inside the bbox (CLIP path)
    return {"bytes": _encode(Image.fromarray(crop)), "method": "grabcut", "fg_frac": round(frac, 3)}


if __name__ == "__main__":  # self-check on the committed real fixtures
    import sys
    from pathlib import Path

    if "--selftest" in sys.argv:
        proof = Path(__file__).resolve().parent / "test_data"
        for name in ("real_kurti_catalog.png", "real_kurti_live.jpg", "real_other_dress.png"):
            p = proof / name
            if p.exists():
                r = segment_garment(p.read_bytes())
                print(f"{name:26s} method={r['method']:8s} fg_frac={r['fg_frac']}")
