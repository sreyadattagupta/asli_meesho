"""Asli Meesho — own VLM API.

Self-hosted FastAPI wrapper over a local Ollama vision model (Qwen2.5-VL).
Zero per-call cost. Two endpoints:

  POST /vlm/match    Agent 1 — possession proof (catalog vs live photo + code)
  POST /vlm/measure  Agent 2 — garment measurement (flat-lay + reference object)

Run:
  ollama serve
  uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import os
import re
from contextlib import asynccontextmanager


def _load_dotenv() -> None:
    """Load vlm-service/.env into os.environ (no python-dotenv dep) so SERPAPI_KEY, OLLAMA_*, etc.
    are present when the app is started by a bare `uvicorn main:app`. Existing env wins.

    MUST run BEFORE the local imports below: ollama_client / vlm_backend read OLLAMA_MODEL,
    OLLAMA_NUM_GPU, OLLAMA_KEEP_ALIVE, VLM_BACKEND at *import* time — load .env too late and those
    settings are silently ignored (defaults win: e.g. the 6 GB qwen2.5vl:latest instead of :3b)."""
    from pathlib import Path

    p = Path(__file__).resolve().parent / ".env"
    if not p.exists():
        return
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip("'").strip('"'))


_load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

import calibration  # noqa: E402
import compose  # noqa: E402,F401 — kept for the composite reference; local match now decomposes
import cv  # noqa: E402
import metrology  # noqa: E402
import instance  # noqa: E402 — weak tertiary ORB corroboration
import ocr  # noqa: E402
import ollama_client  # noqa: E402
import prompts  # noqa: E402
import segment  # noqa: E402 — garment segmentation (crop background before CLIP)
import vlm_backend  # noqa: E402
from agent1.pipeline import verify as agent1_verify  # noqa: E402
from agent1.feedback import beta_prior, record_case  # noqa: E402


def _norm(value) -> str:
    """Lowercase alphanumeric only — robust color/code comparison."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _box(value):
    """Coerce a model-returned box into [x1, y1, x2, y2] floats, or None.

    Qwen may nest a single box as [[x1,y1,x2,y2]]; unwrap that. Coordinates are in the model's own
    scaled space, which is fine — metrology uses the reference/garment RATIO, not absolute pixels.
    """
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], list):
        value = value[0]
    if isinstance(value, list) and len(value) >= 4:
        try:
            x1, y1, x2, y2 = (float(value[i]) for i in range(4))
            return [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]
        except (TypeError, ValueError):
            return None
    return None


def _corners(value):
    """Coerce a model-returned corner list into 4 [x, y] float pairs, or None."""
    if not isinstance(value, list) or len(value) != 4:
        return None
    out = []
    for p in value:
        if isinstance(p, list) and len(p) >= 2:
            try:
                out.append([float(p[0]), float(p[1])])
            except (TypeError, ValueError):
                return None
        else:
            return None
    return out


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load the model in the background so the first real /vlm call is warm
    # (avoids the cold-load 500). Non-blocking — the server accepts traffic now.
    asyncio.create_task(ollama_client.warm())
    yield


app = FastAPI(title="Asli Meesho VLM Service", version="0.1.0", lifespan=lifespan)

# Allow the Next.js app to call us. Local dev is localhost:3000; the deployed Vercel origin(s) are
# supplied via ALLOWED_ORIGINS (comma-separated) so the HF Space can serve the deployed demo.
_origins = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 10 * 1024 * 1024  # 10 MB per image

# Agent-1 same-product similarity thresholds — CLIP cosine on the SEGMENTED GARMENT CROP (not the
# full frame). Full-frame cosine folds the background in and collapses the same-vs-different margin
# to ~0.04; cropping the garment first (segment.py) restores a clean margin. Tuned on the committed
# real fixtures (same kurti crop ≈0.81, a different dress ≈0.63):
#   ≥ MATCH_HI        → near-duplicate crop, same item on the cosine alone (no attribute read)
#   ≥ MATCH_THRESHOLD → strongly similar; same item ONLY if the VLM colour/type attributes agree
#   <  MATCH_THRESHOLD → different product (below the pass floor — rejected)
# Env-overridable so the bar can be tuned on more photos without touching logic.
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.72"))
MATCH_HI = float(os.getenv("MATCH_HI", "0.85"))
MATCH_LO = float(os.getenv("MATCH_LO", "0.62"))
# Cosine-only fallback bar used ONLY when the VLM reinforcement is unavailable (model down / junk
# JSON). Between MATCH_THRESHOLD and MATCH_HI: a clear crop match still passes without the VLM, a
# borderline one still needs it. Never fail-open — anything below this without a VLM read is rejected.
MATCH_SOFT_HI = float(os.getenv("MATCH_SOFT_HI", "0.80"))
# Full-frame similarity at/above this ⇒ the "live" photo is pixel-identical to the catalog, i.e. a
# reused catalog image, not a live capture (anti-spoof — separate from same-item).
REUSE_CLIP = float(os.getenv("REUSE_CLIP", "0.985"))
REUSE_PHASH = float(os.getenv("REUSE_PHASH", "0.92"))
# Minimum HSV colour-histogram correlation between the garment crops for a same-item pass. CLIP on a
# crop keys on SHAPE, so a same-silhouette / different-colour garment can clear the cosine bar; this
# deterministic (VLM-free) colour gate rejects it. Tuned on fixtures: same-colour 0.23–1.0, different
# 0.0–0.02. Only enforced when CLIP is the similarity method (phash defers colour to the VLM read).
COLOR_MIN = float(os.getenv("COLOR_MIN", "0.12"))


# Cap the pixel size of an image before it goes to the local vision model. A full-res phone photo
# (e.g. 1600×900) produces enough vision tokens to OOM/crash qwen2.5vl:3b on a 4 GB card ("wsarecv:
# connection forcibly closed"); a ≤768px copy carries the colour/type the attribute read needs and
# loads reliably. Only used for the VLM leg — the CLIP/ORB signals still use the full-res crops.
_VLM_MAX_SIDE = int(os.getenv("VLM_IMAGE_MAX_SIDE", "768"))


def _downscale_for_vlm(data: bytes) -> bytes:
    try:
        import io as _io

        from PIL import Image as _Image

        img = _Image.open(_io.BytesIO(data)).convert("RGB")
        if max(img.size) <= _VLM_MAX_SIDE:
            return data
        img.thumbnail((_VLM_MAX_SIDE, _VLM_MAX_SIDE))
        buf = _io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return buf.getvalue()
    except Exception:  # noqa: BLE001 — on any failure send the original bytes
        return data


async def _read(upload: UploadFile, field: str) -> bytes:
    if upload.content_type and not upload.content_type.startswith("image/"):
        raise HTTPException(400, f"{field} must be an image, got {upload.content_type}")
    data = await upload.read()
    if not data:
        raise HTTPException(400, f"{field} is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"{field} exceeds 10 MB")
    return data


@app.get("/health")
async def health():
    backend = vlm_backend.backend_name()
    # For the local Ollama backend, real health is Ollama reachability; Gemini is assumed reachable.
    reachable = await ollama_client.ping() if backend == "ollama" else bool(vlm_backend.GEMINI_API_KEY)
    try:
        import embed
        cv_method = embed.method()
    except Exception:  # noqa: BLE001 — embedding stack absent
        cv_method = "unavailable"
    return {
        "status": "ok" if reachable else "degraded",
        "vlm_backend": backend,
        "ollama_reachable": reachable,
        "model": ollama_client.OLLAMA_MODEL if backend == "ollama" else vlm_backend.GEMINI_MODEL,
        "num_gpu": ollama_client._NUM_GPU,     # what the service actually sends to Ollama
        "keep_alive": ollama_client._KEEP_ALIVE,
        "cv_method": cv_method,          # clip | phash | unavailable
        "ocr_available": ocr.available(),
        "calibration_version": calibration.CALIBRATION_VERSION,
    }


@app.post("/vlm/match")
async def vlm_match(
    catalog: UploadFile = File(..., description="Seller's catalog/listing photo"),
    live: UploadFile = File(..., description="Live camera photo of the product (no code slip)"),
    code: str = Form("", description="Typed challenge code, already text-verified upstream"),
):
    """Agent 1 — Possession-Proof. Returns same_item / code_visible / confidence / reason / signals.

    The challenge code is now TYPED by the seller and verified as text upstream (single-use claim
    in the web route) — the photo captures the PRODUCT ONLY, no code slip. So this endpoint proves
    possession from the product alone; `code` arrives already-confirmed and drives `code_visible`.

    Production pipeline (each step real, no branch-constant confidence):
      1. quality/anti-spoof gate on the LIVE capture (variance-of-Laplacian focus + resolution);
      2. SEGMENT the garment out of both frames (segment.py) so the background does not dominate;
      3. same-INSTANCE via CLIP embedding cosine on the CROPS — full-frame cosine collapses the
         same-vs-different margin to ~0.04, cropping restores ~0.18 (measured on the real fixtures);
      4. reinforce in the ambiguous band with a VLM colour/type read + a weak ORB corroboration;
      5. reuse/liveness: a photo pixel-identical to the catalog is a reused image, not a live capture;
      6. calibrated confidence from those signals (calibration.instance_item_strength → confidence).
    FAIL-CLOSED: any pipeline error yields same_item=False (retake), never a silent auto-pass — a
    possession gate must never fail open. Single-image VLM reads stay reliable on small local models.
    """
    catalog_bytes = await _read(catalog, "catalog")
    live_bytes = await _read(live, "live")

    code_confirmed = bool(_norm(code))
    code_visible = code_confirmed
    code_score = 1.0 if code_confirmed else 0.0

    q = cv.quality(live_bytes)
    # 1) Reject blurry / low-res captures before spending an inference call.
    if not q["ok"]:
        return {
            "same_item": False, "code_visible": code_visible,
            "confidence": calibration.possession_confidence(0.0, 0.0, 0.0, blur_ok=False),
            "reason": f"Live capture rejected: {q['reason']}", "passed": False,
            "signals": {"cosine": 0.0, "method": "none",
                        "blur_var": q["blur_var"], "quality_ok": False},
        }

    try:
        # 2) Segment the garment from each frame. CLIP is background-sensitive, so we compare the
        #    CROPS; the VLM (background-robust) still reads the WHOLE frames for attributes.
        seg_cat = segment.segment_garment(catalog_bytes)
        seg_liv = segment.segment_garment(live_bytes)
        sim = cv.similarity(seg_cat["bytes"], seg_liv["bytes"])  # crop-CLIP {score, method}
        is_clip = sim["method"] == "clip"
        score = sim["score"]

        # Reuse/liveness on the FULL frames: a live photo pixel-identical to the catalog is a reused
        # image, not a fresh capture (anti-spoof — orthogonal to same-item).
        full = cv.similarity(catalog_bytes, live_bytes)
        reuse_suspect = full["score"] >= (REUSE_CLIP if full["method"] == "clip" else REUSE_PHASH)

        # 3) Ambiguous band → run the VLM colour/type read to REINFORCE the same-instance call. Below
        #    the pass floor we reject without a read; a near-duplicate crop (≥MATCH_HI) passes on cosine
        #    alone. The VLM is reinforcement, not a hard dependency: if it is unreachable/returns junk,
        #    we DEGRADE to a stricter cosine-only bar (MATCH_SOFT_HI) rather than failing a genuine — and
        #    still reject anything the crop cosine alone cannot vouch for (graceful, not fail-open).
        need_vlm = (not is_clip) or (MATCH_THRESHOLD <= score < MATCH_HI)
        cat: dict = {}
        liv: dict = {}
        attr_agree: bool | None = None
        vlm_ok = True
        if need_vlm:
            try:
                # Two single-image reads, SEQUENTIAL (a single-GPU Ollama serves one at a time). Read the
                # WHOLE frames — the VLM attends to the garment regardless of background.
                cat = await vlm_backend.run_vlm(
                    prompts.describe_catalog_prompt(), images=[_downscale_for_vlm(catalog_bytes)])
                liv = await vlm_backend.run_vlm(
                    prompts.describe_live_prompt(), images=[_downscale_for_vlm(live_bytes)])
                cat_color, liv_color = _norm(cat.get("color")), _norm(liv.get("color"))
                attr_agree = bool(cat_color) and bool(liv_color) and (
                    cat_color == liv_color or cat_color in liv_color or liv_color in cat_color
                )
            except Exception:  # noqa: BLE001 — model unreachable / non-JSON. Degrade, don't fail-open.
                vlm_ok = False
                attr_agree = None

        # 4) Deterministic colour gate (VLM-free) + weak ORB corroboration, both on the crops.
        color_sim = instance.color_similarity(seg_cat["bytes"], seg_liv["bytes"])
        color_ok = color_sim >= COLOR_MIN
        orb = instance.good_matches(seg_cat["bytes"], seg_liv["bytes"])

        # 5) Same-instance decision. VISUAL similarity (crop cosine, reinforced by the VLM attribute
        #    read in the ambiguous band) AND the colour gate must BOTH hold — CLIP-on-a-crop keys on
        #    shape, so the colour histogram catches a same-shape / different-colour garment even when
        #    the VLM is down. Below the pass floor is always a different product.
        if is_clip:
            if score >= MATCH_HI:
                visual_ok = True                                  # near-duplicate crop → cosine alone
            elif score >= MATCH_THRESHOLD:
                if attr_agree is True:
                    visual_ok = True                              # cosine + attribute agreement
                elif attr_agree is False:
                    visual_ok = False                             # attributes disagree → different item
                else:  # VLM unavailable → cosine-only fallback at a STRICTER bar (never fail-open)
                    visual_ok = score >= MATCH_SOFT_HI
            else:
                visual_ok = False                                 # below the pass floor → different
            same_item = bool(visual_ok and color_ok)
        else:
            # phash (no CLIP) is unreliable for same-instance → require attribute agreement + a
            # non-trivial hash similarity, and never pass on the hash alone.
            same_item = bool(attr_agree and score >= MATCH_THRESHOLD)

        item_strength = calibration.instance_item_strength(
            score, attr_agree, orb.get("good", 0), orb.get("texture_ok", False),
        )
        if not same_item:
            item_strength = min(item_strength, 0.45)  # gated out → weak evidence

        confidence = calibration.possession_confidence(item_strength, code_score, 0.0, q["ok"])
        if not same_item:
            confidence = min(confidence, 0.45)  # never report high confidence for a non-matching item
        if reuse_suspect:
            confidence = min(confidence, 0.2)   # reused catalog image — not a live capture
        # Possession = the SAME product, captured live (not reused), code confirmed upstream.
        passed = bool(same_item and code_confirmed and not reuse_suspect)

        if reuse_suspect:
            reason = (
                f"Live photo looks reused from the catalog (full-frame {full['method']} "
                f"{full['score']:.2f} ≥ reuse bar) — retake a fresh photo of the product."
            )
        elif need_vlm and not vlm_ok:
            reason = (
                f"Same-item garment-crop {sim['method']} {score:.2f} "
                f"({'≥' if same_item else '<'} {MATCH_SOFT_HI:.2f} cosine-only bar; VLM read "
                f"unavailable); code entered (text-verified); focus {q['blur_var']:.0f}."
            )
        elif need_vlm:
            reason = (
                f"Catalog {cat.get('color', '?')} {cat.get('type', '')}; live {liv.get('color', '?')} "
                f"{liv.get('type', '')}. Same-item crop-{sim['method']} {score:.2f} "
                f"(attr_agree={attr_agree}); code entered (text-verified); focus {q['blur_var']:.0f}."
            ).strip()
        elif same_item:
            reason = (
                f"Same-item crop-{sim['method']} {score:.2f} (near-duplicate, ≥ {MATCH_HI:.2f}); "
                f"code entered (text-verified); focus {q['blur_var']:.0f}."
            )
        elif is_clip and score >= MATCH_THRESHOLD and not color_ok:
            reason = (
                f"Different product: colours differ (crop colour-corr {color_sim:.2f} "
                f"< {COLOR_MIN:.2f}) despite similar shape ({sim['method']} {score:.2f}); "
                f"code entered (text-verified); focus {q['blur_var']:.0f}."
            )
        else:
            reason = (
                f"Different product: garment-crop similarity {sim['method']} {score:.2f} "
                f"< {MATCH_THRESHOLD:.2f} pass bar; code entered (text-verified); focus {q['blur_var']:.0f}."
            )

        return {
            "same_item": same_item,
            "code_visible": code_visible,
            "confidence": confidence,
            "reason": reason,
            "passed": passed,
            "signals": {
                "cosine": score, "method": sim["method"], "color_match": bool(attr_agree),
                "color_sim": round(color_sim, 3), "color_ok": color_ok,
                "code_source": "typed" if code_confirmed else "none", "code_score": round(code_score, 3),
                "ocr_available": False, "blur_var": q["blur_var"],
                "reuse_suspect": reuse_suspect, "quality_ok": True,
                "seg_catalog": seg_cat["method"], "seg_live": seg_liv["method"],
                "orb_good": orb.get("good", 0), "orb_texture_ok": orb.get("texture_ok", False),
            },
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — FAIL-CLOSED: never auto-pass on a pipeline error.
        return {
            "same_item": False, "code_visible": code_visible,
            "confidence": 0.0,
            "reason": f"Verification could not be completed ({type(e).__name__}); please retake the photo.",
            "passed": False,
            "signals": {"cosine": 0.0, "method": "error", "quality_ok": True, "error": str(e)[:200]},
        }


@app.post("/vlm/measure")
async def vlm_measure(
    flatlay: UploadFile = File(..., description="Garment laid flat with reference object"),
    reference_object: str = Form("a4", description="'a4' or 'tape'"),
):
    """Agent 2 — Smart Sizing. Returns chest_cm / length_cm / waist_cm + signals.

    Single-view metrology (Criminisi/Reid/Zisserman 2000): the model grounds the reference's four
    corners plus garment/chest/waist boxes; `metrology.py` fits a planar homography (numpy DLT) and
    measures cm in the rectified plane — correcting perspective the old reference/garment ratio
    ignored. Waist is measured, not estimated. Bad reference detection ⇒ low-confidence "retake".
    """
    flatlay_bytes = await _read(flatlay, "flatlay")
    q = cv.quality(flatlay_bytes)

    try:
        boxes = await vlm_backend.run_vlm(
            prompts.measure_corners_prompt(reference_object),
            images=[flatlay_bytes],
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"VLM error: {e}") from e

    reference_box = _box(boxes.get("reference") or boxes.get("a4_sheet") or boxes.get("a4"))
    garment = _box(boxes.get("garment"))
    chest = _box(boxes.get("chest"))
    waist = _box(boxes.get("waist"))
    corners = _corners(boxes.get("reference_corners"))

    m = metrology.measure(reference_object, reference_box, garment, chest, waist, corners)
    confidence = calibration.sizing_confidence(m["ref_aspect_err"], m["residual"], m["box_sanity"])
    # A mis-detected reference or missing boxes must not yield a confident wrong chart.
    if m["method"] == "none" or m["ref_aspect_err"] > 0.25 or not q["ok"]:
        confidence = min(confidence, 0.35)

    return {
        "chest_cm": m["chest_cm"],
        "length_cm": m["length_cm"],
        "waist_cm": m["waist_cm"],
        "reference_used": m["reference_used"],
        "confidence": confidence,
        "signals": {
            "method": m["method"], "ref_aspect_err": m["ref_aspect_err"],
            "residual": m["residual"], "box_sanity": m["box_sanity"],
            "quality_ok": q["ok"], "blur_var": q["blur_var"],
        },
    }


@app.post("/vlm/verify_delivery")
async def vlm_verify_delivery(
    delivery: UploadFile = File(..., description="Buyer's delivery photo"),
    catalog: UploadFile = File(..., description="Frozen catalog (promised) image"),
    title: str = Form(""),
    category: str = Form(""),
):
    """Agent 4 — Promise Keeper. Delivery photo vs the frozen promise.

    Real signals: CLIP embedding cosine (delivery vs catalog) for product identity + a VLM attribute
    read (category / count / colour) compared against the frozen promise. Confidence is calibrated,
    not a constant. Perceptual-hash backend is unreliable across delivery angles, so there we defer
    the same-product call to the VLM; CLIP uses the cosine directly.
    """
    delivery_bytes = await _read(delivery, "delivery")
    catalog_bytes = await _read(catalog, "catalog")

    sim = cv.similarity(catalog_bytes, delivery_bytes)  # {score, method}
    try:
        obs = await vlm_backend.run_vlm(
            prompts.delivery_prompt(title, category), images=[catalog_bytes, delivery_bytes]
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"VLM error: {e}") from e

    observed = obs.get("observed") if isinstance(obs.get("observed"), dict) else {}
    vlm_same = bool(obs.get("same_product"))
    if sim["method"] == "clip":
        # CLIP rates same-category items highly, so a high cosine alone isn't "same product": require
        # a near-duplicate (≥MATCH_HI) OR strong similarity (≥MATCH_THRESHOLD) confirmed by the VLM.
        same_product = bool(sim["score"] >= MATCH_HI or (sim["score"] >= MATCH_THRESHOLD and vlm_same))
    else:
        same_product = vlm_same  # phash unreliable for same-product across angles → trust the VLM

    obs_cat = observed.get("category") or category
    cat_ok = bool(_norm(obs_cat) and _norm(category) and (
        _norm(obs_cat) == _norm(category)
        or _norm(category) in _norm(obs_cat) or _norm(obs_cat) in _norm(category)))
    attr_agreement = ((1.0 if same_product else 0.0) + (1.0 if cat_ok else 0.0)) / 2.0
    confidence = calibration.delivery_confidence(sim["score"], attr_agreement)

    return {
        "same_product": same_product,
        "cosine": sim["score"],
        "observed": {
            "category": observed.get("category"),
            "count": observed.get("count"),
            "color": observed.get("color"),
        },
        "reason": (
            f"Same-product {sim['method']} {sim['score']:.2f}; "
            f"category {'match' if cat_ok else 'differs'}."
        ),
        "method": sim["method"],
        "confidence": confidence,
    }


@app.post("/vlm/embed")
async def vlm_embed(image: UploadFile = File(..., description="Image to embed")):
    """Embedding for the Qdrant TRIGGER source — CLIP vector or perceptual-hash bits."""
    data = await _read(image, "image")
    try:
        import embed  # imported lazily so /match /measure work even if the embed stack is absent
        return embed.embed_vector(data)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"embed unavailable: {e}") from e


@app.post("/vlm/similar")
async def vlm_similar(
    image: UploadFile = File(..., description="Query image"),
    top_k: int = Form(5),
):
    """Similarity search over the local Qdrant catalog. TRIGGER only (invariant #1)."""
    data = await _read(image, "image")
    try:
        import embed
        return {"matches": embed.similar(data, top_k=top_k), "method": embed.method()}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"similar unavailable: {e}") from e


@app.post("/agent1/verify")
async def agent1_verify_endpoint(
    image: UploadFile = File(..., description="Seller catalog/listing image"),
    title: str = Form(""),
    price: str = Form(""),
    brand: str = Form(""),
    category: str = Form(""),
    listingId: str = Form(""),
):
    """Agent 1 — full verification pipeline over live inputs. TRIGGER + explainable trust score."""
    data = await _read(image, "image")
    try:
        price_val = float(price) if price.strip() else None
    except ValueError:
        price_val = None
    listing = {"title": title, "price": price_val, "brand": brand or None, "category": category}
    return await agent1_verify(data, listing, api_key=os.getenv("SERPAPI_KEY"))


@app.post("/agent1/feedback")
async def agent1_feedback_endpoint(
    listingId: str = Form(""),
    sellerId: str = Form(""),
    decision: str = Form(""),  # "approve" | "reject"
    passes: int = Form(0),
    fails: int = Form(0),
    image: UploadFile | None = File(None),
):
    """Agent 1 — feedback learning. Indexes a verified case (if an image is given) and returns the
    seller's updated Beta-reputation prior. Component 10 — continuous learning loop."""
    indexed = False
    image_hash = None
    if image is not None:
        data = await _read(image, "image")
        rec = record_case(data, {
            "listing_id": listingId, "seller_id": sellerId,
            "verified": decision == "approve",
        })
        indexed, image_hash = rec["indexed"], rec["image_hash"]
    return {"indexed": indexed, "image_hash": image_hash,
            "prior": beta_prior(passes, fails)}
