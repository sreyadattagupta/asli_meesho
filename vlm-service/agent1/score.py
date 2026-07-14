"""Component 9 — explainable trust score. Deterministic calibrated fusion (Platt-style logistic)
of the pipeline's signals into a score + band + per-signal contributions. NEVER emitted by the LLM.

Positive signals raise trust; risk signals (price_anomaly, manipulation, aigen, internal_dupe,
reverse_reuse) lower it. reverse_reuse is evidence only — small weight; it never drops the band
alone (invariant #1). Weights are documented priors, tunable, not magic branch constants.
"""
from __future__ import annotations

import math
from typing import TypedDict

# (signal, weight, is_risk, label). Positive weight raises trust when the signal is high;
# risk signals are inverted (1 - value) before weighting.
_WEIGHTS = [
    ("brand_consistency", 0.22, False, "Brand consistent with market"),
    ("title_agreement",   0.18, False, "Title matches similar listings"),
    ("price_anomaly",     0.20, True,  "Price vs market"),
    ("manipulation",      0.18, True,  "Image manipulation risk"),
    ("aigen",             0.12, True,  "AI-generated image risk"),
    ("internal_dupe",     0.06, True,  "Duplicate of an existing listing"),
    ("reverse_reuse",     0.04, True,  "Image reused across the web (evidence)"),
]

HIGH, MEDIUM = 0.66, 0.33


class Contribution(TypedDict):
    name: str
    value: float
    weight: float
    contribution: float
    reason: str


class TrustResult(TypedDict):
    trust_score: float
    band: str
    contributions: list[Contribution]
    explanation: str


def band_of(score: float) -> str:
    return "high" if score >= HIGH else "medium" if score >= MEDIUM else "low"


def fuse(signals: dict) -> TrustResult:
    z = 0.0
    contribs: list[Contribution] = []
    for name, weight, is_risk, label in _WEIGHTS:
        if name not in signals:
            continue
        v = max(0.0, min(1.0, float(signals[name])))
        effective = (1.0 - v) if is_risk else v      # risk high ⇒ trust low
        term = weight * (effective - 0.5) * 4.0       # center at 0.5, scale into logit space
        z += term
        contribs.append(Contribution(name=name, value=round(v, 4), weight=weight,
                                     contribution=round(term, 4), reason=label))
    score = round(1.0 / (1.0 + math.exp(-z)), 4)
    band = band_of(score)
    drivers = sorted(contribs, key=lambda c: c["contribution"])[:2]
    explanation = (f"Trust {band} ({score:.0%}). "
                   + "; ".join(f"{c['reason']} ({c['value']:.0%})" for c in drivers)) if contribs \
        else "Insufficient signals for a trust score."
    return TrustResult(trust_score=score, band=band, contributions=contribs, explanation=explanation)
