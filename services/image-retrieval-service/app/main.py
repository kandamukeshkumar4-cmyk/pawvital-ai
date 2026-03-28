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
        "hot_spot",
        "hot spot",
        "ringworm",
        "fungal",
        "mange",
        "tick",
        "dermatitis",
        "rash",
    ],
    "eye": ["eye", "ocular", "cornea", "eyelid", "conjunct"],
    "ear": ["ear", "otitis", "ear flap", "ear canal", "mites"],
    "stool_vomit": ["vomit", "vomiting", "stool", "poop", "diarrhea", "diarrhoea"],
}

CONDITION_LABEL_ALIASES: list[tuple[str, list[str]]] = [
    ("healthy_skin", ["healthy skin", "normal skin", "healthy"]),
    ("ringworm", ["ringworm", "dermatophyte"]),
    ("fungal_infection", ["fungal infection", "fungal", "yeast"]),
    ("demodicosis_mange", ["demodicosis", "demodectic mange", "mange"]),
    (
        "hypersensitivity_allergic",
        ["hypersensitivity allergic", "hypersensitivity", "allergic dermatitis", "allergic"],
    ),
    ("bacterial_dermatosis", ["bacterial", "pyoderma"]),
    ("dermatitis", ["dermatitis"]),
    ("hot_spot", ["hot spot", "hotspot", "moist dermatitis"]),
    ("tick_infestation", ["tick infestation", "tick"]),
    ("eye_infection", ["eye infection", "conjunctivitis"]),
    ("ear_infection", ["ear infection", "otitis"]),
]

logger = logging.getLogger("image-retrieval-service")


SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    or os.getenv("SUPABASE_ANON_KEY", "").strip()
)
SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "").strip()
REQUEST_TIMEOUT_SECONDS = float(os.getenv("SUPABASE_TIMEOUT_SECONDS", "8"))
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"
DEFAULT_CANDIDATE_LIMIT = int(os.getenv("IMAGE_RETRIEVAL_CANDIDATE_LIMIT", "60"))


class ImageRetrievalRequest(BaseModel):
    query: str
    domain: str | None = None
    breed: str | None = None
    condition_hints: list[str] = Field(default_factory=list)
    dog_only: bool = True
    image_limit: int = 4


app = FastAPI(title="image-retrieval-service", version="0.2.0")


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def normalize_term(value: str | None) -> str:
    return normalize_text(value).replace("_", " ").replace("-", " ")


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


def tokenize_text(value: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9]+", normalize_text(value))
        if len(token) >= 3
    ]


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


def build_search_terms(payload: ImageRetrievalRequest) -> list[str]:
    return dedupe_terms(
        [
            payload.query,
            *(payload.condition_hints or []),
            payload.breed or "",
            payload.domain or "",
        ]
    )


def infer_condition_filters(payload: ImageRetrievalRequest) -> list[str]:
    terms = build_search_terms(payload)
    labels = {
        normalize_text(hint).replace(" ", "_")
        for hint in (payload.condition_hints or [])
        if normalize_text(hint)
    }

    joined = " ".join(terms)
    for label, aliases in CONDITION_LABEL_ALIASES:
        for alias in aliases:
            if alias in joined:
                labels.add(label)
                break

    return sorted(label for label in labels if label)


def source_live_domains(source: dict[str, Any]) -> list[str]:
    metadata = source.get("metadata") or {}
    raw_domains = metadata.get("live_domains") or []
    if isinstance(raw_domains, list):
        domains = [normalize_text(str(value)).replace(" ", "_") for value in raw_domains]
        return [domain for domain in domains if domain]

    single_domain = normalize_text(metadata.get("live_domain"))
    if single_domain:
        return [single_domain.replace(" ", "_")]
    return []


def infer_asset_domain(asset: dict[str, Any], source: dict[str, Any]) -> str | None:
    source_domains = source_live_domains(source)
    if source_domains:
        return source_domains[0]

    metadata = asset.get("metadata") or {}
    live_domain = normalize_text(metadata.get("live_domain"))
    if live_domain:
        return live_domain.replace(" ", "_")

    haystack = " ".join(
        [
            str(asset.get("condition_label") or ""),
            str(asset.get("caption") or ""),
            str(metadata.get("raw_label") or ""),
        ]
    ).lower()
    for domain, hints in DOMAIN_HINTS.items():
        if any(hint in haystack for hint in hints):
            return domain
    return None


def is_live_source(source: dict[str, Any], dog_only: bool, domain: str | None) -> bool:
    metadata = source.get("metadata") or {}
    if normalize_text(metadata.get("live_retrieval_status")) not in {"", "live"}:
        return False

    if dog_only:
        species_scope = normalize_text(metadata.get("species_scope"))
        if species_scope not in {"", "dog"}:
            return False

    if domain and domain != "unsupported":
        live_domains = source_live_domains(source)
        if live_domains and domain not in live_domains:
            return False

    return True


def fetch_live_sources(payload: ImageRetrievalRequest) -> dict[str, dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {}

    response = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/reference_image_sources",
        headers=build_supabase_headers(),
        params={
            "select": "id,slug,title,dataset_url,metadata,condition_labels",
            "active": "eq.true",
            "limit": "100",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        return {}

    normalized_domain = normalize_text(payload.domain).replace(" ", "_")
    sources: dict[str, dict[str, Any]] = {}
    for row in rows:
        source_id = str(row.get("id") or "")
        if not source_id:
            continue
        if not is_live_source(row, payload.dog_only, normalized_domain):
            continue
        sources[source_id] = row
    return sources


def build_or_filter(search_terms: list[str]) -> str:
    filters: list[str] = []
    token_values: list[str] = []
    seen_tokens: set[str] = set()
    for term in search_terms:
        for token in tokenize_text(term):
            if token in seen_tokens:
                continue
            seen_tokens.add(token)
            token_values.append(token)
            if len(token_values) >= 6:
                break
        if len(token_values) >= 6:
            break

    for token in token_values:
        if not token:
            continue
        wildcard = f"*{token}*"
        filters.append(f"condition_label.ilike.{wildcard}")
        filters.append(f"caption.ilike.{wildcard}")
    return f"({','.join(filters)})" if filters else ""


def fetch_assets(
    source_ids: list[str],
    search_terms: list[str],
    condition_filters: list[str],
    limit: int,
) -> list[dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_KEY or not source_ids:
        return []

    params: dict[str, str] = {
        "select": "id,source_id,condition_label,local_path,asset_url,caption,metadata",
        "source_id": f"in.({','.join(source_ids)})",
        "limit": str(limit),
    }

    or_filter = build_or_filter(search_terms)
    if or_filter:
        params["or"] = or_filter

    response = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/reference_image_assets",
        headers=build_supabase_headers(),
        params=params,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    rows = response.json()
    if isinstance(rows, list) and rows:
        return rows

    if condition_filters:
        fallback = requests.get(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/reference_image_assets",
            headers=build_supabase_headers(),
            params={
                "select": "id,source_id,condition_label,local_path,asset_url,caption,metadata",
                "source_id": f"in.({','.join(source_ids)})",
                "condition_label": f"in.({','.join(condition_filters)})",
                "limit": str(limit),
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        fallback.raise_for_status()
        data = fallback.json()
        return data if isinstance(data, list) else []

    broad = requests.get(
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/reference_image_assets",
        headers=build_supabase_headers(),
        params={
            "select": "id,source_id,condition_label,local_path,asset_url,caption,metadata",
            "source_id": f"in.({','.join(source_ids)})",
            "limit": str(limit),
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    broad.raise_for_status()
    data = broad.json()
    return data if isinstance(data, list) else []


def score_asset(
    asset: dict[str, Any],
    source: dict[str, Any],
    payload: ImageRetrievalRequest,
    search_terms: list[str],
    condition_filters: list[str],
) -> float:
    metadata = asset.get("metadata") or {}
    asset_domain = infer_asset_domain(asset, source)
    normalized_domain = normalize_text(payload.domain).replace(" ", "_")
    if normalized_domain and normalized_domain != "unsupported" and asset_domain and asset_domain != normalized_domain:
        return float("-inf")

    condition_label = normalize_text(asset.get("condition_label")).replace(" ", "_")
    text_blob = " ".join(
        [
            str(source.get("title") or ""),
            str(asset.get("condition_label") or ""),
            str(asset.get("caption") or ""),
            str(metadata.get("raw_label") or ""),
        ]
    )
    normalized_blob = normalize_text(text_blob)

    term_hits = sum(1 for term in search_terms if term and term in normalized_blob)
    condition_bonus = 0.0
    if condition_filters and condition_label in condition_filters:
        condition_bonus += 3.0
    if payload.breed and normalize_term(payload.breed) in normalized_blob:
        condition_bonus += 0.75
    if asset_domain and asset_domain == normalized_domain and normalized_domain:
        condition_bonus += 1.5

    return term_hits * 1.2 + condition_bonus


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "service": "image-retrieval-service",
        "mode": health_mode(),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
    }


@app.post("/search")
def search(payload: ImageRetrievalRequest, authorization: str | None = Header(default=None)):
    validate_auth(authorization)

    if STUB_MODE:
        return {"image_matches": [], "source_citations": []}

    sources = fetch_live_sources(payload)
    if not sources:
        return {"image_matches": [], "source_citations": []}

    search_terms = build_search_terms(payload)
    condition_filters = infer_condition_filters(payload)
    candidate_limit = max(payload.image_limit * 12, DEFAULT_CANDIDATE_LIMIT)

    try:
        assets = fetch_assets(list(sources.keys()), search_terms, condition_filters, candidate_limit)
    except Exception as error:
        logger.error("Asset query failed", exc_info=error)
        assets = []

    ranked: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
    for asset in assets:
        source = sources.get(str(asset.get("source_id") or ""))
        if not source:
            continue
        score = score_asset(asset, source, payload, search_terms, condition_filters)
        if score == float("-inf"):
            continue
        ranked.append((score, asset, source))

    ranked.sort(key=lambda item: item[0], reverse=True)
    top_rows = ranked[: max(1, payload.image_limit)]

    image_matches: list[dict[str, Any]] = []
    citations: list[str] = []
    for score, asset, source in top_rows:
        asset_domain = infer_asset_domain(asset, source)
        citation = str(source.get("dataset_url") or source.get("title") or "")
        citations.append(citation)
        condition_label = str(asset.get("condition_label") or "").replace("_", " ").strip()
        source_title = str(source.get("title") or "Reference image")
        summary_parts = [condition_label] if condition_label else []
        if asset.get("caption"):
            summary_parts.append(str(asset.get("caption")))

        image_matches.append(
            {
                "title": f"{source_title}: {condition_label}".strip(": "),
                "citation": citation or None,
                "score": round(score, 4),
                "summary": " - ".join(part for part in summary_parts if part) or source_title,
                "asset_url": asset.get("asset_url") or None,
                "domain": asset_domain,
                "condition_label": str(asset.get("condition_label") or "") or None,
                "dog_only": normalize_text((source.get("metadata") or {}).get("species_scope")) != "mixed",
            }
        )

    deduped_citations: list[str] = []
    seen_citations: set[str] = set()
    for citation in citations:
        if not citation or citation in seen_citations:
            continue
        seen_citations.add(citation)
        deduped_citations.append(citation)

    return {
        "image_matches": image_matches,
        "source_citations": deduped_citations[:10],
    }
