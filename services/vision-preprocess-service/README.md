# vision-preprocess-service

Contract-first FastAPI service for:
- Grounding DINO
- SAM2.1
- Florence-2

Current implementation returns safe stub responses so the app can exercise the full contract and fallback path without requiring GPU model deployment.
