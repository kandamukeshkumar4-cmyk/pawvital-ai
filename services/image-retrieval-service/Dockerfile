FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only PyTorch BEFORE open_clip_torch to prevent pip from pulling the
# full ~2.5 GB CUDA wheel.  open_clip_torch will reuse this already-installed torch.
RUN pip install --no-cache-dir \
    "torch==2.5.1+cpu" \
    "torchvision==0.20.1+cpu" \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download BiomedCLIP weights into the image (~320 MB).
# Removes cold-start model-download delay on first inference request.
RUN python - <<'EOF'
import open_clip
print("[build] Downloading BiomedCLIP-PubMedBERT_256-vit_base_patch16_224 ...")
open_clip.create_model_and_transforms(
    "hf-hub:microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224"
)
print("[build] BiomedCLIP pre-download complete.")
EOF

COPY app ./app
COPY startup_check.py .

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8082/healthz || exit 1

CMD ["sh", "-c", "python startup_check.py && uvicorn app.main:app --host 0.0.0.0 --port 8082 --log-level info"]
