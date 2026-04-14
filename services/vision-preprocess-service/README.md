# vision-preprocess-service

Contract-first FastAPI service for:
- Grounding DINO
- SAM2.1
- Florence-2

Current implementation now provides:
- bearer-token validation
- image decoding from URL or base64
- heuristic domain and body-region inference
- image quality scoring
- real Grounding DINO detection with timeout fallback
- real SAM2.1 segmentation with timeout fallback
- real Florence-2 captioning with timeout fallback
- lesion-focused crop generation for obvious inflamed skin regions when fallback is active

Runtime controls:
- `STUB_MODE=true` returns deterministic stub fixtures for contract testing
- `FORCE_FALLBACK=1` keeps the live `/infer` contract but disables model inference and forces the heuristic path for operations safety

`/healthz` reports whether the service is running in `stub`, `forced_fallback`, or `live_with_fallback` mode.
