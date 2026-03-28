# text-retrieval-service

Contract-first FastAPI service for:
- BGE-M3 embeddings
- BGE-Reranker-v2-M3

Current implementation now provides:
- bearer-token validation
- live Supabase-backed candidate retrieval
- lexical scoring plus deterministic reranking
- dog-only and requested-domain filtering

It is still a bridge implementation until the full BGE-M3 + reranker model-serving stack is deployed.
