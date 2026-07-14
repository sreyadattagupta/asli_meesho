from agent1.reverse import parse_lens, classify_platform

SAMPLE = [
    {"link": "https://www.flipkart.com/p/itm1", "source": "Flipkart",
     "title": "Women Kurta Blue", "price": {"value": "₹499", "extracted_value": 499, "currency": "₹"},
     "thumbnail": "https://t.example/1.jpg"},
    {"link": "https://x-supplier.example/p/9", "source": "x-supplier.example",
     "title": "Blue Kurta", "thumbnail": "https://t.example/2.jpg"},
]


def test_parse_extracts_full_evidence():
    r = parse_lens(SAMPLE)
    assert r["available"] and r["triggered"] and r["match_count"] == 2
    m0 = r["matches"][0]
    assert m0["title"] == "Women Kurta Blue"
    assert m0["price"] == 499 and m0["currency"] == "₹"
    assert m0["thumbnail"] == "https://t.example/1.jpg"
    assert m0["platform"] == "Flipkart" and m0["category"] == "marketplace"


def test_parse_handles_missing_price_and_unknown_platform():
    r = parse_lens(SAMPLE)
    m1 = r["matches"][1]
    assert m1["price"] is None
    assert m1["category"] == "web"


def test_empty_matches_not_triggered():
    r = parse_lens([])
    assert r["available"] and not r["triggered"] and r["match_count"] == 0


def test_classify_known_marketplace():
    assert classify_platform("https://www.myntra.com/x", None) == ("Myntra", "marketplace")
