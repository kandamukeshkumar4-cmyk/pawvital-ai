# CPU-only build.
# Suitable for development, staging, and low-traffic deployments.
# For production inference, use Dockerfile.gpu — Qwen2.5-VL-7B-Instruct on CPU
# is functional but slow (~30–90 s/request depending on image size).
FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch (~800 MB vs ~2.5 GB for the default CUDA wheel).
# Install before requirements.txt so pip reuses this torch for transformers/accelerate.
RUN pip install --no-cache-dir \
    "torch==2.5.1+cpu" \
    "torchvision==0.20.1+cpu" \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
# torch already satisfied above; remaining deps install cleanly
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY startup_check.py .
COPY download_models.py .

# Model weights are NOT baked into this image — Qwen2.5-VL-7B-Instruct is ~14 GB fp16.
# Mount a persistent volume at /model-cache and set HF_HOME=/model-cache.
# download_models.py will pull weights on first boot, then reuse the cached volume.
ENV HF_HOME=/model-cache
ENV MODEL_CACHE_DIR=/model-cache

EXPOSE 8083

# start-period=600s covers first-boot model download on a typical cloud GPU node.
# Adjust upward for slow storage or the first pull on a cold volume.
HEALTHCHECK --interval=30s --timeout=15s --start-period=600s --retries=5 \
    CMD curl -f http://localhost:8083/healthz || exit 1

CMD ["sh", "-c", "python startup_check.py && python download_models.py && uvicorn app.main:app --host 0.0.0.0 --port 8083 --log-level info"]
