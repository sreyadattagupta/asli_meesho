"""Component 10 — feedback learning. Closes the loop so Agent 1 improves as outcomes land:

  record_case   index a reviewer-verified case's embedding into the Qdrant catalog collection, so
                future duplicate/reuse retrieval (component 3) has more real reference points.
  beta_prior    Beta-reputation cold-start trust from a seller's pass/fail counts (Jøsang &
                Ismail 2002): (passes+1)/(passes+fails+2). Feeds the risk-adaptive bar.

Both are real + deterministic — no fabricated learning, no model-weight training (we grow retrieval
and priors, which is the honest, scalable form of "continuous learning" for this system).
"""
from __future__ import annotations


def beta_prior(passes: int, fails: int) -> float:
    """Expected value of a Beta(passes+1, fails+1) posterior — cold-start = 0.5, bounded (0,1)."""
    passes = max(0, int(passes))
    fails = max(0, int(fails))
    return round((passes + 1) / (passes + fails + 2), 4)


def record_case(image: bytes, payload: dict) -> dict:
    """Index a verified case embedding into the Qdrant catalog collection (grows retrieval)."""
    import embed  # lazy — keeps the module importable without the embedding wheels

    embed.index_image(image, payload)
    return {"indexed": True, "image_hash": embed._hash_hex(image)}
