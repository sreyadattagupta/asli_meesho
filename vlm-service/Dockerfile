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
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "transformers>=4.44" "safetensors>=0.4" "sentencepiece>=0.2"

COPY . .

# Generative reads go to Gemini (no GPU); set GEMINI_API_KEY + ALLOWED_ORIGINS as platform secrets.
# The container listens on $PORT so it works on both HF Spaces (7860) and Cloud Run (injects PORT=8080).
ENV VLM_BACKEND=gemini \
    PORT=7860

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
