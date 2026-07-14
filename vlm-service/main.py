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
import clip_embed  # noqa: E402 — CLIP-ONNX semantic gate (same-item)
import compose  # noqa: E402,F401 — kept for the composite reference; local match now decomposes
import cv  # noqa: E402
import dino_embed  # noqa: E402 — DINOv2-ONNX instance evidence (same-item)
import metrology  # noqa: E402
import instance  # noqa: E402 — weak tertiary ORB corroboration
import ocr  # noqa: E402
import ollama_client  # noqa: E402
import prompts  # noqa: E402
import same_item  # noqa: E402 — CLIP(ONNX) same-item gate + DINOv2 evidence
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

# Legacy same-product thresholds — used by /vlm/verify_delivery (Agent 4) and the /vlm/match
# perceptual-hash FALLBACK only (when neither ONNX backbone is present). The primary Agent-1 same-item
# gate lives in same_item.py (CLIP-ONNX) with its own calibrated threshold; these are NOT it.
#   ≥ MATCH_HI        → near-duplicate (same item on cosine alone)
#   ≥ MATCH_THRESHOLD → strongly similar (delivery: same item if the VLM attributes agree)
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.72"))
MATCH_HI = float(os.getenv("MATCH_HI", "0.85"))
# Perceptual-hash pass bar for /vlm/match when no ONNX backbone is available (never fail-open).
MATCH_SOFT_HI = float(os.getenv("MATCH_SOFT_HI", "0.80"))
# Full-frame similarity at/above this ⇒ the "live" photo is pixel-identical to the catalog, i.e. a
# reused catalog image, not a live capture (anti-spoof — separate from same-item).
REUSE_CLIP = float(os.getenv("REUSE_CLIP", "0.985"))
REUSE_PHASH = float(os.getenv("REUSE_PHASH", "0.92"))


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
        "cv_method": cv_method,          # clip | phash | unavailable (legacy embed.py path)
        "same_item_gate": {              # Agent-1 same-item backbones (ONNX, no torch)
            "available": same_item.available(),
            "clip_onnx": clip_embed.available(),      # semantic gate
            "dinov2_onnx": dino_embed.available(),    # reported instance evidence
        },
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
        # 2) Reuse/liveness on the FULL frames: a live photo pixel-identical to the catalog is a
        #    reused image, not a fresh capture (anti-spoof — orthogonal to same-item). Uses the shared
        #    embedding (CLIP-ONNX cosine if present, else perceptual hash) — both good at near-duplicate.
        full = cv.similarity(catalog_bytes, live_bytes)
        reuse_suspect = full["score"] >= (REUSE_CLIP if full["method"] == "clip" else REUSE_PHASH)

        # 3) SAME-ITEM GATE — CLIP (ViT-B/32) served via ONNX decides; DINOv2-small is reported as
        #    evidence only. Calibrated on Marqo/deepfashion-inshop at a ~5% false-accept operating
        #    point (models/same_item_calibration.json). CLIP catches an obviously-different product;
        #    look-alike substitution (same category+colour) is beyond ANY single embedding (measured)
        #    and is deferred to the challenge code, liveness, reuse detection and human review.
        #    If neither ONNX model is present we fall back to a perceptual-hash bar (never fail-open).
        seg_cat = segment.segment_garment(catalog_bytes)
        seg_liv = segment.segment_garment(live_bytes)
        color_sim = instance.color_similarity(seg_cat["bytes"], seg_liv["bytes"])  # reported evidence
        orb = instance.good_matches(seg_cat["bytes"], seg_liv["bytes"])            # reported evidence

        if same_item.available():
            gate = same_item.decide(catalog_bytes, live_bytes)
            same = gate["same_item"]
            gate_score = gate["gate_score"] if gate["gate_score"] is not None else 0.0
            method = gate["method"]
            item_strength = calibration.same_item_strength(gate_score, gate["threshold"])
            match_desc = (f"CLIP same-item {gate_score:.2f} "
                          f"({'≥' if same else '<'} {gate['threshold']:.2f} bar)"
                          + (f", DINOv2 evidence {gate['dino_evidence']:.2f}"
                             if gate['dino_evidence'] is not None else ""))
        else:
            # No ONNX backbone available → perceptual-hash fallback (weak; never passes on hash alone
            # without a non-trivial similarity). Kept only so the endpoint degrades rather than crashes.
            sim = cv.similarity(seg_cat["bytes"], seg_liv["bytes"])
            gate_score = sim["score"]
            same = bool(gate_score >= MATCH_SOFT_HI)
            method = f"phash-fallback({sim['method']})"
            item_strength = min(0.5, gate_score)
            gate = {"gate_score": gate_score, "threshold": MATCH_SOFT_HI, "dino_evidence": None,
                    "dino_signal": None, "gate_signal": method, "degraded": True}
            match_desc = f"phash fallback {gate_score:.2f} (no ONNX backbone)"

        same_item_flag = bool(same)
        if not same_item_flag:
            item_strength = min(item_strength, 0.45)  # gated out → weak evidence

        confidence = calibration.possession_confidence(item_strength, code_score, 0.0, q["ok"])
        if not same_item_flag:
            confidence = min(confidence, 0.45)  # never report high confidence for a non-matching item
        if reuse_suspect:
            confidence = min(confidence, 0.2)   # reused catalog image — not a live capture
        # Possession = the SAME product, captured live (not reused), code confirmed upstream.
        passed = bool(same_item_flag and code_confirmed and not reuse_suspect)

        if reuse_suspect:
            reason = (
                f"Live photo looks reused from the catalog (full-frame {full['method']} "
                f"{full['score']:.2f} ≥ reuse bar) — retake a fresh photo of the product."
            )
        elif same_item_flag:
            reason = (f"Same product: {match_desc}; code entered (text-verified); "
                      f"focus {q['blur_var']:.0f}.")
        else:
            reason = (f"Different product: {match_desc}; code entered (text-verified); "
                      f"focus {q['blur_var']:.0f}.")

        return {
            "same_item": same_item_flag,
            "code_visible": code_visible,
            "confidence": confidence,
            "reason": reason,
            "passed": passed,
            "signals": {
                "gate_score": round(gate_score, 4), "gate_signal": gate.get("gate_signal"),
                "gate_threshold": gate.get("threshold"), "method": method,
                "dino_evidence": gate.get("dino_evidence"), "dino_signal": gate.get("dino_signal"),
                "color_sim": round(color_sim, 3),
                "code_source": "typed" if code_confirmed else "none", "code_score": round(code_score, 3),
                "blur_var": q["blur_var"], "reuse_suspect": reuse_suspect, "quality_ok": True,
                "seg_catalog": seg_cat["method"], "seg_live": seg_liv["method"],
                "orb_good": orb.get("good", 0), "orb_texture_ok": orb.get("texture_ok", False),
                "gate_degraded": gate.get("degraded", False),
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
