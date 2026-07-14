import io

import numpy as np
from PIL import Image

from agent1.forensics import ela_score, noise_inconsistency, manipulation_score, aigen_score


def _img(color=(120, 40, 160), size=(256, 256), fmt="PNG") -> bytes:
    b = io.BytesIO()
    Image.new("RGB", size, color).save(b, fmt)
    return b.getvalue()


def _noisy() -> bytes:
    rng = np.random.default_rng(0)
    arr = rng.integers(0, 255, (256, 256, 3), dtype=np.uint8)
    b = io.BytesIO()
    Image.fromarray(arr).save(b, "PNG")
    return b.getvalue()


def test_ela_bounded():
    s = ela_score(_img())
    assert 0.0 <= s <= 1.0


def test_noise_bounded():
    assert 0.0 <= noise_inconsistency(_img()) <= 1.0
    assert 0.0 <= noise_inconsistency(_noisy()) <= 1.0


def test_manipulation_score_bounded():
    assert 0.0 <= manipulation_score(_img()) <= 1.0


def test_flat_image_low_noise():
    # a uniform block has near-zero noise-variance spread
    assert noise_inconsistency(_img()) < 0.5


def test_aigen_bounded_and_degrades_without_model():
    r = aigen_score(_img())
    assert isinstance(r["available"], bool)
    assert 0.0 <= r["score"] <= 1.0
    # transformers/torch absent on this box → unavailable, score 0.0 (no fabricated signal)
    if not r["available"]:
        assert r["score"] == 0.0
