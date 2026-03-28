# image-retrieval-service

Contract-first FastAPI service for:
- BiomedCLIP image similarity search over the curated dog-only corpus.

Current implementation now provides:
- bearer-token validation
- live Supabase-backed asset lookup against the curated corpus
- domain-aware source filtering
- deterministic condition-label and caption scoring
- optional `microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224` image-text reranking over candidate assets

If the model runtime is unavailable or candidate images cannot be loaded, the service degrades gracefully to deterministic ranking instead of failing the request.
