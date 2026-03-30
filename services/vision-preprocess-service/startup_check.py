"""
Boot-time environment validation for vision-preprocess-service.
Exits non-zero with a clear error message when required config is missing.
Skipped entirely when STUB_MODE=true.
"""
import os
import sys

SERVICE = "vision-preprocess-service"
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"

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

print(f"[OK] {SERVICE}: environment validated")
