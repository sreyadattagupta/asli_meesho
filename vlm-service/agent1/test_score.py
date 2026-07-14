from agent1.score import fuse, band_of


def test_clean_listing_high_trust():
    r = fuse({"brand_consistency": 1.0, "title_agreement": 0.9, "price_anomaly": 0.05,
              "manipulation": 0.02, "aigen": 0.05, "internal_dupe": 0.1})
    assert r["trust_score"] > 0.66 and r["band"] == "high"


def test_price_anomaly_lowers_score_monotonically():
    base = {"brand_consistency": 1.0, "title_agreement": 0.9, "manipulation": 0.0, "aigen": 0.0}
    low = fuse({**base, "price_anomaly": 0.0})["trust_score"]
    high = fuse({**base, "price_anomaly": 0.8})["trust_score"]
    assert high < low


def test_manipulation_lowers_score():
    base = {"brand_consistency": 1.0, "title_agreement": 0.9, "price_anomaly": 0.0}
    assert fuse({**base, "manipulation": 0.9})["trust_score"] < fuse({**base, "manipulation": 0.0})["trust_score"]


def test_score_bounded_and_contributions_present():
    r = fuse({"price_anomaly": 0.5})
    assert 0.0 <= r["trust_score"] <= 1.0
    assert all(0.0 <= c["value"] <= 1.0 for c in r["contributions"])


def test_band_thresholds():
    assert band_of(0.9) == "high" and band_of(0.5) == "medium" and band_of(0.1) == "low"
