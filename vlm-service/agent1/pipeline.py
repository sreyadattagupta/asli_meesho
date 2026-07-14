"""Agent 1 orchestrator — runs the verification pipeline stage-by-stage over live inputs.
Each stage degrades independently: a failed stage marks `degraded` and contributes no signal,
never fabricated data (invariant: no mock on real paths). Trust score is deterministic fusion.
"""
from __future__ import annotations

from typing import Awaitable, Callable, Optional, TypedDict

from agent1.crosscheck import cross_check
from agent1.evidence import enrich
from agent1.forensics import aigen_score, manipulation_score
from agent1.reverse import reverse_search
from agent1.score import fuse


class VerificationResult(TypedDict):
    triggered: bool
    trust_score: float
    band: str
    signals: dict
    evidence: list
    platforms: list
    explanation: str
    degraded: bool
    aigen_available: bool


async def verify(
    image: bytes,
    listing: dict,
    *,
    api_key: Optional[str],
    embed_mod=None,
    reverse_fn: Optional[Callable[[bytes, Optional[str]], Awaitable[dict]]] = None,
) -> VerificationResult:
    reverse_fn = reverse_fn or reverse_search
    if embed_mod is None:
        import embed as embed_mod  # lazy — keeps package importable without wheels

    signals: dict = {}
    degraded = False

    # Component 3 — internal duplicate retrieval (Qdrant). Nearest neighbour cosine.
    try:
        hits = embed_mod.similar(image, top_k=5)
        if hits:
            signals["internal_dupe"] = float(hits[0]["score"])
    except Exception:  # noqa: BLE001 — index absent/unreachable → skip, don't fake
        degraded = True

    # Component 4+5 — live reverse search + metadata extraction.
    matches, platforms, triggered = [], [], False
    try:
        rev = await reverse_fn(image, api_key)
        if rev.get("available"):
            matches = rev["matches"]
            platforms = rev["platforms"]
            triggered = rev["triggered"]
            signals["reverse_reuse"] = min(1.0, rev["match_count"] / 5.0)
    except Exception:  # noqa: BLE001 — SerpAPI down/quota → degrade, no fake evidence
        degraded = True

    # Component 6 — bounded structured web-evidence enrichment (JSON-LD/OpenGraph of top hits).
    if matches:
        try:
            matches = await enrich(matches)
        except Exception:  # noqa: BLE001 — enrichment is best-effort, never fatal
            pass

    # Component 7 — cross-source verification.
    cs = cross_check(listing, matches)
    signals["price_anomaly"] = cs["price_anomaly"]
    signals["brand_consistency"] = cs["brand_consistency"]
    signals["title_agreement"] = cs["title_agreement"]

    # Component 8 — authenticity forensics (tamper + AI-generation). Pure numpy always runs;
    # the AI-gen classifier degrades to unavailable off the HF Space.
    aigen_available = False
    try:
        signals["manipulation"] = manipulation_score(image)
        ai = aigen_score(image)
        aigen_available = ai["available"]
        if ai["available"]:
            signals["aigen"] = ai["score"]
    except Exception:  # noqa: BLE001 — forensics must never crash the pipeline
        degraded = True

    # Component 9 — explainable trust score.
    trust = fuse(signals)

    return VerificationResult(
        triggered=triggered,
        trust_score=trust["trust_score"],
        band=trust["band"],
        signals=signals,
        evidence=matches,
        platforms=platforms,
        explanation=trust["explanation"],
        degraded=degraded,
        aigen_available=aigen_available,
    )
