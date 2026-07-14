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
vision** — CLIP image-embedding cosine (same-item / delivery identity), single-view **homography
metrology** (garment cm from an A4/tape reference), **PaddleOCR** code-slip verification, and
image quality / anti-spoof gates — plus **calibrated confidence** for every agent. Generative
vision-language reads are backend-switchable (`VLM_BACKEND`): local **Ollama + Qwen2.5-VL**, or
**Gemini 2.0 Flash** on this CPU Space (no GPU needed).

## Endpoints

| Method · Route | Agent | Returns |
|---|---|---|
| `GET /health` | — | backend, cv method (clip/phash), OCR availability, calibration version |
| `POST /vlm/match` | 1 · Possession-Proof | same_item, code_visible, calibrated confidence, signals |
| `POST /vlm/measure` | 2 · Smart Sizing | chest/length/waist cm (homography), reference, confidence, signals |
| `POST /vlm/verify_delivery` | 4 · Promise Keeper | same_product, cosine, observed attributes, confidence |
| `POST /vlm/embed` · `POST /vlm/similar` | trigger | CLIP/phash vector · Qdrant similarity |

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
