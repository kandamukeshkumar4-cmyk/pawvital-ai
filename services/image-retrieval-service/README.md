# image-retrieval-service

Contract-first FastAPI service for:
- BiomedCLIP image similarity search over the curated dog-only corpus.

Current implementation now provides:
- bearer-token validation
- live Supabase-backed asset lookup against the curated corpus
- domain-aware source filtering
- deterministic condition-label and caption scoring
- default-on `microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224` image-text reranking over candidate assets
- boot-time asset embedding warmup for the live dog-only corpus cache

Runtime controls:
- `STUB_MODE=true` returns empty fixtures for contract testing
- `FORCE_FALLBACK=1` disables BiomedCLIP reranking and forces deterministic ranking without a code change

Degradation is explicit in both `/search` and `/healthz`:
- `retrieval_mode` reports `model`, `deterministic_fallback`, or `stub`
- `fallback_reason` reports why the BiomedCLIP path is not active
- `candidate_source` reports whether results came from live Supabase assets or a degraded query path
