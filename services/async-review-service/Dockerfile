# CPU-only build.
# WARNING: Qwen2.5-VL-32B-Instruct on CPU is NOT suitable for production use.
# 32B fp16 = ~65 GB model size, CPU inference is extremely slow (minutes per request).
# This Dockerfile is provided for local dev / smoke testing only.
# For any real workload use Dockerfile.gpu on a machine with ≥80 GB VRAM (A100/H100).
FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch to keep the image size manageable for dev builds.
RUN pip install --no-cache-dir \
    "torch==2.5.1+cpu" \
    "torchvision==0.20.1+cpu" \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY startup_check.py .
COPY download_models.py .

# Mount a persistent volume at /model-cache and set HF_HOME=/model-cache.
# The 32B model (~65 GB fp16) must be pre-downloaded to the volume before first use.
ENV HF_HOME=/model-cache
ENV MODEL_CACHE_DIR=/model-cache

EXPOSE 8084

# Very long start-period: 32B model first download can take 30–60 min on a slow link.
HEALTHCHECK --interval=30s --timeout=15s --start-period=3600s --retries=5 \
    CMD curl -f http://localhost:8084/healthz || exit 1

CMD ["sh", "-c", "python startup_check.py && python download_models.py && uvicorn app.main:app --host 0.0.0.0 --port 8084 --log-level info"]
