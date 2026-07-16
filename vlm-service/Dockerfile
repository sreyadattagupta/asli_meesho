# Asli Meesho — CV/VLM service, packaged for Hugging Face Spaces (Docker SDK, CPU).
# The deployed judge-facing demo calls this Space for the real CV pipeline (CLIP cosine,
# homography metrology, PaddleOCR); generative VLM reads route to Gemini (VLM_BACKEND=gemini),
# so no GPU is required. Local dev keeps Ollama and does not use this image.
FROM python:3.11-slim

WORKDIR /app

# System libs PaddleOCR / Pillow / OpenCV need at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Base deps, then the OCR engine (paddlepaddle has linux/py3.11 wheels — unlike the local py3.14 box).
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "paddleocr>=2.7" "paddlepaddle>=2.6"
# Agent-1 Live-Proof PRIMARY gate: SigLIP embedding (siglip_embed.py). CPU-only torch (the small wheel,
# not the multi-GB CUDA build) + transformers; the SigLIP weights are pulled from the HF Hub at boot
# and cached in-process. Kept in the image (not requirements.txt) so the CPU torch index stays scoped here.
# transformers PINNED to the 4.x line: 5.x reorganised `AutoImageProcessor` (top-level import fails),
# which silently broke SigLIP + SegFormer loading on a build that resolved to 5.x. Pin torch too so
# builds are reproducible (unpinned deps drifted between deploys and OOMed/ImportError'd at runtime).
RUN pip install --no-cache-dir torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "transformers>=4.44,<5" "safetensors>=0.4" "sentencepiece>=0.2"

COPY . .

# Agent-1 ONNX backbones (CLIP + DINOv2, ~420MB) are hosted on the HF Hub, NOT in the Cloud Build
# source upload (that upload times out at ~450MB / 300s on a home uplink). Download them into models/
# at build time. Public repo → no token needed.
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('dsreya/asli-onnx-backbones', local_dir='/tmp/onnx')" \
    && cp -r /tmp/onnx/clip-vit-b32 models/clip-vit-b32 \
    && cp -r /tmp/onnx/dinov2-small models/dinov2-small \
    && rm -rf /tmp/onnx \
    && ls -la models/clip-vit-b32 models/dinov2-small

# Pre-download the torch HF models into the image cache at BUILD time so runtime cold-starts NEVER hit
# the HF Hub (was causing slow starts + rate-limit 429s). HF_HUB_OFFLINE then loads them from the baked
# cache — fast, deterministic, no network dependency to serve. HF_HOME pins the cache so the build
# download and the runtime load use the SAME path. Keep the repo list synced with the env defaults
# SIGLIP_MODEL / CLOTHES_SEG_MODEL / GARMENT_MODEL.
#
# siglip-large-patch16-384 is the SAME_ITEM_THRESHOLD's calibration model (0.82 was fitted on it) and
# the code default in siglip_embed.py. Running base@224 against that bar rejected genuine sellers:
# measured on the real fixture pair, base scores a true match at 0.762 — under the bar — while the
# large-calibrated threshold expects ~0.9. Base stays baked so SIGLIP_MODEL can roll back to it
# without a rebuild; with HF_HUB_OFFLINE=1 a model that is not in this cache cannot load at all.
ENV HF_HOME=/app/hf_cache
RUN python -c "from huggingface_hub import snapshot_download; \
[snapshot_download(r) for r in ['google/siglip-large-patch16-384', 'google/siglip-base-patch16-224', 'mattmdjaga/segformer_b2_clothes', 'dsreya/garment-type-classifier']]"

# Generative reads go to Gemini (no GPU); set GEMINI_API_KEY + ALLOWED_ORIGINS as platform secrets.
# The container listens on $PORT so it works on both HF Spaces (7860) and Cloud Run (injects PORT=8080).
ENV VLM_BACKEND=gemini \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PORT=7860

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
