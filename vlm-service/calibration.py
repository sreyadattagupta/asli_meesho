"""Signal -> calibrated confidence.

Every agent used to emit a confidence picked by an if/else branch (0.9 / 0.5 / 0.3 / 0.2
for match, a flat 0.8 for measure). That reads as fabricated to a technical reviewer and
does not move with the actual evidence. Here confidence is a documented, monotonic function
of the real signals — a Platt-style logistic map (Platt 1999) per agent — bounded to [0,1]
and reproducible. Coefficients are priors chosen from the CLIP/phash separation observed on
the `web/public/proof/*` fixtures; they are tunable, not arbitrary.

Design rules (enforced by tests):
  * monotone non-decreasing in every "more evidence" argument,
  * bounded to [0, 1],
  * no branch constants — the number always reflects the inputs.
"""
from __future__ import annotations

import math

CALIBRATION_VERSION = "cal-1"


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def instance_item_strength(
    crop_cosine: float, attr_agree: bool | None = None, orb_good: int = 0, texture_ok: bool = True
) -> float:
    """Agent 1 — fuse the same-INSTANCE signals into one item-evidence score in [0,1].

    crop_cosine   CLIP cosine of the SEGMENTED garment crops (segment.py) — the primary signal.
                  Tuned on the committed real fixtures: same-kurti 0.81, different-dress 0.63.
    attr_agree    VLM attribute (colour/type) agreement in the ambiguous band. True reinforces,
                  False weakens, None = not evaluated (near-duplicate cosine, no read needed).
    orb_good      Lowe-ratio ORB good-match count on the crops (instance.py) — a WEAK, positive-only
                  corroboration; it can never pull the score DOWN (plain/deformed cloth yields few).
    texture_ok    False ⇒ low-texture garment ⇒ ORB is uninformative ⇒ the nudge is suppressed.

    Centre at 0.62 so the pass floor (crop_cosine ≈0.72) maps to ~0.77 evidence and a clear match
    (≈0.85) saturates — a genuine, code-confirmed capture then clears the ≥90% possession bar, while
    a different product (≈0.63) lands ~0.53 and, gated out as not-same-item, is capped below.
    """
    base = _sigmoid(12.0 * (crop_cosine - 0.62))     # ~0 below .48, ~1 above .78
    if attr_agree is True:
        base = base + 0.08 * (1.0 - base)            # colour/type agree → reinforce toward 1
    elif attr_agree is False:
        base = base * 0.70                           # attributes disagree → weaken
    if texture_ok and orb_good >= 15:                # tertiary, positive-only, tiny
        base = base + min(0.05, 0.02 + 0.003 * (orb_good - 15))
    return round(_clamp01(base), 4)


def possession_confidence(
    item_strength: float, code_match: float, exif_weight: float = 0.0, blur_ok: bool = True
) -> float:
    """Agent 1 — how sure are we the seller holds THIS product, live?

    item_strength calibrated same-instance evidence in [0,1] (instance_item_strength) — the fused
                  crop-CLIP + attribute + ORB signal. (Historically a raw cosine; now the segmented,
                  fused evidence, so background no longer inflates it.)
    code_match    challenge-code certainty in [0,1] (1.0 confirmed upstream, 0 absent).
    exif_weight   advisory freshness nudge in ~[-0.05, +0.05] (EXIF DateTimeOriginal).
    blur_ok       False ⇒ input failed the focus gate ⇒ hard confidence penalty.

    Item evidence and code evidence are the two independent gates; confidence rises with both.
    A blurry capture cannot yield a high score even if the heuristics fire.
    """
    item = _clamp01(item_strength)
    code = _clamp01(code_match)
    conf = 0.05 + 0.63 * item + 0.30 * code + exif_weight
    if not blur_ok:
        conf -= 0.35
    return round(_clamp01(conf), 4)


def sizing_confidence(
    ref_aspect_err: float, homography_residual: float, box_sanity: float = 1.0
) -> float:
    """Agent 2 — how sure are we the measured cm are correct?

    ref_aspect_err       |detected ref aspect / true aspect - 1|, 0 = perfect (A4=1.414).
    homography_residual   mean re-projection error of the 4 corners in the normalised
                          plane, 0 = a clean planar fit (ratio-only fallback passes 0).
    box_sanity            in [0,1]; garment/reference boxes plausibly sized & ordered.

    Confidence falls as the reference is mis-detected or the plane fit is poor.
    """
    aspect = _sigmoid(12.0 * (0.18 - ref_aspect_err))   # >~0.18 error ⇒ collapses
    resid = _sigmoid(10.0 * (0.30 - homography_residual))
    conf = 0.15 + 0.45 * aspect + 0.25 * resid + 0.15 * _clamp01(box_sanity)
    return round(_clamp01(conf), 4)


def delivery_confidence(cosine: float, attr_agreement: float) -> float:
    """Agent 4 — how sure are we the delivered item matches the frozen promise?

    cosine          delivery-photo vs frozen-catalog image similarity in [0,1].
    attr_agreement  fraction of promised attributes (colour, count, category) confirmed.
    """
    item = _sigmoid(8.0 * (cosine - 0.55))
    conf = 0.10 + 0.55 * item + 0.35 * _clamp01(attr_agreement)
    return round(_clamp01(conf), 4)
