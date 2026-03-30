FROM python:3.11-slim

# Build tools needed by sentence-transformers native extensions
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install runtime dependencies (separate layer — cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download BGE models into the image (~1.5 GB).
# This eliminates cold-start delays on first request.
# Set TEXT_MODEL_ENABLED=false or STUB_MODE=true to skip model inference at runtime.
RUN python - <<'EOF'
from sentence_transformers import SentenceTransformer, CrossEncoder
print("[build] Downloading BAAI/bge-m3 ...")
SentenceTransformer("BAAI/bge-m3")
print("[build] Downloading BAAI/bge-reranker-v2-m3 ...")
CrossEncoder("BAAI/bge-reranker-v2-m3")
print("[build] Model pre-download complete.")
EOF

COPY app ./app
COPY startup_check.py .

EXPOSE 8081

# curl is available from the apt install above
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8081/healthz || exit 1

CMD ["sh", "-c", "python startup_check.py && uvicorn app.main:app --host 0.0.0.0 --port 8081 --log-level info"]
