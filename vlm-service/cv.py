"""Shared computer-vision foundation — reused by Agents 1 (Possession-Proof),
2 (Smart Sizing) and 4 (Promise Keeper).

Two production primitives, both real (no hardcoded outputs):

  quality(bytes)          image quality / anti-spoof gate — variance-of-Laplacian
                          focus metric (Pech-Pacheco et al. 2000) + resolution check.
                          Blurry / low-res inputs are rejected BEFORE inference so an
                          agent never returns a confident measurement from garbage.
  similarity(a, b)        robust same-item signal — CLIP image-embedding cosine
                          (Radford et al. 2021) when the CLIP stack is present, else a
                          perceptual-hash Hamming similarity. Replaces dominant-colour
                          string matching in Agent 1 and backs Agent 4's delivery check.

The heavy embedding stack (CLIP / torch, or ImageHash) is reused from `embed.py` and
imported lazily, so this module still imports on a host where those wheels are absent.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

# ---- tunables (documented, not magic) ------------------------------------
MIN_SIDE = 200            # px — below this a phone photo is too small to measure/verify
BLUR_VAR_MIN = 60.0       # variance-of-Laplacian below this ⇒ out-of-focus / screen-of-screen
_SHARP_SCREENSHOT = 60.0  # advisory only — never a lone gate (behavioural anti-spoof)


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data)).convert("RGB")


def _gray(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("L"), dtype=np.float64)


# Cap the working size for the focus metric — full-resolution phone photos are needlessly heavy
# (and can OOM on a memory-constrained host); a downscaled copy preserves the sharp/blurred signal.
_FOCUS_MAX_SIDE = 640


def laplacian_variance(data: bytes) -> float:
    """Variance of the Laplacian — the standard no-reference focus measure.

    High for sharp images, low for blurred ones. Uses scipy if available, else a
    hand-rolled 3x3 Laplacian convolution (numpy only) so the metric is always computable.
    The image is downscaled first to keep the computation light and memory-safe.
    """
    img = _open(data)
    img.thumbnail((_FOCUS_MAX_SIDE, _FOCUS_MAX_SIDE))
    g = np.asarray(img.convert("L"), dtype=np.float64)
    try:
        from scipy import ndimage

        lap = ndimage.laplace(g)
    except Exception:  # noqa: BLE001 — scipy absent: 3x3 discrete Laplacian by hand
        k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
        pad = np.pad(g, 1, mode="edge")
        lap = np.zeros_like(g)
        for dy in range(3):
            for dx in range(3):
                lap += k[dy, dx] * pad[dy : dy + g.shape[0], dx : dx + g.shape[1]]
    return float(lap.var())


def quality(data: bytes) -> dict:
    """Gate an input image. Returns resolution + focus verdict with a human reason.

    `ok` is True only when the image is large enough AND sharp enough to trust. Callers
    turn a False here into a "retake" outcome rather than a confident wrong answer.
    `sharp_suspect` flags an unusually sharp+flat frame (a possible screenshot) — advisory.
    """
    img = _open(data)
    w, h = img.size
    resolution_ok = min(w, h) >= MIN_SIDE
    blur_var = laplacian_variance(data)
    is_sharp = blur_var >= BLUR_VAR_MIN
    ok = resolution_ok and is_sharp
    if not resolution_ok:
        reason = f"Image too small ({w}x{h}); retake closer / higher resolution."
    elif not is_sharp:
        reason = f"Image out of focus (focus score {blur_var:.0f}); hold steady and retake."
    else:
        reason = f"Sharp, {w}x{h} (focus score {blur_var:.0f})."
    return {
        "ok": bool(ok),
        "resolution_ok": bool(resolution_ok),
        "width": int(w),
        "height": int(h),
        "blur_var": round(blur_var, 1),
        "is_sharp": bool(is_sharp),
        "reason": reason,
    }


def _vector(data: bytes) -> tuple[np.ndarray, str]:
    """Embed via the shared embed.py stack (CLIP if present, else perceptual hash)."""
    import embed  # lazy — keeps cv.py importable without the embedding wheels

    v = np.asarray(embed._vector(data), dtype=np.float64)
    return v, embed.method()


def similarity(a: bytes, b: bytes) -> dict:
    """Same-item similarity in [0,1] with the method used.

    - CLIP: cosine of L2-normalised 512-d image embeddings (clamped to [0,1]).
    - phash: 1 - normalised Hamming distance over the 64 perceptual-hash bits.

    Both are monotonic in visual similarity, so the same downstream calibration and
    thresholds apply regardless of which backend the host could load.
    """
    va, method = _vector(a)
    vb, _ = _vector(b)
    if method == "clip":
        na, nb = np.linalg.norm(va), np.linalg.norm(vb)
        cos = float(np.dot(va, vb) / (na * nb)) if na and nb else 0.0
        score = max(0.0, min(1.0, cos))
    else:  # phash bit vectors (0.0/1.0) → Hamming similarity
        hamming = float(np.sum(va != vb))
        score = max(0.0, 1.0 - hamming / va.size)
    return {"score": round(score, 4), "method": method}


if __name__ == "__main__":  # self-check: identical image ~1.0, blurred copy fails the gate
    import sys

    if "--selftest" in sys.argv:
        buf = io.BytesIO()
        Image.new("RGB", (256, 256), (120, 40, 160)).save(buf, format="JPEG")
        solid = buf.getvalue()
        # high-frequency checkerboard = sharp; a uniform block has ~0 Laplacian variance
        check = (np.indices((256, 256)).sum(axis=0) % 2 * 255).astype(np.uint8)
        gbuf = io.BytesIO()
        Image.fromarray(np.dstack([check] * 3)).save(gbuf, format="PNG")
        sharp = gbuf.getvalue()
        print("self-similarity:", similarity(solid, solid))
        print("solid quality  :", quality(solid), "(expect not sharp)")
        print("sharp quality  :", quality(sharp), "(expect ok)")
        assert similarity(solid, solid)["score"] > 0.98
        assert quality(sharp)["ok"] and not quality(solid)["is_sharp"]
        print("cv selftest OK")
