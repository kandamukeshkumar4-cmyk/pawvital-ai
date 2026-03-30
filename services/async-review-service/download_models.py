"""
Pre-download Qwen2.5-VL-32B-Instruct model config and processor to the HF cache.

This script runs at container startup (before uvicorn).

IMPORTANT: The 32B model is ~65 GB in fp16.  Downloading it on first boot will take
30–60 minutes on a typical cloud storage-backed volume.  Pre-populate the /model-cache
volume before starting the container in production:

  # On the host, with the volume mounted at /data/model-cache:
  huggingface-cli download Qwen/Qwen2.5-VL-32B-Instruct --local-dir /data/model-cache/hub/...

Behavior:
  - STUB_MODE=true or SKIP_MODEL_DOWNLOAD=true  → exit immediately (no download)
  - Config + processor already cached           → fast validation, no download
  - Not cached                                  → pulls config + processor (~few MB)
    Full weights are loaded lazily by app/main.py on first inference request.
"""
import os
import sys

SERVICE = "async-review-service"
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"
SKIP_DOWNLOAD = os.getenv("SKIP_MODEL_DOWNLOAD", "false").strip().lower() == "true"
MODEL_ID = os.getenv("REVIEW_MODEL_ID", "Qwen/Qwen2.5-VL-32B-Instruct").strip()

if STUB_MODE or SKIP_DOWNLOAD:
    print(
        f"[{SERVICE}] download_models: skipped "
        f"(STUB_MODE={STUB_MODE}, SKIP_MODEL_DOWNLOAD={SKIP_DOWNLOAD})"
    )
    sys.exit(0)

print(f"[{SERVICE}] download_models: ensuring {MODEL_ID} config + processor are cached ...")

try:
    from transformers import AutoConfig, AutoProcessor

    print(f"[{SERVICE}] download_models: fetching config ...")
    AutoConfig.from_pretrained(MODEL_ID)

    print(f"[{SERVICE}] download_models: fetching processor ...")
    AutoProcessor.from_pretrained(MODEL_ID)

    print(
        f"[{SERVICE}] download_models: config + processor cached.\n"
        f"[{SERVICE}] download_models: full 32B weights (~65 GB) will load on first "
        "inference request — ensure /model-cache volume is pre-populated."
    )
except Exception as exc:
    print(
        f"[{SERVICE}] download_models: WARNING — pre-check failed: {exc}\n"
        f"[{SERVICE}] download_models: Service will attempt model load at first request.",
        file=sys.stderr,
    )
