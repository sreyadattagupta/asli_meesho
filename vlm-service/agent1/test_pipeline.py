import asyncio

from agent1.pipeline import verify


class FakeEmbed:
    def similar(self, data, top_k=5):
        return [{"score": 0.3, "image_hash": "h", "payload": {"title": "x", "url": "u"}}]

    def method(self):
        return "clip"


async def fake_reverse_ok(image, api_key):
    return {"available": True, "triggered": True, "match_count": 1,
            "matches": [{"title": "Blue Kurta", "price": 500, "currency": "₹", "thumbnail": None,
                         "source": "Flipkart", "link": "x", "platform": "Flipkart",
                         "category": "marketplace"}],
            "platforms": [{"name": "Flipkart", "category": "marketplace", "count": 1, "url": "x"}],
            "reason": "1 match"}


async def fake_reverse_down(image, api_key):
    raise RuntimeError("SerpAPI 429")


def test_verify_produces_trust_score_and_evidence():
    r = asyncio.run(verify(b"img", {"title": "Blue Kurta", "price": 490, "brand": None},
                           api_key="k", embed_mod=FakeEmbed(), reverse_fn=fake_reverse_ok))
    assert 0.0 <= r["trust_score"] <= 1.0
    assert r["triggered"] and len(r["evidence"]) == 1
    assert "price_anomaly" in r["signals"]


def test_verify_degrades_when_reverse_down():
    r = asyncio.run(verify(b"img", {"title": "Blue Kurta", "price": 490, "brand": None},
                           api_key="k", embed_mod=FakeEmbed(), reverse_fn=fake_reverse_down))
    assert r["degraded"] is True            # reverse stage failed
    assert r["evidence"] == []               # no fabricated evidence
    assert 0.0 <= r["trust_score"] <= 1.0    # still scores on internal signals
