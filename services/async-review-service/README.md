# async-review-service

FastAPI sidecar for:
- Qwen2.5-VL-32B-Instruct asynchronous high-complexity review

This service is intentionally non-blocking in the app architecture and supports two runtime modes:
- `STUB_MODE=true`: returns conservative contract-valid review results for queue/polling integration checks
- `FORCE_FALLBACK=1`: preserves queue/polling/callback behavior while disabling Qwen 32B inference and returning conservative fallback reviews
- `STUB_MODE=false`: starts serving immediately, reports `warming` while the real Qwen2.5-VL-32B-Instruct model loads in the background, and processes queued review requests once warm

Important guardrails:
- The service is server-to-server only and expects `Bearer <SIDECAR_API_KEY>` when configured
- Review IDs are deterministic so queued responses can be polled reliably
- Stub mode is meant for local orchestration and queue contract verification
- `/healthz` reports `stub`, `forced_fallback`, `warming`, `startup_failed`, or `production` mode so rollout checks can distinguish intentional degradation, live warmup, and real failures
