"""WS4 — Agent 4 /vlm/verify_delivery fusion (deterministic parts, no live model)."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import main
import vlm_backend

client = TestClient(main.app)
PROOF = Path(__file__).resolve().parents[1] / "web" / "public" / "proof"


def _stub(same_product: bool, category: str):
    async def fake(prompt: str, images: list[bytes]) -> dict:
        return {"same_product": same_product, "observed": {"category": category, "count": 1}}
    return fake


def _post(delivery: bytes, catalog: bytes, category: str = "saree"):
    return client.post(
        "/vlm/verify_delivery",
        files={"delivery": ("d.jpg", delivery, "image/jpeg"), "catalog": ("c.jpg", catalog, "image/jpeg")},
        data={"title": "Test", "category": category},
    )


@pytest.mark.skipif(not PROOF.exists(), reason="proof fixtures not present")
def test_identical_delivery_is_kept(monkeypatch):
    monkeypatch.setattr(vlm_backend, "run_vlm", _stub(True, "saree"))
    cat = (PROOF / "catalog_real.jpg").read_bytes()
    b = _post(cat, cat).json()
    assert b["same_product"] is True
    assert b["cosine"] > 0.95
    assert 0.0 <= b["confidence"] <= 1.0


@pytest.mark.skipif(not PROOF.exists(), reason="proof fixtures not present")
def test_different_item_not_same_product(monkeypatch):
    monkeypatch.setattr(vlm_backend, "run_vlm", _stub(False, "shoe"))
    cat = (PROOF / "catalog_real.jpg").read_bytes()
    other = (PROOF / "live_otheritem.jpg").read_bytes()
    b = _post(other, cat, category="saree").json()
    # phash backend defers same-product to the VLM stub (False here); confidence stays bounded.
    assert b["same_product"] is False
    assert b["confidence"] < b["cosine"] + 1.0
