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
import logging
import os
import re
from contextlib import asynccontextmanager

# Agent-2 Smart Sizing structured logs (surface in Cloud Run) — prove the pipeline ran, not a fallback.
# Attach our own stderr handler: uvicorn owns the root logger, so basicConfig alone is swallowed.
_mlog = logging.getLogger("agent2.measure")
_mlog.setLevel(logging.INFO)
if not _mlog.handlers:
    _mh = logging.StreamHandler()
    _mh.setFormatter(logging.Formatter("%(asctime)s [agent2] %(levelname)s %(message)s"))
    _mlog.addHandler(_mh)
    _mlog.propagate = False

# Agent-1 possession log — every same-item decision, so a false rejection is debuggable from the
# Cloud Run logs (the score, the bar, whether the VLM rescue ran, and the verdict).
_alog = logging.getLogger("agent1.match")
_alog.setLevel(logging.INFO)
if not _alog.handlers:
    _ah = logging.StreamHandler()
    _ah.setFormatter(logging.Formatter("%(asctime)s [agent1] %(levelname)s %(message)s"))
    _alog.addHandler(_ah)
    _alog.propagate = False


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
import detect  # noqa: E402 — deterministic A4 + garment landmark detection (Agent 2)
import dino_embed  # noqa: E402 — DINOv2-ONNX instance evidence (same-item)
import measure_engine  # noqa: E402 — Agent 2 single-image measure engine (shoulder + signals)
import metrology  # noqa: E402
import instance  # noqa: E402 — weak tertiary ORB corroboration
import ocr  # noqa: E402
import ollama_client  # noqa: E402
import prompts  # noqa: E402
import same_item  # noqa: E402 — CLIP(ONNX) same-item gate + DINOv2 evidence
import siglip_embed  # noqa: E402 — PRIMARY same-product gate: SigLIP embedding (HF Hub, loaded once)
import garment_type as garment_clf  # noqa: E402 — Agent-2 garment-type: fine-tuned HF classifier (Colab-trained)
import clothes_seg  # noqa: E402 — clothing segmentation (SegFormer, HF Hub) — primary garment mask
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
    # Warm the three torch HF models SEQUENTIALLY in one background thread — loading them concurrently
    # spikes memory past the limit and OOMs the container (each from_pretrained allocates temp buffers).
    # One-at-a-time keeps the peak bounded; until each is ready the pipeline uses its documented fallback.
    def _warm_hf_models() -> None:
        for name, warm in (("siglip", siglip_embed.warmup),
                           ("garment-type", garment_clf.warmup),
                           ("clothes-seg", clothes_seg.warmup)):
            try:
                warm()
            except Exception as e:  # noqa: BLE001 — one model failing must not stop the others
                _mlog.warning("warmup %s failed: %s", name, e)
    asyncio.create_task(asyncio.to_thread(_warm_hf_models))
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
# Live-Proof VLM tie-breaker band. A genuine same-product live photo can dip below the CLIP bar
# purely from angle/lighting/distance (the calibration file flags 0.78 as brittle on real captures).
# When CLIP FAILS but the score is in [LO, HI), a VLM compares ONLY intrinsic features
# (pattern/colour/print/logo/style), ignoring capture conditions, and can rescue the genuine seller.
# Recall-only: the VLM never vetoes a CLIP pass — fraud stays gated by CLIP<LO, code, reuse, review.
SAME_ITEM_VLM_LO = float(os.getenv("SAME_ITEM_VLM_LO", "0.55"))
SAME_ITEM_VLM_HI = float(os.getenv("SAME_ITEM_VLM_HI", "0.88"))
# SigLIP same-product cosine PASS bar (Live Proof primary gate). At/above ⇒ same product (PASS);
# below ⇒ retry (never block).
#
# Calibrated to 0.75 on the deployed model's REAL cosines, not the spec's initial 0.82. Measured on
# the committed fixtures:
#   genuine clean re-capture        0.845
#   genuine, shade/lighting shifted 0.818   ← a different phone / white balance, still the same kurti
#   a different dress               0.637
# 0.82 sat ABOVE the genuine-varied score, so an honest photo taken on another phone was rejected
# ("Product mismatch, retake") — the reported production bug. 0.75 clears both genuine cases with
# margin and rejects the different product by 0.11. Look-alikes (same category+colour, different item)
# are beyond any single embedding by design and stay backstopped by the single-use code + human
# review, so the recall-leaning bar is the right trade. Env-overridable for future re-calibration.
SIGLIP_THRESHOLD = float(os.getenv("SIGLIP_THRESHOLD", "0.75"))


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
        "same_item_gate": {              # Agent-1 same-item backbones
            "primary": "siglip" if siglip_embed._state.get("ok") else (
                "clip_onnx" if same_item.available() else "phash"),
            "siglip": {                  # PRIMARY Live-Proof gate (HF Hub, loaded once at startup)
                "model": siglip_embed.MODEL_ID,
                "loaded": siglip_embed._state.get("loaded", False),
                "ok": siglip_embed._state.get("ok", False),
                "threshold": SIGLIP_THRESHOLD,
            },
            "available": same_item.available(),
            "clip_onnx": clip_embed.available(),      # semantic fallback gate
            "dinov2_onnx": dino_embed.available(),    # reported instance evidence
        },
        "ocr_available": ocr.available(),
        "garment_type_model": {         # Agent-2 fine-tuned garment-type classifier (Colab-trained, HF Hub)
            "model": garment_clf.MODEL_ID,
            "loaded": garment_clf._state.get("loaded", False),
            "ok": garment_clf._state.get("ok", False),
        },
        "clothes_seg_model": {          # SegFormer clothing segmentation (HF Hub) — primary garment mask
            "model": clothes_seg.MODEL_ID,
            "loaded": clothes_seg._state.get("loaded", False),
            "ok": clothes_seg._state.get("ok", False),
        },
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

        # PRIMARY same-product gate: SigLIP image-embedding cosine on the BACKGROUND-ZEROED garment
        # crops (production HF model, loaded once from the Hub — siglip_embed.py). Keying on the
        # segmented garment + a learned embedding makes it robust to background, lighting, pose, angle
        # and rotation and sensitive to colour/pattern/print/logo/texture/shape — no raw-pixel compare.
        # Cascade: SigLIP → CLIP-ONNX gate → perceptual hash, so the endpoint always degrades, never crashes.
        gate = None
        sig_cos = None
        if siglip_embed.available():
            ec = siglip_embed.embed(seg_cat["bytes"])
            el = siglip_embed.embed(seg_liv["bytes"])
            if ec is not None and el is not None:
                sig_cos = round(siglip_embed.cosine(ec, el), 4)
                same = bool(sig_cos >= SIGLIP_THRESHOLD)
                gate_score = sig_cos
                method = "siglip"
                item_strength = calibration.same_item_strength(sig_cos, SIGLIP_THRESHOLD)
                gate = {"gate_score": sig_cos, "threshold": SIGLIP_THRESHOLD, "dino_evidence": None,
                        "dino_signal": None, "gate_signal": f"siglip:{siglip_embed.MODEL_ID.split('/')[-1]}",
                        "degraded": False}
                match_desc = (f"SigLIP same-product cosine {sig_cos:.3f} "
                              f"({'≥' if same else '<'} {SIGLIP_THRESHOLD:.2f} bar)")
        if gate is None and same_item.available():
            gate = same_item.decide(catalog_bytes, live_bytes)
            same = gate["same_item"]
            gate_score = gate["gate_score"] if gate["gate_score"] is not None else 0.0
            method = gate["method"]
            item_strength = calibration.same_item_strength(gate_score, gate["threshold"])
            match_desc = (f"CLIP same-item {gate_score:.2f} "
                          f"({'≥' if same else '<'} {gate['threshold']:.2f} bar)"
                          + (f", DINOv2 evidence {gate['dino_evidence']:.2f}"
                             if gate['dino_evidence'] is not None else ""))
        if gate is None:
            # Neither SigLIP nor an ONNX backbone available → perceptual-hash fallback (weak; never
            # passes on hash alone without a non-trivial similarity). Degrade rather than crash.
            sim = cv.similarity(seg_cat["bytes"], seg_liv["bytes"])
            gate_score = sim["score"]
            same = bool(gate_score >= MATCH_SOFT_HI)
            method = f"phash-fallback({sim['method']})"
            item_strength = min(0.5, gate_score)
            gate = {"gate_score": gate_score, "threshold": MATCH_SOFT_HI, "dino_evidence": None,
                    "dino_signal": None, "gate_signal": method, "degraded": True}
            match_desc = f"phash fallback {gate_score:.2f} (no ONNX backbone)"

        # VLM feature-comparison tie-breaker (Live Proof recall fix). The embedding gate is robust to
        # background (it runs on zeroed-bg crops) but still dips with angle/lighting/distance/white
        # balance, so a GENUINE same-product capture can fall just under the bar. When the gate FAILS
        # inside the ambiguous band, ask the VLM to judge same-vs-different from INTRINSIC features
        # only — pattern/colour/print/logo/style — explicitly ignoring how the photo was taken, and
        # treating a colour as matching across shade/lighting shifts (only a different hue family
        # counts). It can only PROMOTE a borderline fail to pass (recall-only); it never vetoes a
        # pass, so fraud protection (score < LO, challenge code, reuse/liveness, human review) is
        # unchanged.
        #
        # SigLIP is included here — this was the production false-negative bug. In prod the gate is
        # SigLIP (bar 0.82) whose genuine headroom is thin (a clean re-capture scores ~0.845), so a
        # different phone / lighting / shade routinely dips a GENUINE photo just under the bar. With
        # the rescue previously limited to the CLIP path, that sub-bar genuine had no recall route and
        # was rejected with "retake" — exactly the reported symptom.
        vlm_compare = None
        if method in ("clip", "dinov2-fallback", "siglip") and not same and SAME_ITEM_VLM_LO <= gate_score < SAME_ITEM_VLM_HI:
            try:
                vc = await vlm_backend.run_vlm(
                    prompts.same_item_compare_prompt(), [catalog_bytes, live_bytes])
                same_vlm = bool(vc.get("same_product"))
                vlm_conf = float(vc.get("confidence", 0.0))
                vlm_compare = {"same_product": same_vlm, "confidence": round(vlm_conf, 3),
                               "reason": str(vc.get("reason", ""))[:200]}
                if same_vlm:
                    same = True
                    method = f"{method}+vlm-compare"
                    # Honest strength: passed on VLM features below the CLIP bar — solid, not maxed.
                    item_strength = max(item_strength, min(0.85, 0.55 + 0.30 * vlm_conf))
                    match_desc = (f"{match_desc}; VLM feature-match {vlm_conf:.2f} "
                                  f"(pattern/colour/print/logo, capture conditions ignored)")
            except Exception as _vc_err:  # noqa: BLE001 — VLM down/quota → keep the CLIP gate result
                vlm_compare = {"error": type(_vc_err).__name__}

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
            # Not a hard block — the seller re-captures. Message per the Live-Proof spec.
            reason = (f"Product mismatch detected. Please capture the same product again. "
                      f"({match_desc})")

        _alog.info(
            "match: passed=%s same_item=%s method=%s gate_score=%.4f bar=%s vlm_rescue=%s "
            "color_sim=%.3f reuse=%s conf=%.3f",
            passed, same_item_flag, method, gate_score, gate.get("threshold"),
            (vlm_compare.get("same_product") if isinstance(vlm_compare, dict) else None),
            color_sim, reuse_suspect, confidence,
        )
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
                "siglip_cosine": sig_cos,  # SigLIP same-product cosine (None if SigLIP unavailable)
                "vlm_compare": vlm_compare,  # feature-based tie-breaker result (None if not invoked)
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


# Below this composed confidence the measurement is not trustworthy — the API asks for a retake
# instead of returning a size (requirement: never surface an unreliable size).
_SIZING_RETAKE_FLOOR = 0.55


@app.post("/vlm/measure")
async def vlm_measure(
    flatlay: UploadFile = File(..., description="Garment laid flat with an A4/card/tape reference"),
    reference_object: str = Form("a4", description="'a4' | 'card' | 'tape' — a hint; auto-verified"),
):
    """Agent 2 — Smart Sizing. Real per-image measurement, no hardcoded values, no LLM box-guessing.

    Pipeline (all deterministic CV, CPU-only):
      1. `detect.detect_reference_quad` finds the A4/card/tape by edges→contour→four-corner quad
         (aspect + brightness verified). No reliable reference ⇒ RETAKE, never a fabricated scale.
      2. `detect.detect_garment_landmarks` segments the garment (GrabCut) and reads chest/waist/length
         from the silhouette width profile — landmarks that move with the actual garment shape.
      3. `metrology.measure` fits a planar homography from the four corners (Criminisi/Reid/Zisserman
         2000) and converts the landmark pixels → real centimetres in the perspective-corrected plane.
      4. `calibration.sizing_confidence` scores the fit; below `_SIZING_RETAKE_FLOOR` we return
         `needs_retake` with the reason, so the caller re-prompts instead of showing a wrong size.
    """
    flatlay_bytes = await _read(flatlay, "flatlay")
    _mlog.info("measure: START — %d bytes, reference_hint=%s", len(flatlay_bytes), reference_object)
    q = cv.quality(flatlay_bytes)

    ref = detect.detect_reference_quad(flatlay_bytes, reference_object)
    landmarks = detect.detect_garment_landmarks(flatlay_bytes, ref["bbox"] if ref else None)
    _mlog.info("measure: preprocess — quality_ok=%s reference_detected=%s garment_detected=%s",
               q["ok"], bool(ref), bool(landmarks))

    def _retake(reason: str) -> dict:
        _mlog.warning("measure: RETAKE (no fabricated size) — %s", reason)
        return {
            "needs_retake": True, "retake": True, "provider": "cv", "reason": reason,
            "chest_cm": None, "length_cm": None, "waist_cm": None, "shoulder_cm": None,
            "measurements": {},
            "reference_used": reference_object, "confidence": 0.0,
            "signals": {"method": "none", "reference_detected": bool(ref),
                        "garment_detected": bool(landmarks), "quality_ok": q["ok"],
                        "blur_var": q["blur_var"],
                        "seg_quality": 0.0, "landmark_conf": 0.0,
                        "ref_aspect_err": 1.0, "residual": 1.0, "resolution_ok": 0.0},
        }

    if not q["ok"]:
        return _retake(q["reason"])
    if ref is None:
        return _retake("No A4 sheet detected next to the garment. Lay a plain A4 sheet flat in the "
                       "frame for scale and retake.")
    if landmarks is None or not landmarks["landmark_ok"]:
        return _retake("Couldn't isolate the garment. Lay it flat on a contrasting surface, fully in "
                       "frame, and retake.")

    # Coplanarity/scene guard: a detached reference (corner overlay) or an on-body/full-scene photo
    # must be rejected, not confidently mis-measured (the 46.6 cm on-body-dress failure).
    from PIL import Image as _PILImage
    import io as _io
    _w, _h = _PILImage.open(_io.BytesIO(flatlay_bytes)).size
    scene = detect.scene_check(ref, landmarks, (_w, _h))
    if not scene["coplanar_ok"]:
        r = _retake(scene["reason"])
        r["signals"].update({"scene_clutter": scene["clutter"],
                             "garment_height_frac": scene["garment_height_frac"]})
        return r

    corners = detect._order_corners(ref["corners"])
    m = metrology.measure(
        reference_object, ref["bbox"], landmarks["garment"],
        landmarks["chest"], landmarks["waist"], corners,
        shoulder=landmarks.get("shoulder"),
        hip=landmarks.get("hip"),  # no neck: unmeasurable from the silhouette (see detect.py)
    )
    confidence = calibration.sizing_confidence(m["ref_aspect_err"], m["residual"], m["box_sanity"])
    if m["method"] == "none" or m["ref_aspect_err"] > 0.25:
        confidence = min(confidence, 0.35)

    if confidence < _SIZING_RETAKE_FLOOR:
        return _retake(
            f"Measurement confidence too low ({confidence:.0%}). Flatten the garment and A4 sheet "
            "on the same surface, shoot straight-on, and retake.")

    # measurements: real cm only (>0); shoulder/hip added when the homography produced them; sleeve and
    # neck left unmeasured (never fabricated — a flat silhouette cannot separate a sleeve or see the
    # neckline hole). This object is what the web fusion layer (lib/sizing.ts) consumes.
    measurements = {k: m[k] for k in ("chest_cm", "length_cm", "waist_cm", "shoulder_cm", "hip_cm")
                    if isinstance(m.get(k), (int, float)) and m[k] > 0}

    # A homography can fit the A4 cleanly (high confidence) while the garment spans collapse to 0 —
    # e.g. the silhouette hugs the reference, or the landmark rows land outside the mask. Confidence
    # scores the REFERENCE fit, so it cannot catch that: without this guard the response is
    # `retake=False, chest_cm=0.0, measurements={}`, and a downstream size lookup turns 0 cm into the
    # smallest size. Same rule as measure_engine.measure_image — too few real dimensions ⇒ RETAKE.
    if len(measurements) < 2:
        return _retake("Couldn't measure the garment outline against the A4 sheet. Lay the garment "
                       "flat with the whole outline visible, not overlapping the sheet, and retake.")

    # Garment-TYPE detection — PRIMARY is the fine-tuned HF classifier (dsreya/garment-type-classifier,
    # trained on Colab GPU). Falls back to the VLM read, then None. Optional metadata: never blocks or
    # fabricates the measurement.
    garment_type = None
    gt = garment_clf.classify(flatlay_bytes)
    if gt:
        garment_type = gt["type"]
        _mlog.info("measure: garment-type=%s (%.2f) via trained HF classifier", gt["type"], gt["confidence"])
    else:
        try:
            desc = await vlm_backend.run_vlm(prompts.describe_catalog_prompt(), [flatlay_bytes])
            garment_type = (str(desc.get("type") or "").strip() or None)
        except Exception as _gt_err:  # noqa: BLE001
            _mlog.info("measure: garment-type read skipped (%s)", type(_gt_err).__name__)

    _mlog.info("measure: COMPLETE — method=%s confidence=%.3f measurements=%s garment_type=%s",
               m["method"], confidence, measurements, garment_type)

    return {
        "needs_retake": False,
        "retake": False,
        "provider": "cv",
        "garment_type": garment_type,
        # Flat fields mirror `measurements`: a dimension the silhouette did not yield is None, not
        # 0.0 — a zero reads downstream as "measured, and tiny" and grades to the smallest size.
        "chest_cm": measurements.get("chest_cm"),
        "length_cm": measurements.get("length_cm"),
        "waist_cm": measurements.get("waist_cm"),
        "shoulder_cm": measurements.get("shoulder_cm"),
        "measurements": measurements,
        "reference_used": m["reference_used"],
        "confidence": confidence,
        "reason": (f"Measured from a detected {m['reference_used'].upper()} reference "
                   f"({m['method']} fit, re-projection residual {m['residual']}); "
                   + ", ".join(f"{k.replace('_cm', '')} {v} cm" for k, v in measurements.items())
                   + "."),
        "signals": {
            "method": m["method"], "ref_aspect_err": m["ref_aspect_err"],
            "residual": m["residual"], "box_sanity": m["box_sanity"],
            "reference_detected": True, "reference_aspect_err": ref["aspect_err"],
            "garment_fg_frac": landmarks["fg_frac"],
            # measure_engine-style signals consumed by dimension_confidence (web lib/confidence.ts):
            "seg_quality": measure_engine._seg_quality(landmarks["fg_frac"]),
            "landmark_conf": 0.9 if landmarks["landmark_ok"] else 0.4,
            "resolution_ok": 1.0,
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
