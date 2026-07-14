"""Component 7 — cross-source verification. Compares the seller listing against retrieved
evidence: price anomaly (vs market median), brand consistency, title agreement. Pure/no-I/O.
"""
from __future__ import annotations

import statistics
from typing import Optional, TypedDict

from rapidfuzz import fuzz


class CrossSignals(TypedDict):
    price_anomaly: float        # 0 in-line … 1 far from market
    brand_consistency: float    # 0 mismatch … 1 consistent (1.0 when no brand claimed)
    title_agreement: float      # 0 … 1 fuzzy token agreement with evidence titles
    evidence_price_median: Optional[float]
    reason: str


def _median_price(matches) -> Optional[float]:
    prices = [m["price"] for m in matches if m.get("price")]
    return statistics.median(prices) if prices else None


def cross_check(listing: dict, matches: list) -> CrossSignals:
    if not matches:
        return CrossSignals(price_anomaly=0.0, brand_consistency=1.0, title_agreement=0.0,
                            evidence_price_median=None, reason="No web evidence to compare.")

    median = _median_price(matches)
    price = listing.get("price")
    if median and price:
        anomaly = min(1.0, abs(price - median) / median)
    else:
        anomaly = 0.0

    titles = [m.get("title") for m in matches if m.get("title")]
    lt = (listing.get("title") or "").strip()
    if titles and lt:
        title_agreement = max(fuzz.token_set_ratio(lt, t) for t in titles) / 100.0
    else:
        title_agreement = 0.0

    brand = (listing.get("brand") or "").strip().lower()
    if not brand:
        brand_consistency = 1.0
    else:
        hay = " ".join((m.get("title") or "") + " " + (m.get("source") or "") for m in matches).lower()
        brand_consistency = 1.0 if brand in hay else fuzz.partial_ratio(brand, hay) / 100.0

    return CrossSignals(
        price_anomaly=round(anomaly, 4),
        brand_consistency=round(brand_consistency, 4),
        title_agreement=round(title_agreement, 4),
        evidence_price_median=median,
        reason=(f"Listing ₹{price} vs market median ₹{median}; "
                f"title agreement {title_agreement:.0%}." if median and price
                else "Partial evidence for cross-check."),
    )
