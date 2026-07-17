---
title: Asli Meesho VLM CV Service
emoji: 🛡️
colorFrom: purple
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# Asli Meesho — CV / VLM service

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11_%7C_3.14-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![Deployed](https://img.shields.io/badge/live-Cloud_Run-4285F4?logo=googlecloud&logoColor=white)](https://asli-meesho-vlm-287402258660.us-central1.run.app/health)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](../ATTRIBUTION.md)

The FastAPI service behind the four Asli agents. It owns the **deterministic computer vision** — the
Agent-1 **same-product gate**, single-view **homography metrology** (garment cm from an A4/tape
reference), code-slip verification, and the image-quality / anti-spoof gates — plus **calibrated
confidence** for every agent. Generative vision-language reads are backend-switchable
(`VLM_BACKEND`): local **Ollama + Qwen2.5-VL**, or **Gemini** on CPU-only hosts.

> **Part of [Asli](../README.md)** — a point-of-listing trust layer for Meesho.
> Live app: **https://asli-meesho.vercel.app**

---

## Where this runs

| | |
|---|---|
| **Live deployment** | **Google Cloud Run** — `asli-meesho-vlm`, `us-central1`, built from this `Dockerfile` (`python:3.11-slim`) |
| **Local dev** | `uvicorn` + Ollama, `$0/call` |
| **Image portability** | The Docker SDK frontmatter above keeps this directory deployable as a **Hugging Face Space** unchanged. No Space is currently published — Cloud Run is the live target |
| **Model weights** | Pulled from the **Hugging Face Hub** at startup (SigLIP, SegFormer, garment classifier) |

Health check: `curl https://asli-meesho-vlm-287402258660.us-central1.run.app/health`

---

## Agent-1 same-product gate (Live Proof)

The possession decision matches the seller's catalog photo to the live capture. The gate is chosen at
startup by **what actually loaded** — and `/health` always reports which one is live, so a degraded
path is never silently presented as the calibrated one.

| Backbone | Role | Bar | Requires |
|---|---|---|---|
| **SigLIP-large-patch16-384** | **primary gate** (deployed) | `0.82` | `torch` + `transformers` (present in the Cloud Run image) |
| **CLIP ViT-B/32 via ONNX** — `clip/max` | **gate fallback** | **`0.75`** (calibrated) | ONNX Runtime only — **no torch** |
| **DINOv2-small via ONNX** — `dino/max/cls` | **evidence only, never gates** | — | ONNX Runtime only |
| **VLM feature comparison** | **rescue only**, below the bar | `SAME_ITEM_VLM_LO/HI` | Ollama or Gemini |
| **ImageHash (pHash)** | last-resort fallback | — | neither ONNX backbone present |

`clip/max` is a max-fused cosine over the whole frame **and** the garment crop, which keeps it robust
to background clutter. Serving through **ONNX Runtime** means the identical path runs on a local
Python 3.14 box *and* a Python 3.11 CPU image with **no torch at serve time**. The ONNX artifacts are
produced once by `scripts/export_clip_onnx.py` / `scripts/export_dinov2_onnx.py` (torch is needed only
at export).

### Calibration — and what it honestly does not solve

Thresholds are **data-calibrated** on `Marqo/deepfashion-inshop` via `scripts/eval_matcher.py`, with
the operating point committed to `models/same_item_calibration.json`:

| Signal | AUC (semantic negatives) | AUC (hard negatives) |
|---|---|---|
| `clip/whole` | 0.881 | 0.674 |
| `clip/max` | 0.849 | 0.646 |
| `dino/max/cls` | 0.787 | 0.555 |

Two findings we did not paper over:

1. **DINOv2 did not beat CLIP here**, contrary to the instance-retrieval literature. So it is served as
   **reported evidence only** and does not gate. We measured rather than assumed.
2. **No embedding separates same-category + same-colour look-alikes** (all AUC 0.53–0.67 on hard
   negatives). That adversarial case is deliberately deferred to the **single-use challenge code**,
   liveness/reuse detection and **human review** — the possession proof always combined those.

**Why the shipped bar is 0.75, not the eval's 0.896.** The deepfashion eval yields 0.896 for a strict
~5% false-accept on *semantic* negatives — but its positives are front/side/back poses, **harder than
a real Meesho catalog-vs-live pair**. At 0.896 the genuine kurti fixture (`clip/max` **0.81**) would
be rejected. We ship a recall-leaning **0.75**, validated on the committed fixtures:

| Fixture | `clip/max` | Outcome |
|---|---|---|
| `real_kurti_live.jpg` (genuine re-photograph) | **0.81** | ✅ pass |
| `real_other_dress.png` (different garment) | **0.71** | ❌ reject |

The product requirement is *"only fail if it is a **different** product"*, and fraud stays backstopped
by the single-use code plus human review. Set `SAME_ITEM_THRESHOLD=0.896` for the strict eval point.

> **This must be re-validated on a real Meesho catalog-vs-live set before production.** The artifact
> says so itself.

---

## Endpoints

| Method · Route | Agent | Returns |
|---|---|---|
| `GET /health` | — | backend, model load state, **which gate is live**, OCR availability, calibration version |
| `POST /agent1/verify` | 1 · Possession-Proof | full pipeline: reverse-image evidence, cross-source checks, forensics, trust score + explanation |
| `POST /agent1/feedback` | 1 | reviewer outcome → calibration signal (closes the learning loop) |
| `POST /vlm/match` | 1 · Possession-Proof | `same_item`, `code_visible`, calibrated `confidence`, full `signals` |
| `POST /vlm/measure` | 2 · Smart Sizing | `retake`/`provider`, chest/length/waist/**shoulder** cm (homography), `measurements`, reference, confidence + fusion signals |
| `POST /vlm/verify_delivery` | 4 · Promise Keeper | `same_product`, cosine, observed attributes, confidence |
| `POST /vlm/embed` · `POST /vlm/similar` | trigger | embedding vector · Qdrant similarity |

<details>
<summary><b><code>POST /vlm/match</code> — real response</b></summary>

```json
{
  "same_item": true, "code_visible": true, "confidence": 0.8744, "passed": true,
  "reason": "Same product: CLIP same-item 0.81 (>= 0.75 bar), DINOv2 evidence 0.33; code entered (text-verified); focus 617.",
  "signals": {
    "gate_score": 0.8145, "gate_signal": "clip/max", "gate_threshold": 0.75,
    "dino_evidence": 0.3282, "color_sim": 0.233, "code_source": "typed", "code_score": 1,
    "blur_var": 617.1, "reuse_suspect": false, "seg_catalog": "grabcut", "siglip_cosine": null
  }
}
```

A different garment, same request shape — note the VLM cross-check fires **only** when the embedding
gate fails, so it is a tie-breaker rather than decoration:

```json
{
  "same_item": false, "confidence": 0.45, "passed": false,
  "reason": "Product mismatch detected. Please capture the same product again. (CLIP same-item 0.71 (< 0.75 bar), DINOv2 evidence 0.20)",
  "signals": {
    "gate_score": 0.712, "gate_threshold": 0.75,
    "vlm_compare": {
      "same_product": false, "confidence": 1,
      "reason": "The first photo shows a black dress with purple and white floral embroidery on the chest area, while the second photo shows a pink dress with white floral embroidery on the skirt area."
    }
  }
}
```
</details>

<details>
<summary><b><code>POST /vlm/measure</code> — real response</b></summary>

```json
{
  "needs_retake": false, "provider": "cv", "garment_type": "Topwear",
  "chest_cm": 36.7, "waist_cm": 30.4, "length_cm": 34.6, "shoulder_cm": 33.5,
  "reference_used": "a4", "confidence": 0.9396, "size": "XS",
  "reason": "Measured from a detected A4 reference (homography fit, re-projection residual 0.0); chest 36.7 cm, length 34.6 cm, waist 30.4 cm, shoulder 33.5 cm.",
  "signals": { "method": "homography", "ref_aspect_err": 0.004, "residual": 0,
               "reference_detected": true, "landmark_conf": 0.9, "blur_var": 598.8 }
}
```
</details>

---

## Agent-2 Smart Sizing — pipeline + HF-Hub grading

Per-image measurement is deterministic CPU computer vision — no mock, no fixed size table:

```
detect.detect_reference_quad (A4/tape corners)
  → detect.detect_garment_landmarks (silhouette: shoulder/chest/waist/length boxes + fg_frac)
  → metrology.measure (planar homography px→cm — ONE homography for every span)
  → measure_engine.measure_image → { retake | measurements + signals }
```

No reference, or a collapsed silhouette → **RETAKE**, never a fabricated number. Sleeve is left
unmeasured rather than invented. The web layer fuses N images (median per dimension,
`lib/sizing.ts`), the seller declares the true tag size, and `grading.py` / `lib/grading.ts` grade a
full XS–4XL chart anchored on the measured garment. Per-dimension confidence comes from
`calibration.dimension_confidence` (Python), mirrored by `web/lib/confidence.ts` — monotone, bounded,
deploy-safe.

**Training is a cloud-GPU + Hugging Face Hub workflow, never a local step:**

```bash
# On Colab / Kaggle / HF (HF_TOKEN + repo env vars set); deps: training/requirements-train.txt
python training/push_grading_dataset.py   # CSV → versioned HF dataset (datasets.push_to_hub)
python -m training.fit_grading            # Hub dataset → fit slopes → eval MAE/RMSE/R² → upload to grader repo
```

The deployed service never fits: `hub.sync_grading()` (`hf_hub_download`) pulls versioned params into
the committed cache `models/grading.json` (mirrored to `web/lib/grading.json`), falling back to that
cache when offline — **no runtime Hub dependency and no GPU required to serve**.

---

## Run locally (Ollama backend, $0/call)

```bash
ollama pull qwen2.5vl          # CPU-only machine: ollama pull moondream
ollama serve

python -m venv .venv
.\.venv\Scripts\Activate.ps1   # Windows;  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

<details>
<summary><b>Expected <code>/health</code> on a local box without torch</b></summary>

```json
{ "status": "ok", "vlm_backend": "ollama", "ollama_reachable": true, "model": "qwen2.5vl:3b",
  "same_item_gate": { "primary": "clip_onnx", "clip_onnx": true, "dinov2_onnx": true,
                      "siglip": { "loaded": false, "ok": false, "threshold": 0.82 } },
  "ocr_available": false }
```

`"primary": "clip_onnx"` and `"ocr_available": false` are **correct** here — the labelled fallbacks.
Deployed, `primary` reads `"siglip"`.
</details>

### Python 3.11 vs 3.14

Both work. Two dependencies have **no cp314 wheels**, so on 3.14 the service degrades honestly rather
than failing:

| Missing on 3.14 | Consequence | Fallback |
|---|---|---|
| `paddlepaddle` / `paddleocr` | `ocr_available: false` | Code slip read by the VLM instead |
| `torch` / `transformers` | SigLIP + SegFormer + AI-gen classifier unavailable | CLIP-ONNX gate, GrabCut segmentation, `aigen` reported unavailable — **never fabricated** |

> ⚠️ **Do not install torch on a low-RAM machine to "fix" this.** SigLIP-large needs several GB; with
> ~1 GB free the process is OOM-killed mid-load and the service dies instead of degrading. Without
> torch it never attempts SigLIP and runs cleanly on the ONNX gate. `pip uninstall torch torchvision`
> restores that.

---

## Deployment

### Cloud Run (live)

```bash
gcloud run deploy asli-meesho-vlm --source . --region us-central1 \
  --memory 4Gi --allow-unauthenticated
```

Set `VLM_BACKEND=gemini` and `GEMINI_API_KEY` (no GPU on Cloud Run), plus `ALLOWED_ORIGINS` to your
Vercel domain. The Vercel app then points `VLM_SERVICE_URL` at the service URL.

<details>
<summary><b>Hugging Face Space (alternative — this image is Space-ready)</b></summary>

```bash
# one-time: create a Space (SDK=docker), then from this folder:
git init && git remote add space https://huggingface.co/spaces/<user>/asli-vlm
git add . && git commit -m "vlm-service" && git push space main
```

Space **secrets**: `GEMINI_API_KEY`, `ALLOWED_ORIGINS=https://<your-vercel-domain>` (comma-separated
for several). Then set `VLM_SERVICE_URL=https://<user>-asli-vlm.hf.space` in the web app.
</details>

<details>
<summary><b>Docker (local)</b></summary>

```bash
docker build -t asli-vlm .
docker run -p 8000:7860 --env-file .env asli-vlm
```
</details>

If the service is unreachable, the web app's provider seam degrades to the labelled mock and the UI
shows a `503` with a retry — **the demo never hard-fails**.

---

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `VLM_BACKEND` | `ollama` (local) · `gemini` (CPU hosts) | `ollama` |
| `OLLAMA_URL` | Ollama endpoint | `http://localhost:11434` |
| `OLLAMA_MODEL` | Local VLM | `qwen2.5vl` |
| `OLLAMA_NUM_GPU` | `0` forces full CPU (small-VRAM cards) | — |
| `VLM_TIMEOUT` | Seconds before giving up on a VLM read | `120` |
| `GEMINI_API_KEY` | Required when `VLM_BACKEND=gemini` | — |
| `ALLOWED_ORIGINS` | CORS allowlist (comma-separated) | — |
| `SAME_ITEM_THRESHOLD` | Override the calibrated gate bar | `0.75` (artifact) |
| `SAME_ITEM_GATE_SIGNAL` | e.g. `clip/max`, `clip/whole` | artifact |
| `SAME_ITEM_CALIBRATION` | Path to the calibration artifact | `models/same_item_calibration.json` |
| `SIGLIP_MODEL` | SigLIP repo id | `google/siglip-large-patch16-384` |
| `CLOTHES_SEG_MODEL` | Segmentation repo id | `mattmdjaga/segformer_b2_clothes` |
| `HF_TOKEN`, `HF_GRADING_DATASET_REPO`, `HF_GRADER_REPO`, `HF_LANDMARK_*` | Hub sync + training | see `.env.example` |

---

## Tests

```bash
pytest                       # engine tests (metrology, grading, calibration, detection, agent1)
python scripts/eval_matcher.py --help   # re-run the gate calibration
```

Fixtures in `test_data/` are **real photographs**, committed on purpose: `real_kurti_catalog.png` +
`real_kurti_live.jpg` are the same garment re-photographed, and `real_other_dress.png` is a genuinely
different one — so `test_match.py` exercises the actual model rather than a stub.

---

## License

Apache-2.0. Third-party components and model weights keep their own licenses — see
[`../ATTRIBUTION.md`](../ATTRIBUTION.md).
