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

COPY . .

# Generative reads go to Gemini on the Space (no GPU); set GEMINI_API_KEY + ALLOWED_ORIGINS as
# Space secrets. HF Spaces route external traffic to the port named below.
ENV VLM_BACKEND=gemini \
    PORT=7860

EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
