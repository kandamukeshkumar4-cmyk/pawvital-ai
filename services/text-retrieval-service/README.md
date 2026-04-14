# text-retrieval-service

Contract-first FastAPI service for:
- BGE-M3 embeddings
- BGE-Reranker-v2-M3

Current implementation now provides:
- bearer-token validation
- live Supabase-backed candidate retrieval
- lexical scoring plus deterministic reranking
- default-on `BAAI/bge-m3` semantic embedding rerank
- default-on `BAAI/bge-reranker-v2-m3` cross-encoder rerank
- dog-only and requested-domain filtering

Runtime controls:
- `STUB_MODE=true` returns empty fixtures for contract testing
- `FORCE_FALLBACK=1` disables model reranking and forces the lexical fallback path without a code change

Degradation is explicit in both `/search` and `/healthz`:
- `retrieval_mode` reports `model`, `lexical_fallback`, or `stub`
- `fallback_reason` reports why the model path is not active
- `candidate_source` reports whether candidates came from RPC or lexical fallback
