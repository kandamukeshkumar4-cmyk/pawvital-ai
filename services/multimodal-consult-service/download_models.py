"""
Pre-download Qwen2.5-VL-7B-Instruct model config and processor to the HF cache.

This script runs at container startup (before uvicorn) to ensure model files are
present in the mounted volume before the first inference request arrives.

Behavior:
  - STUB_MODE=true or SKIP_MODEL_DOWNLOAD=true  → exit immediately (no download)
  - Model already in HF_HOME cache              → fast path, just validates files
  - Model not in cache                          → downloads from Hugging Face Hub
    (~14 GB fp16 on first boot — requires a persistent /model-cache volume)

The full model weights are NOT downloaded here — they are loaded lazily by
app/main.py on first inference.  This script only pulls config + processor so
the service can boot and report healthy before the first request.
"""
import os
import sys

SERVICE = "multimodal-consult-service"
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"
SKIP_DOWNLOAD = os.getenv("SKIP_MODEL_DOWNLOAD", "false").strip().lower() == "true"
MODEL_ID = os.getenv("CONSULT_MODEL_ID", "Qwen/Qwen2.5-VL-7B-Instruct").strip()

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
        f"[{SERVICE}] download_models: model weights will be loaded on first inference request."
    )
except Exception as exc:
    print(
        f"[{SERVICE}] download_models: WARNING — pre-check failed: {exc}\n"
        f"[{SERVICE}] download_models: Service will attempt model load at first request.",
        file=sys.stderr,
    )
    # Non-fatal: if the volume is pre-populated the service may still work
