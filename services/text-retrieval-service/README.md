# text-retrieval-service

Contract-first FastAPI service for:
- BGE-M3 embeddings
- BGE-Reranker-v2-M3

Current implementation now provides:
- bearer-token validation
- live Supabase-backed candidate retrieval
- lexical scoring plus deterministic reranking
- optional `BAAI/bge-m3` semantic embedding rerank
- optional `BAAI/bge-reranker-v2-m3` cross-encoder rerank
- dog-only and requested-domain filtering

If the HF model runtime is unavailable, the service degrades gracefully to deterministic retrieval instead of failing the request.
