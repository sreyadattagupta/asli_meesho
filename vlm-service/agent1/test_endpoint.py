import io

from fastapi.testclient import TestClient
from PIL import Image

import main


def _png() -> bytes:
    b = io.BytesIO()
    Image.new("RGB", (300, 300), (120, 40, 160)).save(b, "PNG")
    return b.getvalue()


def test_verify_endpoint_returns_result(monkeypatch):
    async def fake_verify(image, listing, *, api_key, **kw):
        return {"triggered": False, "trust_score": 0.7, "band": "high", "signals": {},
                "evidence": [], "platforms": [], "explanation": "ok", "degraded": False}

    monkeypatch.setattr(main, "agent1_verify", fake_verify)
    c = TestClient(main.app)
    r = c.post("/agent1/verify", files={"image": ("c.png", _png(), "image/png")},
               data={"title": "Blue Kurta", "price": "490"})
    assert r.status_code == 200
    assert r.json()["band"] == "high"
