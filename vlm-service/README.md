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

Self-hosted FastAPI service behind the four Asli agents. It owns the **deterministic computer
vision** — the Agent-1 **same-item gate** (CLIP ViT-B/32 served via **ONNX**, no torch), single-view
**homography metrology** (garment cm from an A4/tape reference), **PaddleOCR** code-slip verification,
and image quality / anti-spoof gates — plus **calibrated confidence** for every agent. Generative
vision-language reads are backend-switchable (`VLM_BACKEND`): local **Ollama + Qwen2.5-VL**, or
**Gemini 2.0 Flash** on this CPU Space (no GPU needed).

### Agent-1 same-item gate (Live Proof)

The possession same-item decision matches the seller's catalog photo to the live capture. It is a
**CLIP/max cosine gate** (whole-frame + garment-crop, max-fused for clutter robustness), served
through **ONNX Runtime** so the identical path runs on the local Python 3.14 box *and* the Python 3.11
CPU Space with **no torch at serve time**. Thresholds are **data-calibrated** on
`Marqo/deepfashion-inshop` (`scripts/eval_matcher.py`) at a balanced operating point and validated on
the committed real fixtures — see `models/same_item_calibration.json`.

**DINOv2-small is also served (as ONNX) but reported as evidence only, not gating.** We evaluated it
head-to-head against CLIP: contrary to the instance-retrieval literature, DINOv2 did **not** beat CLIP
on this task, and *no* single embedding separates same-category+same-colour look-alikes — that
adversarial case is deferred to the challenge code, reuse/liveness detection and human review, which
the possession proof always combined. The ONNX artifacts are produced once by
`scripts/export_dinov2_onnx.py` / `scripts/export_clip_onnx.py` (torch only at export time).

## Endpoints

| Method · Route | Agent | Returns |
|---|---|---|
| `GET /health` | — | backend, cv method (clip/phash), OCR availability, calibration version |
| `POST /vlm/match` | 1 · Possession-Proof | same_item, code_visible, calibrated confidence, signals |
| `POST /vlm/measure` | 2 · Smart Sizing | `retake`/`provider`, chest/length/waist/**shoulder** cm (homography), `measurements`, reference, confidence + fusion signals |
| `POST /vlm/verify_delivery` | 4 · Promise Keeper | same_product, cosine, observed attributes, confidence |
| `POST /vlm/embed` · `POST /vlm/similar` | trigger | CLIP/phash vector · Qdrant similarity |

### Agent-2 Smart Sizing — pipeline + HF-Hub grading

Per-image measurement is deterministic CPU CV (no mock, no fixed size table):

```
detect.detect_reference_quad (A4/tape corners) → detect.detect_garment_landmarks (silhouette:
  shoulder/chest/waist/length boxes + fg_frac) → metrology.measure (planar homography px→cm, ONE
  homography for every span) → measure_engine.measure_image → { retake | measurements + signals }
```

No reference or collapsed silhouette → **RETAKE** (never a fabricated number); sleeve is left unmeasured
rather than invented. The web layer fuses N images (median per dim, `lib/sizing.ts`), the seller declares
the true size, and `grading.py` / `lib/grading.ts` grade a full XS–4XL chart anchored on the measured
garment. Per-dimension confidence: `calibration.dimension_confidence` (Python) mirrored by
`web/lib/confidence.ts` — monotone, bounded, deploy-safe.

**Training is a cloud-GPU + Hugging Face Hub workflow, never a local step:**

```bash
# On Colab / Kaggle / HF (HF_TOKEN + repo env vars set), deps: training/requirements-train.txt
python training/push_grading_dataset.py     # CSV → versioned HF dataset (datasets.push_to_hub)
python -m training.fit_grading              # load Hub dataset → fit slopes → eval MAE/RMSE/R² → upload to Hub grader repo
python training/train_landmarks.py          # (optional) fine-tune the DeepFashion2 landmark seam w/ HF Trainer → push_to_hub → Inference Endpoint
```

The deployed service/app never fit: `hub.sync_grading()` (`hf_hub_download`) pulls the versioned params
into the committed cache `models/grading.json` (mirrored to `web/lib/grading.json`), falling back to the
committed cache when offline — no runtime Hub dependency, no GPU required to serve. See env vars in
`.env.example` (`HF_TOKEN`, `HF_GRADING_DATASET_REPO`, `HF_GRADER_REPO`, `HF_LANDMARK_*`).

## Run locally (Ollama backend, $0/call)

```bash
ollama pull qwen2.5vl          # CPU fallback: ollama pull moondream
ollama serve
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Deploy (Hugging Face Space, Docker SDK, Gemini backend)

This directory is a self-contained Docker Space. Push it to a Space and set secrets:

```bash
# one-time: create a Space (SDK=docker) named e.g. asli-vlm, then from this folder:
git init && git remote add space https://huggingface.co/spaces/<user>/asli-vlm
git add . && git commit -m "vlm-service" && git push space main
```

Space **secrets**: `GEMINI_API_KEY`, `ALLOWED_ORIGINS=https://<your-vercel-domain>`
(comma-separated for several). `VLM_BACKEND=gemini` is baked into the image. The Vercel app then
sets `VLM_PROVIDER=ollama` + `VLM_SERVICE_URL=https://<user>-asli-vlm.hf.space` to route CV through
the Space. If the Space is unreachable the provider seam degrades to the labelled mock — the demo
never hard-fails.
