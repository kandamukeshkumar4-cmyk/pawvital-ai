# image-retrieval-service

Contract-first FastAPI service for:
- BiomedCLIP image similarity search over the curated dog-only corpus.

Current implementation now provides:
- bearer-token validation
- live Supabase-backed asset lookup against the curated corpus
- domain-aware source filtering
- deterministic condition-label and caption scoring

It is still a bridge implementation until full BiomedCLIP similarity serving is deployed.
