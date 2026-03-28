# multimodal-consult-service

FastAPI sidecar for:
- Qwen2.5-VL-7B-Instruct synchronous multimodal consults

The service supports two runtime modes:
- `STUB_MODE=true`: returns a conservative contract-valid response for integration testing
- `STUB_MODE=false`: loads the real Qwen2.5-VL-7B-Instruct model and generates a structured consult opinion

Important guardrails:
- The clinical matrix remains the authority for urgency and triage logic
- This service is server-to-server only and expects `Bearer <SIDECAR_API_KEY>` when configured
- Stub mode is intended for local sidecar orchestration and contract verification
