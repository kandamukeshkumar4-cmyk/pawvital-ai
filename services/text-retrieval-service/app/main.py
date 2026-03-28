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

SUPABASE_URL = (
    os.getenv("SUPABASE_URL", "").strip()
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
)
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    or os.getenv("SUPABASE_ANON_KEY", "").strip()
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "").strip()
)
SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "").strip()
REQUEST_TIMEOUT_SECONDS = float(os.getenv("SUPABASE_TIMEOUT_SECONDS", "8"))
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"
DEFAULT_CANDIDATE_LIMIT = int(os.getenv("TEXT_RETRIEVAL_CANDIDATE_LIMIT", "18"))


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
    if SUPABASE_URL and SUPABASE_KEY:
        return "live"
    return "degraded"


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


def summarize_text(text: str, max_chars: int = 320) -> str:
    compact = re.sub(r"\s+", " ", text.strip())
    if len(compact) <= max_chars:
        return compact
    return compact[: max_chars - 3].rstrip() + "..."


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

    candidates: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for term in search_terms[:4]:
        params = {
            "select": "id,source_id,title,text_content,citation,keyword_tags,source_url",
            "text_content": f"ilike.*{term}*",
            "limit": str(limit),
        }
        response = requests.get(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/knowledge_chunks",
            headers=build_supabase_headers(),
            params=params,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        if not response.ok:
            continue
        data = response.json()
        if not isinstance(data, list):
            continue
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
    }


@app.post("/search")
def search(payload: RetrievalRequest, authorization: str | None = Header(default=None)):
    validate_auth(authorization)

    if STUB_MODE:
        return {"text_chunks": [], "rerank_scores": [], "source_citations": []}

    search_terms = build_search_terms(payload)
    if not search_terms:
        return {"text_chunks": [], "rerank_scores": [], "source_citations": []}

    query = " ".join(search_terms[:8])
    candidate_limit = max(payload.text_limit * 4, DEFAULT_CANDIDATE_LIMIT)

    try:
        candidates = fetch_rpc_candidates(query, candidate_limit)
    except Exception as error:
        print(f"[text-retrieval-service] RPC search failed: {error}")
        candidates = []

    if not candidates:
        try:
            candidates = fetch_fallback_candidates(search_terms, candidate_limit)
        except Exception as error:
            print(f"[text-retrieval-service] Fallback search failed: {error}")
            candidates = []

    ranked: list[tuple[float, dict[str, Any]]] = []
    for candidate in candidates:
        score = score_candidate(candidate, payload, search_terms)
        if score == float("-inf"):
            continue
        ranked.append((score, candidate))

    ranked.sort(key=lambda item: item[0], reverse=True)
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
    }
