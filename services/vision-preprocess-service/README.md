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
- lesion-focused crop generation for obvious inflamed skin regions

It is still a bridge implementation on the way to full Grounding DINO, SAM2.1, and Florence-2 inference.
