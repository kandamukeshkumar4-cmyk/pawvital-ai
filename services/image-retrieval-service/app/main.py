import logging
import os
import re
import io
from contextlib import asynccontextmanager
from typing import Any

import requests
from fastapi import FastAPI, Header, HTTPException
from PIL import Image
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
DEFAULT_CANDIDATE_LIMIT = int(os.getenv("IMAGE_RETRIEVAL_CANDIDATE_LIMIT", "60"))
IMAGE_RETRIEVAL_MODEL_NAME = os.getenv(
    "IMAGE_RETRIEVAL_MODEL_NAME",
    "microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224",
).strip()
IMAGE_MODEL_ENABLED = parse_bool_env("IMAGE_MODEL_ENABLED", default="true")
IMAGE_MODEL_MAX_ASSETS = int(os.getenv("IMAGE_MODEL_MAX_ASSETS", "12"))
IMAGE_FETCH_TIMEOUT_SECONDS = float(os.getenv("IMAGE_FETCH_TIMEOUT_SECONDS", "6"))
IMAGE_BOOTSTRAP_ASSET_LIMIT = int(os.getenv("IMAGE_BOOTSTRAP_ASSET_LIMIT", "24"))

CLIP_MODEL = None
CLIP_PREPROCESS = None
CLIP_TOKENIZER = None
CLIP_DEVICE = "cpu"
MODEL_LOAD_ATTEMPTED = False
MODEL_LOAD_ERROR: str | None = None
IMAGE_EMBED_CACHE: dict[str, list[float]] = {}
CACHE_WARM_ATTEMPTED = False
CACHE_WARMED_ASSET_COUNT = 0
CACHE_WARM_ERROR: str | None = None


class ImageRetrievalRequest(BaseModel):
    query: str
    domain: str | None = None
    breed: str | None = None
    condition_hints: list[str] = Field(default_factory=list)
    dog_only: bool = True
    image_limit: int = 4


@asynccontextmanager
async def lifespan(_: FastAPI):
    warm_image_cache()
    yield


app = FastAPI(
    title="image-retrieval-service",
    version="0.2.0",
    lifespan=lifespan,
)


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
    if not (SUPABASE_URL and SUPABASE_KEY):
        return "degraded"
    if FORCE_FALLBACK:
        return "forced_fallback"
    if CLIP_MODEL is not None and CLIP_PREPROCESS is not None and CLIP_TOKENIZER is not None:
        return "live_with_models"
    if not IMAGE_MODEL_ENABLED or MODEL_LOAD_ERROR:
        return "live_with_fallback"
    return "live_pending_model_load"


def model_backend_enabled() -> bool:
    return IMAGE_MODEL_ENABLED and not STUB_MODE and not FORCE_FALLBACK


def default_fallback_reason() -> str | None:
    if STUB_MODE:
        return "stub_mode"
    if FORCE_FALLBACK:
        return "force_fallback"
    if not IMAGE_MODEL_ENABLED:
        return "image_model_disabled"
    if MODEL_LOAD_ERROR:
        return "model_load_failed"
    return None


def build_response_meta(mode: str, fallback_reason: str | None) -> dict[str, Any]:
    return {
        "retrieval_mode": mode,
        "fallback_reason": fallback_reason,
    }


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


def build_query_text(payload: ImageRetrievalRequest) -> str:
    parts = dedupe_terms(
        [
            payload.query,
            *(payload.condition_hints or []),
            payload.domain or "",
            payload.breed or "",
            "dog veterinary reference image",
        ]
    )
    return ", ".join(parts)


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


def load_biomedclip():
    global CLIP_MODEL, CLIP_PREPROCESS, CLIP_TOKENIZER, CLIP_DEVICE, MODEL_LOAD_ATTEMPTED, MODEL_LOAD_ERROR

    if MODEL_LOAD_ATTEMPTED:
        return CLIP_MODEL, CLIP_PREPROCESS, CLIP_TOKENIZER

    MODEL_LOAD_ATTEMPTED = True

    if not model_backend_enabled():
        return None, None, None

    try:
        import open_clip
        import torch

        CLIP_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
        model, preprocess = open_clip.create_model_from_pretrained(
            f"hf-hub:{IMAGE_RETRIEVAL_MODEL_NAME}"
        )
        tokenizer = open_clip.get_tokenizer(f"hf-hub:{IMAGE_RETRIEVAL_MODEL_NAME}")
        model = model.to(CLIP_DEVICE)
        model.eval()

        CLIP_MODEL = model
        CLIP_PREPROCESS = preprocess
        CLIP_TOKENIZER = tokenizer
        MODEL_LOAD_ERROR = None
        logger.info(
            "Loaded image retrieval model=%s device=%s",
            IMAGE_RETRIEVAL_MODEL_NAME,
            CLIP_DEVICE,
        )
    except Exception as error:
        MODEL_LOAD_ERROR = str(error)
        CLIP_MODEL = None
        CLIP_PREPROCESS = None
        CLIP_TOKENIZER = None
        logger.warning("Falling back to deterministic image retrieval", exc_info=error)

    return CLIP_MODEL, CLIP_PREPROCESS, CLIP_TOKENIZER


def load_candidate_image(asset: dict[str, Any]) -> Image.Image | None:
    local_path = str(asset.get("local_path") or "").strip()
    if local_path and os.path.exists(local_path):
        try:
            return Image.open(local_path).convert("RGB")
        except Exception:
            return None

    asset_url = str(asset.get("asset_url") or "").strip()
    if asset_url.startswith("http://") or asset_url.startswith("https://"):
        try:
            response = requests.get(asset_url, timeout=IMAGE_FETCH_TIMEOUT_SECONDS)
            response.raise_for_status()
            return Image.open(io.BytesIO(response.content)).convert("RGB")
        except Exception:
            return None

    return None


def get_cached_image_embedding(asset: dict[str, Any]) -> list[float] | None:
    cache_key = str(asset.get("id") or asset.get("local_path") or asset.get("asset_url") or "")
    if not cache_key:
        return None
    return IMAGE_EMBED_CACHE.get(cache_key)


def set_cached_image_embedding(asset: dict[str, Any], embedding: list[float]) -> None:
    cache_key = str(asset.get("id") or asset.get("local_path") or asset.get("asset_url") or "")
    if not cache_key:
        return
    IMAGE_EMBED_CACHE[cache_key] = embedding


def compute_asset_features(model: Any, preprocess: Any, asset: dict[str, Any]) -> Any | None:
    import torch

    cached_embedding = get_cached_image_embedding(asset)
    if cached_embedding is not None:
        return torch.tensor([cached_embedding], device=CLIP_DEVICE)

    image = load_candidate_image(asset)
    if image is None:
        return None

    image_tensor = preprocess(image).unsqueeze(0).to(CLIP_DEVICE)
    image_features = model.encode_image(image_tensor)
    image_features = image_features / image_features.norm(dim=-1, keepdim=True)
    set_cached_image_embedding(
        asset,
        image_features.squeeze(0).detach().cpu().tolist(),
    )
    return image_features


def prime_asset_embeddings(assets: list[dict[str, Any]]) -> int:
    model, preprocess, _ = load_biomedclip()
    if not model or not preprocess:
        return 0

    import torch

    warmed = 0
    with torch.no_grad():
        for asset in assets:
            if get_cached_image_embedding(asset) is not None:
                continue
            if compute_asset_features(model, preprocess, asset) is None:
                continue
            warmed += 1
    return warmed


def warm_image_cache() -> None:
    global CACHE_WARM_ATTEMPTED, CACHE_WARMED_ASSET_COUNT, CACHE_WARM_ERROR

    CACHE_WARM_ATTEMPTED = True
    CACHE_WARMED_ASSET_COUNT = 0
    CACHE_WARM_ERROR = None

    if not model_backend_enabled() or not (SUPABASE_URL and SUPABASE_KEY):
        return

    payload = ImageRetrievalRequest(
        query="",
        domain=None,
        breed=None,
        condition_hints=[],
        dog_only=True,
        image_limit=IMAGE_BOOTSTRAP_ASSET_LIMIT,
    )

    try:
        sources = fetch_live_sources(payload)
        if not sources:
            return
        assets = fetch_assets(
            list(sources.keys()),
            [],
            [],
            IMAGE_BOOTSTRAP_ASSET_LIMIT,
        )
        CACHE_WARMED_ASSET_COUNT = prime_asset_embeddings(assets)
    except Exception as error:
        CACHE_WARM_ERROR = str(error)
        logger.warning("Image cache warm failed", exc_info=error)


def rerank_assets_with_model(
    payload: ImageRetrievalRequest,
    ranked_rows: list[tuple[float, dict[str, Any], dict[str, Any]]],
) -> tuple[list[tuple[float, dict[str, Any], dict[str, Any]]], dict[str, Any]]:
    if not model_backend_enabled():
        return ranked_rows, build_response_meta(
            "deterministic_fallback",
            default_fallback_reason() or "model_backend_disabled",
        )

    model, preprocess, tokenizer = load_biomedclip()
    if not model or not preprocess or not tokenizer:
        return ranked_rows, build_response_meta(
            "deterministic_fallback",
            default_fallback_reason() or "model_unavailable",
        )

    model_rows = ranked_rows[: max(1, IMAGE_MODEL_MAX_ASSETS)]
    remainder = ranked_rows[max(1, IMAGE_MODEL_MAX_ASSETS) :]
    if not model_rows:
        return ranked_rows, build_response_meta("model", None)

    try:
        import torch

        query_text = build_query_text(payload)
        with torch.no_grad():
            text_tokens = tokenizer([query_text]).to(CLIP_DEVICE)
            text_features = model.encode_text(text_tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            rescored: list[tuple[float, dict[str, Any], dict[str, Any]]] = []
            for base_score, asset, source in model_rows:
                image_features = compute_asset_features(model, preprocess, asset)
                if image_features is None:
                    rescored.append((base_score, asset, source))
                    continue

                clip_similarity = float((image_features @ text_features.T).squeeze().item())
                combined_score = base_score + clip_similarity * 5.0
                rescored.append((combined_score, asset, source))

        rescored.sort(key=lambda item: item[0], reverse=True)
        return rescored + remainder, build_response_meta("model", None)
    except Exception as error:
        logger.warning("Model image reranking failed; using deterministic ranking", exc_info=error)
        return ranked_rows, build_response_meta("deterministic_fallback", "clip_rerank_failed")


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


def normalize_output_scores(scores: list[float]) -> list[float]:
    if not scores:
        return []

    if all(0.0 <= score <= 1.0 for score in scores):
        return [round(score, 4) for score in scores]

    highest = max(scores)
    lowest = min(scores)
    if highest == lowest:
        baseline = 0.85 if highest > 0 else 0.0
        return [round(baseline, 4) for _ in scores]

    spread = highest - lowest
    return [
        round(0.2 + 0.75 * ((score - lowest) / spread), 4)
        for score in scores
    ]


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "service": "image-retrieval-service",
        "mode": health_mode(),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
        "fallback": {
            "stub_mode": STUB_MODE,
            "force_fallback": FORCE_FALLBACK,
            "reason": default_fallback_reason(),
        },
        "model_backend_enabled": model_backend_enabled(),
        "model_name": IMAGE_RETRIEVAL_MODEL_NAME,
        "model_load_error": MODEL_LOAD_ERROR,
        "models": {
            "enabled": IMAGE_MODEL_ENABLED,
            "backend_enabled": model_backend_enabled(),
            "load_attempted": MODEL_LOAD_ATTEMPTED,
            "loaded": CLIP_MODEL is not None and CLIP_PREPROCESS is not None and CLIP_TOKENIZER is not None,
            "model_name": IMAGE_RETRIEVAL_MODEL_NAME,
            "load_error": MODEL_LOAD_ERROR,
        },
        "cache": {
            "warm_attempted": CACHE_WARM_ATTEMPTED,
            "warmed_asset_count": CACHE_WARMED_ASSET_COUNT,
            "cached_asset_count": len(IMAGE_EMBED_CACHE),
            "warm_error": CACHE_WARM_ERROR,
        },
    }


@app.post("/search")
def search(payload: ImageRetrievalRequest, authorization: str | None = Header(default=None)):
    validate_auth(authorization)

    if STUB_MODE:
        return {
            "image_matches": [],
            "source_citations": [],
            **build_response_meta("stub", "stub_mode"),
            "candidate_source": None,
            "candidate_count": 0,
        }

    sources = fetch_live_sources(payload)
    if not sources:
        return {
            "image_matches": [],
            "source_citations": [],
            **build_response_meta("deterministic_fallback", "no_live_sources"),
            "candidate_source": "none",
            "candidate_count": 0,
        }

    search_terms = build_search_terms(payload)
    condition_filters = infer_condition_filters(payload)
    candidate_limit = max(payload.image_limit * 12, DEFAULT_CANDIDATE_LIMIT)
    candidate_source = "supabase_live_assets"

    try:
        assets = fetch_assets(list(sources.keys()), search_terms, condition_filters, candidate_limit)
    except Exception as error:
        logger.error("Asset query failed", exc_info=error)
        assets = []
        candidate_source = "asset_query_error"

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
    ranked, response_meta = rerank_assets_with_model(payload, ranked)
    top_rows = ranked[: max(1, payload.image_limit)]
    normalized_scores = normalize_output_scores([score for score, _, _ in top_rows])

    image_matches: list[dict[str, Any]] = []
    citations: list[str] = []
    for index, (_, asset, source) in enumerate(top_rows):
        output_score = normalized_scores[index]
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
                "score": output_score,
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
        **response_meta,
        "candidate_source": candidate_source,
        "candidate_count": len(assets),
    }
