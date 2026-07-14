"""WS1 — Agent 1 /vlm/match same-instance logic on REAL garment fixtures (no live model).

The challenge code is TYPED by the seller and text-verified upstream (single-use claim in the web
route); the live photo is product-only. So this endpoint proves possession from the product alone —
a non-empty `code` arriving here is already confirmed. The generative VLM attribute read is stubbed
so this runs in CI; the quality gate, segmentation, real crop-CLIP cosine, deterministic colour gate,
and calibrated confidence are exercised for real against the committed real photos:

    real_kurti_catalog.png  — black kurti, pink floral embroidery (catalog studio shot)
    real_kurti_live.jpg     — the SAME kurti, re-photographed on a bedsheet (should PASS)
    real_other_dress.png    — a DIFFERENT (pink lace) dress (should REJECT)

Asserts the genuine / different-item / reused-image / no-code / blur branches diverge and confidence
stays continuous. Synthetic solid-colour shapes are intentionally NOT used — they don't represent the
deformable, cluttered, real captures the model must actually separate.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageFilter

import main
import vlm_backend

client = TestClient(main.app)
PROOF = Path(__file__).resolve().parents[1] / "web" / "public" / "proof"
CODE = "9M2P"


def _stub(catalog_attrs: dict, live_attrs: dict):
    calls = {"n": 0}

    async def fake(prompt: str, images: list[bytes]) -> dict:
        calls["n"] += 1
        return dict(catalog_attrs) if calls["n"] == 1 else dict(live_attrs)

    return fake


def _post(catalog: bytes, live: bytes, code: str = CODE):
    return client.post(
        "/vlm/match",
        files={"catalog": ("c.jpg", catalog, "image/jpeg"), "live": ("l.jpg", live, "image/jpeg")},
        data={"code": code},
    )


def _read(name: str) -> bytes:
    return (PROOF / name).read_bytes()


CATALOG = "real_kurti_catalog.png"
LIVE_SAME = "real_kurti_live.jpg"
LIVE_OTHER = "real_other_dress.png"
_HAVE_FIXTURES = (PROOF / CATALOG).exists() and (PROOF / LIVE_SAME).exists()


@pytest.mark.skipif(not _HAVE_FIXTURES, reason="real proof fixtures not present")
def test_genuine_same_kurti_passes(monkeypatch):
    # Same physical kurti, a distinct live capture, today's code entered → PASS. The VLM colour/type
    # read (stubbed to agree) reinforces the crop-CLIP cosine in the ambiguous band.
    monkeypatch.setattr(vlm_backend, "run_vlm",
                        _stub({"color": "black", "type": "kurti"},
                              {"color": "black", "type": "kurti"}))
    b = _post(_read(CATALOG), _read(LIVE_SAME)).json()
    assert b["same_item"] and b["code_visible"] and b["passed"]
    assert b["confidence"] > 0.7
    assert 0.0 <= b["confidence"] <= 1.0
    assert b["signals"]["quality_ok"] and not b["signals"]["reuse_suspect"]


@pytest.mark.skipif(not _HAVE_FIXTURES, reason="real proof fixtures not present")
def test_different_dress_rejected(monkeypatch):
    # A completely different dress — the crop-CLIP cosine is well below the pass floor, so it is
    # rejected without even needing the VLM read. This is the "accepts any dress" regression guard.
    monkeypatch.setattr(vlm_backend, "run_vlm",
                        _stub({"color": "black", "type": "kurti"},
                              {"color": "pink", "type": "gown"}))
    b = _post(_read(CATALOG), _read(LIVE_OTHER)).json()
    assert not b["same_item"] and not b["passed"]
    assert b["confidence"] <= 0.45


@pytest.mark.skipif(not _HAVE_FIXTURES, reason="real proof fixtures not present")
def test_reused_catalog_image_rejected(monkeypatch):
    # Uploading the catalog image itself as the "live" capture is a reused image, not possession —
    # flagged reuse_suspect and blocked even though it is trivially the "same item".
    monkeypatch.setattr(vlm_backend, "run_vlm",
                        _stub({"color": "black", "type": "kurti"},
                              {"color": "black", "type": "kurti"}))
    b = _post(_read(CATALOG), _read(CATALOG)).json()
    assert b["signals"]["reuse_suspect"] and not b["passed"]


@pytest.mark.skipif(not _HAVE_FIXTURES, reason="real proof fixtures not present")
def test_no_code_fails_code_gate(monkeypatch):
    # A wrong TYPED code never reaches this endpoint (single-use claim rejects it upstream); an empty
    # code means "not confirmed" → the code gate fails and confidence is pulled down continuously.
    monkeypatch.setattr(vlm_backend, "run_vlm",
                        _stub({"color": "black", "type": "kurti"},
                              {"color": "black", "type": "kurti"}))
    b = _post(_read(CATALOG), _read(LIVE_SAME), code="").json()
    assert not b["code_visible"] and not b["passed"]
    assert b["confidence"] < 0.7


def test_blurred_capture_rejected_before_inference(monkeypatch):
    # If the quality gate works, the VLM must never run on a rejected capture.
    def boom(*a, **k):
        raise AssertionError("VLM should not run on a rejected capture")

    monkeypatch.setattr(vlm_backend, "run_vlm", boom)
    sharp = Image.fromarray(
        np.dstack([(np.indices((300, 300)).sum(axis=0) % 2 * 255).astype(np.uint8)] * 3)
    )
    blurred = sharp.filter(ImageFilter.GaussianBlur(radius=8))
    buf = io.BytesIO(); blurred.save(buf, format="JPEG")
    cbuf = io.BytesIO(); sharp.save(cbuf, format="JPEG")
    b = _post(cbuf.getvalue(), buf.getvalue()).json()
    assert not b["passed"] and "rejected" in b["reason"].lower()
