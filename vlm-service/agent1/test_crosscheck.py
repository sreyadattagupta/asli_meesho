from agent1.crosscheck import cross_check

MATCHES = [
    {"title": "Women Blue Kurta Cotton", "price": 500, "platform": "Flipkart", "source": "Flipkart",
     "currency": "₹", "thumbnail": None, "link": "x", "category": "marketplace"},
    {"title": "Blue Kurta", "price": 520, "platform": "Myntra", "source": "Myntra",
     "currency": "₹", "thumbnail": None, "link": "y", "category": "marketplace"},
]


def test_price_in_line_low_anomaly():
    s = cross_check({"title": "Women Blue Kurta", "price": 510, "brand": None}, MATCHES)
    assert s["price_anomaly"] < 0.2
    assert s["evidence_price_median"] == 510


def test_price_far_below_market_high_anomaly():
    s = cross_check({"title": "Women Blue Kurta", "price": 150, "brand": None}, MATCHES)
    assert s["price_anomaly"] > 0.6  # ~70% below market


def test_title_agreement_high_for_similar_titles():
    s = cross_check({"title": "Women Blue Kurta Cotton", "price": 510, "brand": None}, MATCHES)
    assert s["title_agreement"] > 0.7


def test_no_matches_returns_neutral():
    s = cross_check({"title": "x", "price": 100, "brand": None}, [])
    assert s["price_anomaly"] == 0.0 and s["title_agreement"] == 0.0
