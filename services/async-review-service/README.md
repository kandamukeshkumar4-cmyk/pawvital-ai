# async-review-service

FastAPI sidecar for:
- Qwen2.5-VL-32B-Instruct asynchronous high-complexity review

This service is intentionally non-blocking in the app architecture and supports two runtime modes:
- `STUB_MODE=true`: returns conservative contract-valid review results for queue/polling integration checks
- `FORCE_FALLBACK=1`: preserves queue/polling/callback behavior while disabling Qwen 32B inference and returning conservative fallback reviews
- `STUB_MODE=false`: loads the real Qwen2.5-VL-32B-Instruct model and processes queued review requests

Important guardrails:
- The service is server-to-server only and expects `Bearer <SIDECAR_API_KEY>` when configured
- Review IDs are deterministic so queued responses can be polled reliably
- Stub mode is meant for local orchestration and queue contract verification
- `/healthz` reports `stub`, `forced_fallback`, or `production` mode so rollout checks can distinguish intentional degradation from real failures
