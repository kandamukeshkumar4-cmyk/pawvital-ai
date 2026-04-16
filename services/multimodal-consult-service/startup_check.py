"""
Boot-time environment validation for multimodal-consult-service.
Exits non-zero with a clear error message when required config is missing.
Skipped entirely when STUB_MODE=true.
"""
import os
import sys

SERVICE = "multimodal-consult-service"
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"
FORCE_FALLBACK = os.getenv("FORCE_FALLBACK", "").strip().lower() in {"1", "true", "yes", "on"}

if STUB_MODE:
    print(f"[{SERVICE}] STUB_MODE=true — skipping env validation")
    sys.exit(0)

errors: list[str] = []

sidecar_key = os.getenv("SIDECAR_API_KEY", "").strip()
if not sidecar_key:
    errors.append("SIDECAR_API_KEY  — shared bearer token for internal sidecar auth")

if errors:
    print(f"[FATAL] {SERVICE}: missing required environment variables:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    sys.exit(1)

# Operational warnings
hf_home = os.getenv("HF_HOME", "").strip()
if not hf_home:
    print(
        f"[{SERVICE}] WARN: HF_HOME not set — model weights will be cached to "
        "~/.cache/huggingface inside the container and lost on restart.\n"
        f"[{SERVICE}] WARN: Strongly recommended: set HF_HOME=/model-cache "
        "and mount a persistent volume at that path.",
        file=sys.stderr,
    )

model_id = os.getenv("CONSULT_MODEL_ID", "Qwen/Qwen2.5-VL-7B-Instruct").strip()
print(f"[{SERVICE}] model: {model_id}")
print(f"[{SERVICE}] HF_HOME: {hf_home or '~/.cache/huggingface (default)'}")
if FORCE_FALLBACK:
    print(f"[{SERVICE}] FORCE_FALLBACK=1 — Qwen inference disabled; conservative fallback responses only")

import torch
device = "cuda" if torch.cuda.is_available() else "cpu"
if device == "cpu":
    print(
        f"[{SERVICE}] WARN: No CUDA GPU detected — inference will run on CPU.\n"
        f"[{SERVICE}] WARN: Qwen2.5-VL-7B-Instruct on CPU is ~30–90 s/request. "
        "Use Dockerfile.gpu on a GPU host for production.",
        file=sys.stderr,
    )
else:
    gpu_name = torch.cuda.get_device_name(0)
    vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"[{SERVICE}] GPU: {gpu_name} ({vram_gb:.1f} GB VRAM)")

print(f"[OK] {SERVICE}: environment validated")
