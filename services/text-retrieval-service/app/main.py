import logging
import os
import re
from typing import Any

import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


DOMAIN_HINTS: dict[str, list[str]] = {
    "skin_wound": [
        "skin",
        "wound",
        "lesion",
        "hot spot",
        "hotspot",
        "ringworm",
        "fungal",
        "mange",
        "dermat",
        "tick",
        "rash",
        "abscess",
    ],
    "eye": ["eye", "ocular", "cornea", "eyelid", "conjunct"],
    "ear": ["ear", "otitis", "ear flap", "ear canal", "mites"],
    "stool_vomit": ["vomit", "vomiting", "stool", "poop", "diarrhea", "diarrhoea"],
}

NON_DOG_MARKERS = {
    "cat",
    "cats",
    "kitten",
    "feline",
    "horse",
    "equine",
    "cow",
    "bovine",
    "goat",
    "sheep",
}

logger = logging.getLogger("text-retrieval-service")


def parse_bool_env(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    or os.getenv("SUPABASE_ANON_KEY", "").strip()
)
SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "").strip()
REQUEST_TIMEOUT_SECONDS = float(os.getenv("SUPABASE_TIMEOUT_SECONDS", "8"))
STUB_MODE = parse_bool_env("STUB_MODE")
FORCE_FALLBACK = parse_bool_env("FORCE_FALLBACK")
DEFAULT_CANDIDATE_LIMIT = int(os.getenv("TEXT_RETRIEVAL_CANDIDATE_LIMIT", "18"))
TEXT_EMBED_MODEL_NAME = os.getenv("TEXT_EMBED_MODEL_NAME", "BAAI/bge-m3").strip()
TEXT_RERANK_MODEL_NAME = os.getenv(
    "TEXT_RERANK_MODEL_NAME",
    "BAAI/bge-reranker-v2-m3",
).strip()
TEXT_MODEL_ENABLED = parse_bool_env("TEXT_MODEL_ENABLED", default="true")
TEXT_MODEL_MAX_CANDIDATES = int(os.getenv("TEXT_MODEL_MAX_CANDIDATES", "24"))

EMBED_MODEL = None
RERANK_MODEL = None
MODEL_LOAD_ATTEMPTED = False
MODEL_LOAD_ERROR: str | None = None


class RetrievalRequest(BaseModel):
    query: str
    domain: str | None = None
    breed: str | None = None
    condition_hints: list[str] = Field(default_factory=list)
    dog_only: bool = True
    text_limit: int = 4


app = FastAPI(title="text-retrieval-service", version="0.2.0")


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def normalize_term(value: str | None) -> str:
    return normalize_text(value).replace("_", " ").replace("-", " ")


def tokenize_text(value: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9]+", normalize_text(value))
        if len(token) >= 3
    ]


def fallback_tokens(values: list[str], limit: int = 6) -> list[str]:
    seen: set[str] = set()
    tokens: list[str] = []
    for value in values:
        for token in tokenize_text(value):
            if token in seen:
                continue
            seen.add(token)
            tokens.append(token)
            if len(tokens) >= limit:
                return tokens
    return tokens


def dedupe_terms(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        normalized = normalize_term(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def is_dog_only_text(value: str) -> bool:
    tokens = set(tokenize_text(value))
    return not any(marker in tokens for marker in NON_DOG_MARKERS)


def supports_domain(value: str, domain: str | None) -> bool:
    normalized_domain = normalize_text(domain)
    if not normalized_domain or normalized_domain == "unsupported":
        return True

    hints = DOMAIN_HINTS.get(normalized_domain)
    if not hints:
        return True

    haystack = normalize_text(value)
    return any(hint in haystack for hint in hints)


def validate_auth(authorization: str | None) -> None:
    if not SIDECAR_API_KEY:
        return

    expected = f"Bearer {SIDECAR_API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid sidecar bearer token")


def health_mode() -> str:
    if STUB_MODE:
        return "stub"
    if not (SUPABASE_URL and SUPABASE_KEY):
        return "degraded"
    if FORCE_FALLBACK:
        return "forced_fallback"
    if EMBED_MODEL is not None and RERANK_MODEL is not None:
        return "live_with_models"
    if not TEXT_MODEL_ENABLED or MODEL_LOAD_ERROR:
        return "live_with_fallback"
    return "live_pending_model_load"


def build_supabase_headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def build_search_terms(payload: RetrievalRequest) -> list[str]:
    return dedupe_terms(
        [
            payload.query,
            *(payload.condition_hints or []),
            payload.breed or "",
            payload.domain or "",
        ]
    )


def model_backend_enabled() -> bool:
    return TEXT_MODEL_ENABLED and not STUB_MODE and not FORCE_FALLBACK


def default_fallback_reason() -> str | None:
    if STUB_MODE:
        return "stub_mode"
    if FORCE_FALLBACK:
        return "force_fallback"
    if not TEXT_MODEL_ENABLED:
        return "text_model_disabled"
    if MODEL_LOAD_ERROR:
        return "model_load_failed"
    return None


def build_response_meta(mode: str, fallback_reason: str | None) -> dict[str, Any]:
    return {
        "retrieval_mode": mode,
        "fallback_reason": fallback_reason,
    }


def build_or_filter(search_terms: list[str]) -> str:
    filters = [f"text_content.ilike.*{token}*" for token in fallback_tokens(search_terms)]
    return f"({','.join(filters)})" if filters else ""


def summarize_text(text: str, max_chars: int = 320) -> str:
    compact = re.sub(r"\s+", " ", text.strip())
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 3].rstrip() + "..."


def build_candidate_text(row: dict[str, Any]) -> str:
    keyword_tags = [str(tag) for tag in row.get("keyword_tags") or []]
    return " ".join(
        part
        for part in [
            str(row.get("source_title") or ""),
            str(row.get("chunk_title") or ""),
            str(row.get("text_content") or ""),
            " ".join(keyword_tags),
        ]
        if part
    )


def load_models():
    global EMBED_MODEL, RERANK_MODEL, MODEL_LOAD_ATTEMPTED, MODEL_LOAD_ERROR

    if MODEL_LOAD_ATTEMPTED:
        return EMBED_MODEL, RERANK_MODEL

    MODEL_LOAD_ATTEMPTED = True

    if not model_backend_enabled():
        return None, None

    try:
        from sentence_transformers import CrossEncoder, SentenceTransformer

        embed_model = SentenceTransformer(TEXT_EMBED_MODEL_NAME)
        rerank_model = CrossEncoder(TEXT_RERANK_MODEL_NAME)
        EMBED_MODEL = embed_model
        RERANK_MODEL = rerank_model
        MODEL_LOAD_ERROR = None
        logger.info(
            "Loaded text retrieval models embed=%s rerank=%s",
            TEXT_EMBED_MODEL_NAME,
            TEXT_RERANK_MODEL_NAME,
        )
    except Exception as error:
        MODEL_LOAD_ERROR = str(error)
        EMBED_MODEL = None
        RERANK_MODEL = None
        logger.warning("Falling back to deterministic text retrieval", exc_info=error)

    return EMBED_MODEL, RERANK_MODEL


def rerank_with_models(
    query: str,
    ranked_rows: list[tuple[float, dict[str, Any]]],
) -> tuple[list[tuple[float, dict[str, Any]]], dict[str, Any]]:
    if not model_backend_enabled():
        return ranked_rows, build_response_meta(
            "lexical_fallback",
            default_fallback_reason() or "model_backend_disabled",
        )

    embed_model, rerank_model = load_models()
    if not embed_model or not rerank_model:
        return ranked_rows, build_response_meta(
            "lexical_fallback",
            default_fallback_reason() or "model_unavailable",
        )

    model_rows = ranked_rows[: max(1, TEXT_MODEL_MAX_CANDIDATES)]
    remainder = ranked_rows[max(1, TEXT_MODEL_MAX_CANDIDATES) :]
    candidate_texts = [build_candidate_text(row) for _, row in model_rows]
    if not candidate_texts:
        return ranked_rows, build_response_meta("model", None)

    try:
        import numpy as np

        query_embedding = embed_model.encode([query], normalize_embeddings=True)[0]
        document_embeddings = embed_model.encode(candidate_texts, normalize_embeddings=True)
        semantic_scores = np.dot(document_embeddings, query_embedding)

        rerank_pairs = [[query, text] for text in candidate_texts]
        cross_scores = rerank_model.predict(rerank_pairs)

        rescored: list[tuple[float, dict[str, Any]]] = []
        for index, (base_score, row) in enumerate(model_rows):
            semantic_score = float(semantic_scores[index])
            cross_score = float(cross_scores[index])
            combined_score = base_score + semantic_score * 4.0 + cross_score * 3.0
            rescored.append((combined_score, row))

        rescored.sort(key=lambda item: item[0], reverse=True)
        return rescored + remainder, build_response_meta("model", None)
    except Exception as error:
        logger.warning("Model reranking failed; using deterministic ranking", exc_info=error)
        return ranked_rows, build_response_meta("lexical_fallback", "rerank_failed")


def fetch_rpc_candidates(query: str, limit: int) -> list[dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []

    response = requests.post(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/rpc/search_knowledge_chunks",
        headers=build_supabase_headers(),
        json={"search_text": query, "match_count": max(1, limit)},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, list) else []


def fetch_fallback_candidates(search_terms: list[str], limit: int) -> list[dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_KEY or not search_terms:
        return []

    params = {
        "select": "id,source_id,title,text_content,citation,keyword_tags,source_url",
        "limit": str(limit),
    }

    or_filter = build_or_filter(search_terms)
    if not or_filter:
        return []

    params["or"] = or_filter
    response = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/knowledge_chunks",
        headers=build_supabase_headers(),
        params=params,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, list):
        return []

    candidates: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for row in data:
        chunk_id = str(row.get("id") or "")
        if not chunk_id or chunk_id in seen_ids:
            continue
        seen_ids.add(chunk_id)
        candidates.append(
            {
                "chunk_id": chunk_id,
                "source_id": row.get("source_id"),
                "source_title": "Veterinary Reference",
                "chunk_title": row.get("title") or "Veterinary Reference",
                "source_url": row.get("source_url"),
                "citation": row.get("citation"),
                "text_content": row.get("text_content") or "",
                "keyword_tags": row.get("keyword_tags") or [],
                "score": 0.1,
            }
        )
    return candidates


def score_candidate(
    row: dict[str, Any],
    payload: RetrievalRequest,
    search_terms: list[str],
) -> float:
    keyword_tags = [normalize_term(str(tag)) for tag in row.get("keyword_tags") or []]
    text_blob = " ".join(
        [
            str(row.get("source_title") or ""),
            str(row.get("chunk_title") or ""),
            str(row.get("text_content") or ""),
            " ".join(keyword_tags),
        ]
    )
    normalized_blob = normalize_text(text_blob)

    if payload.dog_only and not is_dog_only_text(normalized_blob):
        return float("-inf")

    if not supports_domain(normalized_blob, payload.domain):
        return float("-inf")

    lexical_base = float(row.get("score") or 0.0)
    term_hits = sum(1 for term in search_terms if term and term in normalized_blob)
    hint_hits = sum(
        1
        for hint in dedupe_terms(payload.condition_hints or [])
        if hint in normalized_blob
    )
    breed_bonus = (
        1.0
        if payload.breed and normalize_term(payload.breed) in normalized_blob
        else 0.0
    )
    keyword_bonus = sum(0.5 for tag in keyword_tags if tag in search_terms)

    return (
        lexical_base * 10.0
        + term_hits * 1.5
        + hint_hits * 2.0
        + breed_bonus
        + keyword_bonus
    )


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "service": "text-retrieval-service",
        "mode": health_mode(),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
        "fallback": {
            "stub_mode": STUB_MODE,
            "force_fallback": FORCE_FALLBACK,
            "reason": default_fallback_reason(),
        },
        "model_backend_enabled": model_backend_enabled(),
        "embed_model": TEXT_EMBED_MODEL_NAME,
        "rerank_model": TEXT_RERANK_MODEL_NAME,
        "model_load_error": MODEL_LOAD_ERROR,
        "models": {
            "enabled": TEXT_MODEL_ENABLED,
            "backend_enabled": model_backend_enabled(),
            "load_attempted": MODEL_LOAD_ATTEMPTED,
            "loaded": EMBED_MODEL is not None and RERANK_MODEL is not None,
            "embed_model": TEXT_EMBED_MODEL_NAME,
            "rerank_model": TEXT_RERANK_MODEL_NAME,
            "load_error": MODEL_LOAD_ERROR,
        },
    }


@app.post("/search")
def search(payload: RetrievalRequest, authorization: str | None = Header(default=None)):
    validate_auth(authorization)

    if STUB_MODE:
        return {
            "text_chunks": [],
            "rerank_scores": [],
            "source_citations": [],
            **build_response_meta("stub", "stub_mode"),
            "candidate_source": None,
            "candidate_count": 0,
        }

    search_terms = build_search_terms(payload)
    if not search_terms:
        return {
            "text_chunks": [],
            "rerank_scores": [],
            "source_citations": [],
            **build_response_meta("lexical_fallback", "empty_query"),
            "candidate_source": None,
            "candidate_count": 0,
        }

    query = " ".join(search_terms[:8])
    candidate_limit = max(payload.text_limit * 4, DEFAULT_CANDIDATE_LIMIT)
    candidate_source = "rpc"

    try:
        candidates = fetch_rpc_candidates(query, candidate_limit)
    except Exception as error:
        logger.error("RPC search failed", exc_info=error)
        candidates = []
        candidate_source = "rpc_error"

    if not candidates:
        try:
            candidates = fetch_fallback_candidates(search_terms, candidate_limit)
        except Exception as error:
            logger.error("Fallback lexical search failed", exc_info=error)
            candidates = []
            candidate_source = "lexical_error"
        else:
            candidate_source = "lexical_fallback"

    ranked: list[tuple[float, dict[str, Any]]] = []
    for candidate in candidates:
        score = score_candidate(candidate, payload, search_terms)
        if score == float("-inf"):
            continue
        ranked.append((score, candidate))

    ranked.sort(key=lambda item: item[0], reverse=True)
    ranked, response_meta = rerank_with_models(query, ranked)
    top_rows = ranked[: max(1, payload.text_limit)]

    text_chunks: list[dict[str, Any]] = []
    citations: list[str] = []
    rerank_scores: list[float] = []

    for score, row in top_rows:
        source_url = row.get("source_url")
        citation = row.get("citation") or source_url or row.get("source_title")
        citations.append(str(citation))
        rerank_scores.append(round(score, 4))
        text_chunks.append(
            {
                "title": str(row.get("chunk_title") or row.get("source_title") or "Veterinary Reference"),
                "citation": citation,
                "score": round(score, 4),
                "summary": summarize_text(str(row.get("text_content") or "")),
                "source_url": source_url,
            }
        )

    deduped_citations: list[str] = []
    seen_citations: set[str] = set()
    for citation in citations:
        if citation in seen_citations:
            continue
        seen_citations.add(citation)
        deduped_citations.append(citation)

    return {
        "text_chunks": text_chunks,
        "rerank_scores": rerank_scores,
        "source_citations": deduped_citations[:10],
        **response_meta,
        "candidate_source": candidate_source,
        "candidate_count": len(candidates),
    }
