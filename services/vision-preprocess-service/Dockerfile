FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HUB_DISABLE_TELEMETRY=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY startup_check.py .

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/healthz || exit 1

CMD ["sh", "-c", "python startup_check.py && uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info"]
