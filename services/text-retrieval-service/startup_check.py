"""
Boot-time environment validation for text-retrieval-service.
Exits non-zero with a clear error message when required config is missing.
Skipped entirely when STUB_MODE=true.
"""
import os
import sys

SERVICE = "text-retrieval-service"
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"

if STUB_MODE:
    print(f"[{SERVICE}] STUB_MODE=true — skipping env validation")
    sys.exit(0)

errors: list[str] = []

supabase_url = os.getenv("SUPABASE_URL", "").strip()
if not supabase_url:
    errors.append("SUPABASE_URL  — Supabase project URL (e.g. https://<ref>.supabase.co)")

supabase_key = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    or os.getenv("SUPABASE_ANON_KEY", "").strip()
)
if not supabase_key:
    errors.append(
        "SUPABASE_SERVICE_ROLE_KEY  — Supabase service-role key "
        "(alternatively set SUPABASE_ANON_KEY)"
    )

sidecar_key = os.getenv("SIDECAR_API_KEY", "").strip()
if not sidecar_key:
    errors.append("SIDECAR_API_KEY  — shared bearer token for internal sidecar auth")

if errors:
    print(f"[FATAL] {SERVICE}: missing required environment variables:", file=sys.stderr)
    for err in errors:
        print(f"  - {err}", file=sys.stderr)
    sys.exit(1)

# Optional config warnings
if os.getenv("TEXT_MODEL_ENABLED", "true").strip().lower() == "true":
    hf_cache = os.getenv("HF_HOME") or os.getenv("TRANSFORMERS_CACHE")
    if not hf_cache:
        print(
            f"[{SERVICE}] INFO: HF_HOME not set — models cached to default "
            "~/.cache/huggingface (fine for ephemeral containers, use a volume for persistence)"
        )

print(f"[OK] {SERVICE}: environment validated")
