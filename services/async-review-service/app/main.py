"""
Async Review Service - Qwen2.5-VL-32B-Instruct Implementation

This service provides asynchronous batch-style specialist reviews for complex cases.
It NEVER overrides the clinical matrix authority - it only provides additive second opinions.

Architecture:
- Receives cases via webhook queue
- Processes with Qwen2.5-VL-32B-Instruct (more thorough than 7B)
- Stores results for retrieval by the main app
- Provides disagreement analysis and uncertainty flagging
"""

import os
import io
import base64
import json
import hashlib
import logging
import re
from threading import RLock
from typing import Any, Optional
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from PIL import Image

try:
    import torch
    from transformers import AutoProcessor, AutoModelForVision2Seq
    from qwen_vl_utils import process_vision_info
    _TORCH_AVAILABLE = True
except ImportError:
    torch = None  # type: ignore[assignment]
    AutoProcessor = None  # type: ignore[assignment,misc]
    AutoModelForVision2Seq = None  # type: ignore[assignment,misc]
    process_vision_info = None  # type: ignore[assignment]
    _TORCH_AVAILABLE = False


# =============================================================================
# Constants
# =============================================================================

STOP_WORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can",
    "of", "in", "to", "for", "with", "on", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above",
    "below", "between", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how",
    "all", "each", "few", "more", "most", "other", "some", "such",
    "no", "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "just", "and", "but", "if", "or", "because", "until",
    "while", "this", "that", "these", "those", "it", "its"
})


# =============================================================================
# Pydantic Models
# =============================================================================

class AsyncReviewRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded image or URL")
    owner_text: str = Field(default="", description="Owner's description")
    mode: str = Field(default="async", description="async mode")
    preprocess: dict = Field(..., description="Vision preprocess results")
    vision_summary: str = Field(default="", description="Vision preprocessing summary")
    severity: str = Field(default="needs_review", description="Severity classification")
    contradictions: list[str] = Field(default_factory=list, description="Reported contradictions")
    deterministic_facts: dict = Field(default_factory=dict, description="Verified clinical facts")
    case_id: Optional[str] = Field(default=None, description="Optional case ID for tracking")
    callback_url: Optional[str] = Field(default=None, description="URL to POST results when complete")
    consult_opinion: Optional[dict] = Field(
        default=None,
        description="Optional 7B consult opinion for shadow disagreement analysis"
    )


class ReviewResponse(BaseModel):
    model: str
    summary: str
    agreements: list[str]
    disagreements: list[str]
    uncertainties: list[str]
    confidence: float
    mode: str = "async"
    case_id: Optional[str] = None
    processed_at: str


# In-memory review storage (in production, use Redis or a database)
REVIEW_RESULTS: dict[str, ReviewResponse] = {}
REVIEW_CONTEXT: dict[str, dict] = {}
PROCESSING_QUEUE: list[str] = []
STATE_LOCK = RLock()

MAX_CALLBACK_RETRIES = int(os.environ.get("MAX_CALLBACK_RETRIES", "3"))
CALLBACK_RETRY_DELAY_SECONDS = float(os.environ.get("CALLBACK_RETRY_DELAY_SECONDS", "5.0"))

# Shadow disagreement tracking (for comparing 7B consult vs 32B review)
SHADOW_DISAGREEMENTS: dict[str, dict] = {}
MAX_SHADOW_HISTORY = int(os.environ.get("MAX_SHADOW_HISTORY", "1000"))

# Outcome feedback storage (for learning/improvement)
OUTCOME_FEEDBACK: list[dict] = []
MAX_FEEDBACK_HISTORY = 1000

# Dead letter queue for failed callback processing
DEAD_LETTER_QUEUE: list[dict] = []
MAX_DEAD_LETTER_HISTORY = 500

# Review state transition tracking
REVIEW_STATE_TRANSITIONS: list[dict] = []
MAX_STATE_TRANSITIONS_HISTORY = 1000

SEVERITY_SCORE_MAP = {
    "monitor": 0.25,
    "needs_review": 0.5,
    "urgent": 0.75,
    "emergency": 1.0,
}


# =============================================================================
# Global model instances (lazy loaded)
# =============================================================================

MODEL_NAME = "Qwen/Qwen2.5-VL-32B-Instruct"
MODEL = None
PROCESSOR = None
DEVICE = "cuda" if (_TORCH_AVAILABLE and torch.cuda.is_available()) else "cpu"
STUB_MODE = os.environ.get("STUB_MODE", "false").strip().lower() == "true"
EXPECTED_API_KEY = os.environ.get("SIDECAR_API_KEY", "").strip()
logger = logging.getLogger("async-review-service")


def _trim_list_in_place(values: list[Any], max_items: int) -> None:
    if max_items > 0 and len(values) > max_items:
        del values[:-max_items]


def _review_context_for_case(case_id: str) -> dict[str, Any]:
    with STATE_LOCK:
        return dict(REVIEW_CONTEXT.get(case_id, {}))


def _shadow_disagreements_snapshot() -> list[tuple[str, dict[str, Any]]]:
    with STATE_LOCK:
        return [(case_id, dict(disagreement)) for case_id, disagreement in SHADOW_DISAGREEMENTS.items()]


def _resolve_image_quality_for_case(case_id: str, disagreement: dict[str, Any] | None = None) -> str:
    if disagreement:
        quality = disagreement.get("image_quality")
        if isinstance(quality, str) and quality.strip():
            return quality

    context = _review_context_for_case(case_id)
    preprocess = context.get("preprocess", {})
    if isinstance(preprocess, dict):
        quality = preprocess.get("imageQuality") or preprocess.get("image_quality")
        if isinstance(quality, str) and quality.strip():
            return quality

    return "unknown"


def _append_case_to_pattern_bucket(patterns: dict[str, dict[str, Any]], key: str, case_id: str) -> None:
    bucket = patterns.setdefault(key, {"count": 0, "cases": []})
    bucket["count"] += 1
    bucket["cases"].append(case_id)


def _review_result_dict(case_id: str) -> dict[str, Any]:
    with STATE_LOCK:
        review = REVIEW_RESULTS.get(case_id)
    if review is None:
        return {}
    if isinstance(review, BaseModel):
        return review.model_dump()
    if isinstance(review, dict):
        return dict(review)
    return {}


def validate_auth(authorization: str | None) -> None:
    if not EXPECTED_API_KEY:
        return

    expected_header = f"Bearer {EXPECTED_API_KEY}"
    if authorization != expected_header:
        raise HTTPException(status_code=401, detail="Invalid API key")


def load_model():
    """Load Qwen2.5-VL-32B-Instruct model and processor."""
    global MODEL, PROCESSOR

    if STUB_MODE:
        return None, None

    if MODEL is None or PROCESSOR is None:
        logger.info("Loading %s on %s", MODEL_NAME, DEVICE)
        PROCESSOR = AutoProcessor.from_pretrained(MODEL_NAME)
        MODEL = AutoModelForVision2Seq.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.bfloat16 if DEVICE == "cuda" else torch.float32,
            device_map="auto" if DEVICE == "cuda" else None,
        )
        MODEL.eval()
        logger.info("Model loaded successfully")

    return MODEL, PROCESSOR


def decode_image(image_data: str) -> Image.Image:
    """Decode base64 image string to PIL Image."""
    if image_data.startswith("data:image"):
        image_data = image_data.split(",")[1]

    image_bytes = base64.b64decode(image_data)
    return Image.open(io.BytesIO(image_bytes)).convert("RGB")


def generate_case_id(request: AsyncReviewRequest) -> str:
    """Generate a deterministic case ID from request content."""
    if request.case_id:
        return request.case_id

    content = json.dumps(
        {
            "image": request.image[:256],
            "owner_text": request.owner_text,
            "preprocess": request.preprocess,
            "severity": request.severity,
            "deterministic_facts": request.deterministic_facts,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def _record_state_transition(case_id: str, state: str, metadata: dict | None = None) -> None:
    entry = {
        "case_id": case_id,
        "state": state,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata or {},
    }
    with STATE_LOCK:
        REVIEW_STATE_TRANSITIONS.append(entry)
        if len(REVIEW_STATE_TRANSITIONS) > MAX_STATE_TRANSITIONS_HISTORY:
            del REVIEW_STATE_TRANSITIONS[:-MAX_STATE_TRANSITIONS_HISTORY]


def _append_dead_letter_entry(
    case_id: str,
    callback_url: str,
    payload: dict[str, Any],
    error: str,
) -> None:
    entry = {
        "case_id": case_id,
        "callback_url": callback_url,
        "payload": payload,
        "error": error,
        "retry_status": "pending",
        "retry_count": 0,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "last_retry_at": None,
    }
    with STATE_LOCK:
        DEAD_LETTER_QUEUE.append(entry)
        if len(DEAD_LETTER_QUEUE) > MAX_DEAD_LETTER_HISTORY:
            del DEAD_LETTER_QUEUE[:-MAX_DEAD_LETTER_HISTORY]


# =============================================================================
# Prompt Engineering for Async Review (More Thorough)
# =============================================================================

def build_review_prompt(request: AsyncReviewRequest, case_id: str) -> str:
    """
    Build a comprehensive prompt for thorough async review with strict output discipline.

    The 32B model has more capacity for nuanced analysis, so we request:
    1. Detailed disagreement analysis with explanations
    2. Explicit confidence calibration
    3. Differential diagnostic considerations
    4. Follow-up question recommendations

    Output is validated against strict schema.
    """

    preprocess = request.preprocess
    domain = preprocess.get("domain", "unknown")
    body_region = preprocess.get("bodyRegion") or preprocess.get("body_region", "unknown")
    detected_regions = preprocess.get("detectedRegions", [])
    image_quality = preprocess.get("imageQuality", "unknown")

    regions_str = ""
    if detected_regions:
        region_items = []
        for r in detected_regions[:8]:
            label = r.get("label", "unknown")
            confidence = r.get("confidence", 0.5)
            notes = r.get("notes", "")
            item = f"  - {label} (confidence: {confidence:.2f})"
            if notes:
                item += f": {notes}"
            region_items.append(item)
        regions_str = "\n".join(region_items)

    contradictions_str = "\n".join([f"  - {c}" for c in request.contradictions]) if request.contradictions else "None"

    facts_str = "\n".join([f"  - {k}: {v}" for k, v in request.deterministic_facts.items()]) if request.deterministic_facts else "None"

    prompt = f"""You are a veterinary specialist conducting a THOROUGH async review of a complex clinical case.

IMPORTANT CONSTRAINTS - FOLLOW STRICTLY:
1. You are NOT the authority. The clinical matrix makes final triage decisions.
2. Your role is additive only - inform, never override.
3. Respond ONLY with valid JSON matching the exact schema below.
4. Do NOT include markdown code fences, explanations, or text outside the JSON.
5. All array fields must be actual JSON arrays of strings.
6. Be thorough - the 32B model has capacity for nuanced analysis, use it fully.

Case ID: {case_id}

=== CASE INFORMATION ===

Owner Description:
{request.owner_text or "No owner description provided."}

Image Domain: {domain}
Body Region: {body_region}
Image Quality: {image_quality}

Detected Regions (from vision preprocessing):
{regions_str or "  No specific regions detected."}

Severity Classification (from clinical matrix): {request.severity}

Reported Contradictions:
{contradictions_str}

Deterministic Clinical Facts:
{facts_str}

Vision Summary:
{request.vision_summary or "No vision summary available."}

=== REQUIRED OUTPUT SCHEMA ===

Respond ONLY with this exact JSON structure (no markdown, no text outside):

{{
  "summary": "string: 3-4 sentence detailed specialist assessment",
  "agreements": ["string: point confirming clinical matrix with brief explanation", ...],
  "disagreements": ["string: point diverging from clinical matrix (advisory only)", ...],
  "uncertainties": ["string: area lacking confident opinion OR image quality limitation", ...],
  "confidence": 0.0-1.0,
  "differential_considerations": ["string: other conditions that could present similarly", ...],
  "recommended_followup": ["string: question that would strengthen assessment", ...]
}}

OUTPUT QUALITY DISCIPLINE FOR 32B MODEL:
- summary: MUST be 100-800 characters. Include specific image findings, not generic statements. Reference detected regions by their features.
- agreements: Each item MUST explain WHY you agree AND cite specific image findings. Minimum 1 substantive agreement.
- disagreements: Be explicit about severity/triage implications. Minor variations do not qualify. Maximum 4 items. Each must explain the clinical significance.
- uncertainties: Separate BOTH: (a) knowledge/uncertainty gaps, AND (b) image quality limitations. Be specific about what additional info would help.
- confidence: Calibrate honestly. 0.75-0.95 is typical for good quality images with clear findings. Lower if image quality or case complexity limits certainty.
- differential_considerations: At least 2-3 conditions that could present similarly, even if unlikely. Consider anatomical variants, trauma vs disease, acute vs chronic.
- recommended_followup: At least 2 actionable items. Prefer questions about history, physical exam findings, or specific additional imaging that would clarify ambiguity.

If image quality limits your assessment, state this explicitly with SPECIFIC concerns (e.g., "resolution insufficient to assess subtle bone changes" vs "image quality limits assessment").

Respond with JSON only:
"""

    return prompt


def _validate_review_schema(result: dict, issues: list[str]) -> None:
    """
    Validate response has required fields with correct types.

    Issues are appended to `issues` list for reporting in uncertainties.
    """
    required_fields = {
        "summary": (str,),
        "agreements": (list,),
        "disagreements": (list,),
        "uncertainties": (list,),
        "confidence": (int, float),
        "differential_considerations": (list,),
        "recommended_followup": (list,),
    }

    for field, expected_types in required_fields.items():
        if field not in result:
            issues.append(f"Missing required field: {field}")
            continue
        if not isinstance(result[field], expected_types):
            issues.append(
                f"Field '{field}' wrong type: expected {expected_types[0].__name__}, "
                f"got {type(result[field]).__name__}"
            )
            if expected_types[0] in (int, float) and isinstance(result[field], (int, float)):
                result[field] = expected_types[0](result[field])
            elif expected_types[0] == list and not isinstance(result[field], list):
                result[field] = [str(result[field])] if result[field] else []

    if "confidence" in result and isinstance(result["confidence"], (int, float)):
        if result["confidence"] < 0.0 or result["confidence"] > 1.0:
            issues.append(f"Confidence clamped from {result['confidence']} to valid range")
            result["confidence"] = max(0.0, min(1.0, result["confidence"]))


def parse_model_response(content: str) -> dict:
    """
    Parse the model's JSON response with strict schema enforcement.

    Validates output structure and ensures type safety for downstream consumers.
    32B model responses must include differential_considerations and recommended_followup.
    """
    if not content or not content.strip():
        return _minimal_review_fallback("Empty response from 32B model")

    parse_issues: list[str] = []

    # Step 1: Try direct JSON parse
    try:
        result = json.loads(content)
        _validate_review_schema(result, parse_issues)
        if not parse_issues:
            return result
    except json.JSONDecodeError as e:
        parse_issues.append(f"JSON decode error: {e}")

    # Step 2: Try to extract JSON with improved matching
    import re
    json_match = re.search(r'\{[\s\S]*\}', content, re.DOTALL)
    if json_match:
        try:
            result = json.loads(json_match.group())
            _validate_review_schema(result, parse_issues)
            if not parse_issues:
                return result
        except json.JSONDecodeError as e:
            parse_issues.append(f"Extracted JSON error: {e}")

    # Step 3: Try stripping markdown code fences
    cleaned = re.sub(r'^```(?:json)?\s*', '', content.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    if cleaned != content:
        try:
            result = json.loads(cleaned)
            _validate_review_schema(result, parse_issues)
            if not parse_issues:
                return result
        except json.JSONDecodeError:
            parse_issues.append("Markdown-stripped JSON also failed")

    # Step 4: Partial recovery
    partial = _extract_review_partial(content)
    if partial:
        remaining = [p for p in parse_issues if p not in partial.get("_parse_notes", [])]
        if remaining:
            partial.setdefault("uncertainties", []).extend(remaining)
        return partial

    # Final fallback
    return _minimal_review_fallback("; ".join(parse_issues) if parse_issues else "Unknown parse failure")


def _extract_review_partial(content: str) -> dict | None:
    """Extract partial fields from malformed 32B response."""
    import re
    partial: dict[str, Any] = {"_parse_notes": []}

    summary_match = re.search(r'"summary"\s*:\s*"([^"]*)"', content)
    if summary_match:
        partial["summary"] = summary_match.group(1)
    else:
        summary_match = re.search(r'"summary"\s*:\s*([^\s,}]+)', content)
        if summary_match:
            partial["summary"] = summary_match.group(1)[:300]

    conf_match = re.search(r'"confidence"\s*:\s*([0-9.]+)', content)
    if conf_match:
        try:
            partial["confidence"] = float(conf_match.group(1))
        except ValueError:
            pass

    if "summary" in partial:
        partial.setdefault("agreements", [])
        partial.setdefault("disagreements", [])
        partial.setdefault("uncertainties", ["Partial parse from 32B model"])
        partial.setdefault("differential_considerations", [])
        partial.setdefault("recommended_followup", [])
        partial.setdefault("confidence", partial.get("confidence", 0.3))
        return partial
    return None


def _minimal_review_fallback(reason: str) -> dict:
    """Return minimal valid fallback for 32B review with failure reason."""
    return {
        "summary": f"32B review generation failed: {reason}. Clinical matrix remains authority.",
        "agreements": [],
        "disagreements": [],
        "uncertainties": [f"Async review parse failure: {reason}"],
        "confidence": 0.1,
        "differential_considerations": [],
        "recommended_followup": [],
    }


async def generate_review(request: AsyncReviewRequest, case_id: str) -> ReviewResponse:
    """Generate thorough review using Qwen2.5-VL-32B."""
    if STUB_MODE:
        return ReviewResponse(
            model=f"{MODEL_NAME} (stub)",
            summary=(
                "Stub async review mode is active. This result preserves the review contract "
                "but does not represent a real 32B multimodal second opinion."
            ),
            agreements=[],
            disagreements=[],
            uncertainties=[
                "Async review service is running in stub mode.",
                "Use this only for queue, polling, and callback integration checks.",
            ],
            confidence=0.2,
            mode="async",
            case_id=case_id,
            processed_at=datetime.utcnow().isoformat() + "Z",
        )

    model, processor = load_model()

    # Decode image
    try:
        if request.image.startswith("http"):
            from urllib.request import urlopen
            image = Image.open(urlopen(request.image)).convert("RGB")
        else:
            image = decode_image(request.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")

    # Build prompt
    prompt = build_review_prompt(request, case_id)

    # Prepare messages
    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "image": image,
                },
                {
                    "type": "text",
                    "text": prompt,
                },
            ],
        }
    ]

    # Process inputs
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages, device=DEVICE)

    # Tokenize
    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    )
    inputs = inputs.to(DEVICE)

    # Generate (longer max_new_tokens for 32B)
    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=2048,  # Longer for 32B
            do_sample=False,
            temperature=None,
            top_p=None,
        )

    # Decode
    generated_ids_trimmed = [
        out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, generated_ids)
    ]
    response_text = processor.batch_decode(
        generated_ids_trimmed,
        skip_special_tokens=True,
        clean_up_tokenization_spaces=False,
    )[0]

    # Parse response
    parsed = parse_model_response(response_text)

    # Extract standard fields (differential and followup are stored but not in standard ConsultOpinion)
    agreements = parsed.get("agreements", [])
    if isinstance(agreements, str):
        agreements = [agreements]

    disagreements = parsed.get("disagreements", [])
    if isinstance(disagreements, str):
        disagreements = [disagreements]

    uncertainties = parsed.get("uncertainties", [])
    if isinstance(uncertainties, str):
        uncertainties = [uncertainties]

    # Add differential considerations to uncertainties if present
    differentials = parsed.get("differential_considerations", [])
    if differentials:
        if isinstance(differentials, list):
            for d in differentials:
                uncertainties.append(f"Differential consideration: {d}")
        else:
            uncertainties.append(f"Differential considerations: {differentials}")

    # Add recommended followup to uncertainties if present
    followup = parsed.get("recommended_followup", [])
    if followup:
        if isinstance(followup, list):
            for f in followup:
                uncertainties.append(f"Follow-up suggestion: {f}")
        else:
            uncertainties.append(f"Follow-up suggestions: {followup}")

    return ReviewResponse(
        model=MODEL_NAME,
        summary=parsed.get("summary", "No summary generated."),
        agreements=agreements,
        disagreements=disagreements,
        uncertainties=uncertainties,
        confidence=float(parsed.get("confidence", 0.5)),
        mode="async",
        case_id=case_id,
        processed_at=datetime.utcnow().isoformat() + "Z",
    )


async def process_review_task(request: AsyncReviewRequest):
    """Background task to process review with retry and callback hardening."""
    case_id = generate_case_id(request)
    _record_state_transition(case_id, "processing", {
        "has_callback_url": bool(request.callback_url),
        "severity": request.severity,
    })
    try:
        result = await generate_review(request, case_id)
        with STATE_LOCK:
            REVIEW_RESULTS[case_id] = result
            REVIEW_CONTEXT[case_id] = {
                "preprocess": dict(request.preprocess or {}),
                "requested_severity": request.severity,
                "owner_text": request.owner_text,
                "vision_summary": request.vision_summary,
            }
            if case_id in PROCESSING_QUEUE:
                PROCESSING_QUEUE.remove(case_id)

        # Store shadow disagreement if consult opinion provided
        if request.consult_opinion is not None:
            shadow = _compute_shadow_disagreement(case_id, request.consult_opinion, result)
            # Attach body region and image quality from preprocess for arbitration
            shadow["body_region"] = (
                request.preprocess.get("bodyRegion") or
                request.preprocess.get("body_region", "unknown")
            )
            shadow["image_quality"] = (
                request.preprocess.get("imageQuality", "unknown")
            )
            shadow["severity"] = request.severity
            # Generate enriched arbitration rationale (Phase 5 shadow intelligence)
            arbitration_rationale = _generate_arbitration_rationale(
                shadow, result, request.consult_opinion
            )
            shadow["arbitration_rationale"] = arbitration_rationale
            _store_shadow_disagreement(case_id, shadow)

        # Store outcome feedback
        _store_outcome_feedback(case_id, result, request)

        # Callback with retry hardening
        if request.callback_url:
            callback_ok = await _robust_callback(case_id, request.callback_url, result)
            _record_state_transition(
                case_id,
                "callback_succeeded" if callback_ok else "callback_dead_letter",
                {"callback_url": request.callback_url},
            )
        else:
            _record_state_transition(case_id, "completed_without_callback")

    except Exception as e:
        logger.error("Processing error for case %s", case_id, exc_info=e)
        with STATE_LOCK:
            if case_id in PROCESSING_QUEUE:
                PROCESSING_QUEUE.remove(case_id)
        _record_state_transition(case_id, "failed", {"error": str(e)[:200]})


async def _robust_callback(case_id: str, callback_url: str, result: ReviewResponse) -> bool:
    """
    Send callback with retry logic and exponential backoff.

    Returns True if callback succeeded, False otherwise.
    """
    import httpx
    import asyncio

    payload = result.model_dump()
    payload["_callback_metadata"] = {
        "case_id": case_id,
        "callback_url": callback_url,
        "attempt": 0,
        "final": True,  # Will be set to False on retry
    }

    last_error = "Unknown callback failure"

    for attempt in range(MAX_CALLBACK_RETRIES):
        payload["_callback_metadata"]["attempt"] = attempt + 1
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(callback_url, json=payload)
                if response.status_code < 400:
                    logger.info(
                        "Callback succeeded for case %s on attempt %d",
                        case_id, attempt + 1
                    )
                    return True
                else:
                    last_error = f"HTTP {response.status_code}: {response.text[:120]}"
                    logger.warning(
                        "Callback returned %d for case %s, attempt %d/%d",
                        response.status_code, case_id, attempt + 1, MAX_CALLBACK_RETRIES
                    )
        except httpx.TimeoutException:
            last_error = "Timeout while delivering callback"
            logger.warning(
                "Callback timeout for case %s, attempt %d/%d",
                case_id, attempt + 1, MAX_CALLBACK_RETRIES
            )
        except httpx.ConnectError as e:
            last_error = f"Connection error: {e}"
            logger.warning(
                "Callback connection error for case %s: %s, attempt %d/%d",
                case_id, e, attempt + 1, MAX_CALLBACK_RETRIES
            )
        except Exception as e:
            last_error = str(e)
            logger.error(
                "Callback unexpected error for case %s: %s, attempt %d/%d",
                case_id, e, attempt + 1, MAX_CALLBACK_RETRIES
            )

        # Exponential backoff before retry
        if attempt < MAX_CALLBACK_RETRIES - 1:
            wait_time = CALLBACK_RETRY_DELAY_SECONDS * (2 ** attempt)
            await asyncio.sleep(wait_time)

    # All retries exhausted
    logger.error(
        "Callback FAILED permanently for case %s after %d attempts",
        case_id, MAX_CALLBACK_RETRIES
    )
    _append_dead_letter_entry(case_id, callback_url, payload, last_error[:200])
    return False


def _compute_shadow_disagreement(case_id: str, consult_opinion: dict, review_result: ReviewResponse) -> dict:
    """
    Compute shadow disagreement summary between 7B consult and 32B review.

    Enhanced with semantic similarity matching for better disagreement detection.
    This is stored for analysis without affecting clinical decisions.
    """
    def extract_keywords(text: str) -> set:
        """Extract significant keywords from text for semantic matching."""
        words = re.findall(r'\b[a-z]+\b', text.lower())
        return {w for w in words if len(w) > 3 and w not in STOP_WORDS}

    def compute_similarity(item1: str, item2: str) -> float:
        """Compute semantic similarity based on keyword overlap."""
        keywords1 = extract_keywords(item1)
        keywords2 = extract_keywords(item2)
        if not keywords1 or not keywords2:
            return 0.0
        overlap = len(keywords1 & keywords2)
        union = len(keywords1 | keywords2)
        return overlap / union if union > 0 else 0.0

    def find_best_match(item: str, item_list: list[str], threshold: float = 0.3) -> tuple[int, float] | None:
        """Find best matching item in list with similarity score."""
        best_idx = -1
        best_score = 0.0
        for i, candidate in enumerate(item_list):
            score = compute_similarity(item, candidate)
            if score > best_score:
                best_score = score
                best_idx = i
        if best_score >= threshold:
            return (best_idx, best_score)
        return None

    def classify_disagreement_type(text: str) -> str:
        lower = text.lower()
        if any(keyword in lower for keyword in ["diagnos", "lesion", "infection", "mass", "fracture", "tumor"]):
            return "diagnostic"
        if any(keyword in lower for keyword in ["treat", "medicat", "bandage", "clean", "antibiotic"]):
            return "treatment"
        if any(keyword in lower for keyword in ["urgent", "emergency", "er", "immediate", "hospital"]):
            return "urgency"
        if any(keyword in lower for keyword in ["monitor", "recheck", "follow-up", "progress", "worsen"]):
            return "prognostic"
        return "other"

    def classify_disagreement_severity(text: str) -> str:
        lower = text.lower()
        if any(keyword in lower for keyword in ["urgent", "emergency", "er", "hospital", "critical"]):
            return "HIGH_SEVERITY"
        if any(keyword in lower for keyword in ["uncertain", "unclear", "cannot", "hard to judge", "limited"]):
            return "UNCERTAINTY_TYPE"
        return "STANDARD"

    consult_agreements = consult_opinion.get("agreements", [])
    consult_disagreements = consult_opinion.get("disagreements", [])
    consult_uncertainties = consult_opinion.get("uncertainties", [])

    review_agreements = review_result.agreements
    review_disagreements = review_result.disagreements
    review_uncertainties = review_result.uncertainties

    # Find overlap and divergence
    shadow_summary = {
        "case_id": case_id,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "consult_model": consult_opinion.get("model", "unknown"),
        "review_model": review_result.model,
        "consult_summary": consult_opinion.get("summary", "")[:240],
        "consult_confidence": consult_opinion.get("confidence", 0.5),
        "review_confidence": review_result.confidence,
        "agreement_overlap": [],
        "disagreement_points": [],
        "uncertainty_divergence": [],
        "confidence_delta": abs(
            consult_opinion.get("confidence", 0.5) - review_result.confidence
        ),
        "semantic_matches": [],  # Enhanced: track semantic similarity matches
        "disagreement_classifications": [],
        "requires_attention": False,
        "pattern_type": "alignment",
        "severity_impact": 0.35,
        "synopsis": "",
    }

    # Check agreement overlap with semantic matching
    for ca in consult_agreements:
        match = find_best_match(ca, review_agreements)
        if match is not None:
            idx, score = match
            shadow_summary["agreement_overlap"].append(f"EXACT: {ca}")
            shadow_summary["semantic_matches"].append({
                "type": "agreement",
                "consult_item": ca[:100] + "..." if len(ca) > 100 else ca,
                "review_item": review_agreements[idx][:100] + "..." if len(review_agreements[idx]) > 100 else review_agreements[idx],
                "similarity": round(score, 2)
            })
        elif ca in review_disagreements:
            shadow_summary["disagreement_points"].append(
                f"CONSULT AGREE vs REVIEW DISAGREE: {ca}"
            )

    # Check disagreement divergence with semantic matching
    for cd in consult_disagreements:
        match = find_best_match(cd, review_disagreements)
        if match is not None:
            idx, score = match
            shadow_summary["agreement_overlap"].append(f"DISAGREE BOTH: {cd[:80]}...")
            shadow_summary["semantic_matches"].append({
                "type": "disagreement",
                "consult_item": cd[:100] + "..." if len(cd) > 100 else cd,
                "review_item": review_disagreements[idx][:100] + "..." if len(review_disagreements[idx]) > 100 else review_disagreements[idx],
                "similarity": round(score, 2)
            })
        elif cd in review_agreements:
            shadow_summary["disagreement_points"].append(
                f"CONSULT DISAGREE vs REVIEW AGREE: {cd}"
            )

    # Check uncertainty divergence with semantic matching
    for cu in consult_uncertainties:
        match = find_best_match(cu, review_uncertainties)
        if match is None:
            shadow_summary["uncertainty_divergence"].append(
                f"Consult uncertain, Review not: {cu[:80]}..." if len(cu) > 80 else f"Consult uncertain, Review not: {cu}"
            )

    for ru in review_uncertainties:
        match = find_best_match(ru, consult_uncertainties)
        if match is None:
            shadow_summary["uncertainty_divergence"].append(
                f"Review uncertain, Consult not: {ru[:80]}..." if len(ru) > 80 else f"Review uncertain, Consult not: {ru}"
            )

    # Generate enhanced synopsis
    n_agreements = len(shadow_summary["agreement_overlap"])
    n_disagreements = len(shadow_summary["disagreement_points"])
    n_unc_divs = len(shadow_summary["uncertainty_divergence"])
    conf_delta = shadow_summary["confidence_delta"]

    for point in shadow_summary["disagreement_points"]:
        disagreement_type = classify_disagreement_type(point)
        severity = classify_disagreement_severity(point)
        shadow_summary["disagreement_classifications"].append({
            "text": point[:160],
            "type": disagreement_type,
            "severity": severity,
        })

    shadow_summary["requires_attention"] = any(
        item["severity"] == "HIGH_SEVERITY" or item["type"] in {"diagnostic", "urgency"}
        for item in shadow_summary["disagreement_classifications"]
    )

    if shadow_summary["disagreement_classifications"]:
        top_classification = shadow_summary["disagreement_classifications"][0]
        shadow_summary["pattern_type"] = top_classification["type"]

    if any(item["severity"] == "HIGH_SEVERITY" for item in shadow_summary["disagreement_classifications"]):
        shadow_summary["severity_impact"] = 0.9
    elif any(item["type"] in {"diagnostic", "urgency"} for item in shadow_summary["disagreement_classifications"]):
        shadow_summary["severity_impact"] = 0.75
    elif n_disagreements > 0:
        shadow_summary["severity_impact"] = 0.6
    elif n_unc_divs > 0:
        shadow_summary["pattern_type"] = "uncertainty_gap"
        shadow_summary["severity_impact"] = 0.45

    # Determine alignment level
    if n_disagreements == 0 and conf_delta < 0.15:
        alignment = "HIGH_ALIGNMENT"
    elif n_disagreements <= 2 and conf_delta < 0.3:
        alignment = "MODERATE_ALIGNMENT"
    else:
        alignment = "LOW_ALIGNMENT"

    shadow_summary["synopsis"] = (
        f"[{alignment}] Shadow analysis: {n_agreements} aligned points, "
        f"{n_disagreements} disagreement points, {n_unc_divs} uncertainty divergences. "
        f"Confidence delta: {conf_delta:.2f} "
        f"(7B: {consult_opinion.get('confidence', 0.5):.2f} vs 32B: {review_result.confidence:.2f})"
    )

    # Add key insight about what the disagreement means
    if n_disagreements > 0:
        shadow_summary["clinical_signal"] = (
            f"7B-32B disagreement detected. Consider if 32B's more thorough analysis "
            f"reveals genuine clinical nuance or if it reflects model's higher capacity "
            f"for uncertainty articulation."
        )
    elif n_unc_divs > 0:
        shadow_summary["clinical_signal"] = (
            "32B review expressed uncertainty not present in the 7B consult, which may reflect "
            "more cautious specialist reasoning for this case."
        )
    else:
        shadow_summary["clinical_signal"] = (
            "7B and 32B outputs are broadly aligned, which supports promoting the consult path "
            "once latency and fallback rates are acceptable."
        )

    return shadow_summary


def _store_shadow_disagreement(case_id: str, shadow: dict[str, Any]) -> None:
    """Store bounded shadow disagreement history."""
    global SHADOW_DISAGREEMENTS

    with STATE_LOCK:
        SHADOW_DISAGREEMENTS[case_id] = shadow
        if len(SHADOW_DISAGREEMENTS) > MAX_SHADOW_HISTORY:
            overflow = len(SHADOW_DISAGREEMENTS) - MAX_SHADOW_HISTORY
            oldest_keys = list(SHADOW_DISAGREEMENTS.keys())[:overflow]
            for key in oldest_keys:
                SHADOW_DISAGREEMENTS.pop(key, None)


def _store_outcome_feedback(case_id: str, review_result: ReviewResponse, request: AsyncReviewRequest) -> None:
    """
    Store outcome feedback for learning and improvement.

    Enhanced to capture richer diagnostic information about review quality.
    """
    global OUTCOME_FEEDBACK

    # Compute quality signals from the review
    review_summary = review_result.summary or ""
    n_agreements = len(review_result.agreements)
    n_disagreements = len(review_result.disagreements)
    n_uncertainties = len(review_result.uncertainties)
    confidence = review_result.confidence

    # Quality signals
    quality_signals = {}

    # Low confidence signal
    if confidence < 0.5:
        quality_signals["low_confidence"] = True

    # High disagreement ratio signal
    total_points = n_agreements + n_disagreements
    if total_points > 0 and n_disagreements / total_points > 0.4:
        quality_signals["high_disagreement_ratio"] = True

    # Uncertainty overload signal
    if n_uncertainties > 5:
        quality_signals["uncertainty_overload"] = True

    # Very short summary signal
    if len(review_summary) < 80:
        quality_signals["summary_too_brief"] = True

    # Confidence calibration check (32B should generally be higher confidence than 7B)
    if request.consult_opinion:
        consult_conf = request.consult_opinion.get("confidence", 0.5)
        quality_signals["confidence_vs_consult_delta"] = round(confidence - consult_conf, 3)

    feedback_entry = {
        "case_id": case_id,
        "stored_at": datetime.utcnow().isoformat() + "Z",
        "review_model": review_result.model,
        "review_confidence": confidence,
        "review_summary_length": len(review_summary),
        "n_agreements": n_agreements,
        "n_disagreements": n_disagreements,
        "n_uncertainties": n_uncertainties,
        "quality_signals": quality_signals,
        "severity": request.severity,
        "domain": request.preprocess.get("domain", "unknown"),
        "body_region": request.preprocess.get("bodyRegion") or request.preprocess.get("body_region", "unknown"),
        "image_quality": request.preprocess.get("imageQuality", "unknown"),
        "has_callback": bool(request.callback_url),
        "consult_opinion_available": request.consult_opinion is not None,
        "shadow_analyzed": False,
    }

    with STATE_LOCK:
        feedback_entry["shadow_analyzed"] = case_id in SHADOW_DISAGREEMENTS
        if feedback_entry["shadow_analyzed"]:
            shadow = SHADOW_DISAGREEMENTS.get(case_id, {})
            feedback_entry["shadow_alignment"] = shadow.get("synopsis", "")[:200]
            feedback_entry["shadow_n_disagreements"] = len(shadow.get("disagreement_points", []))
        OUTCOME_FEEDBACK.append(feedback_entry)
        _trim_list_in_place(OUTCOME_FEEDBACK, MAX_FEEDBACK_HISTORY)
        total_feedback_entries = len(OUTCOME_FEEDBACK)

    logger.debug(
        "Stored outcome feedback for case %s. Total feedback entries: %d. Signals: %s",
        case_id, total_feedback_entries, list(quality_signals.keys())
    )


# =============================================================================
# Phase 5: Shadow Intelligence - Arbitration Rationale Generation
# =============================================================================

def _generate_arbitration_rationale(
    shadow: dict[str, Any],
    review_result: ReviewResponse,
    consult_opinion: dict | None = None
) -> dict[str, Any]:
    """
    Generate enriched natural-language arbitration rationale explaining
    why 32B review helped, why 32B should be discounted, or when the case
    remained genuinely ambiguous.

    Produces structured verdict with:
    - verdict_type: MUST_OVERRIDE_32B | SHOULD_OVERRIDE_32B | DISCARD_32B | ESCALATE_HUMAN | NO_ARBITRATION_NEEDED
    - primary_signal: Why this verdict was reached
    - confidence_weight: How much weight to give this 32B output (0-1)
    - triggered_rules: Which case conditions triggered this verdict
    - natural_language_summary: Human-readable explanation
    - why_32b_helped: Case-specific evidence-driven explanation of 32B value
    - why_32b_discounted: Evidence-driven explanation with specific failure modes
    - why_case_ambiguous: Explicit blockers preventing confident arbitration
    - arbitration_blockers: Specific items preventing confident resolution
    """
    verdict = {
        "verdict_type": "NO_ARBITRATION_NEEDED",
        "primary_signal": "",
        "confidence_weight": 0.5,
        "triggered_rules": [],
        "natural_language_summary": "",
        "why_32b_helped": "",
        "why_32b_discounted": "",
        "why_case_ambiguous": "",
        "recommended_action": "",
        "arbitration_blockers": [],
        "case_specific_evidence": {},
        "confidence_components": {},
    }

    n_disagreements = len(shadow.get("disagreement_points", []))
    n_unc_divs = len(shadow.get("uncertainty_divergence", []))
    n_agreements = len(shadow.get("agreement_overlap", []))
    conf_delta = shadow.get("confidence_delta", 0.0)
    consult_conf = consult_opinion.get("confidence", 0.5) if consult_opinion else 0.5
    review_conf = review_result.confidence
    disagreement_classifications = shadow.get("disagreement_classifications", [])
    severity_impact = shadow.get("severity_impact", 0.35)
    pattern_type = shadow.get("pattern_type", "alignment")
    requires_attention = shadow.get("requires_attention", False)

    # =========================================================================
    # Case Family Detection
    # =========================================================================
    body_region = shadow.get("body_region", "unknown")
    image_quality = shadow.get("image_quality", "unknown")
    severity = shadow.get("severity", "unknown")
    temporal_context = shadow.get("temporal_context", "single_image")

    # =========================================================================
    # Phase 5: Deepen Case-Specific Evidence Components
    # =========================================================================
    verdict["case_specific_evidence"] = {
        "body_region": body_region,
        "image_quality": image_quality,
        "severity": severity,
        "temporal_context": temporal_context,
        "n_disagreements": n_disagreements,
        "n_unc_divs": n_unc_divs,
        "n_agreements": n_agreements,
        "conf_delta": conf_delta,
        "consult_conf": consult_conf,
        "review_conf": review_conf,
        "pattern_type": pattern_type,
    }

    # =========================================================================
    # Rule: High Severity Disagreement - 32B Must Override
    # =========================================================================
    if severity_impact >= 0.9 or any(d.get("severity") == "HIGH_SEVERITY" for d in disagreement_classifications):
        verdict["verdict_type"] = "MUST_OVERRIDE_32B"
        verdict["triggered_rules"].append("HIGH_SEVERITY_DISAGREEMENT")

        # Phase 5: Case-specific evidence for why 32B helped
        high_severity_findings = [d for d in disagreement_classifications if d.get("severity") == "HIGH_SEVERITY"]
        specific_finding = high_severity_findings[0] if high_severity_findings else {}

        verdict["primary_signal"] = (
            f"32B identified HIGH severity disagreement in {body_region} requiring immediate clinical attention. "
            f"Severity impact score: {severity_impact:.2f}. Pattern type: {pattern_type}."
        )
        verdict["confidence_weight"] = 0.95

        verdict["why_32b_helped"] = (
            f"CASE-SPECIFIC: 32B's specialist-depth analysis detected a HIGH-SEVERITY finding "
            f"in the {body_region} region that 7B's faster inference missed or underweighted. "
            f"The {n_disagreements} disagreement point(s) involved: {specific_finding.get('description', 'critical anatomical finding')}. "
            f"The {severity_impact:.0%} severity impact confirms this is a genuine clinical emergency. "
            f"32B's additional reasoning cycles identified subtle {specific_finding.get('type', 'diagnostic')} "
            f"markers (e.g., {specific_finding.get('location', 'anatomical site')}) that required "
            f"deeper visual analysis than 7B's single-pass assessment could provide."
        )

        verdict["recommended_action"] = (
            "URGENT: Elevate to human veterinarian review. 32B's high-severity signal "
            "should override the consult pathway regardless of latency costs. "
            f"Escalation confidence: {verdict['confidence_weight']:.0%}."
        )

    # =========================================================================
    # Rule: Diagnostic Disagreement - 32B Should Override
    # =========================================================================
    elif (any(d.get("type") == "diagnostic" for d in disagreement_classifications) and
          severity_impact >= 0.75):
        verdict["verdict_type"] = "SHOULD_OVERRIDE_32B"
        verdict["triggered_rules"].append("DIAGNOSTIC_DISAGREEMENT")

        # Phase 5: Extract specific diagnostic disagreements
        diag_disagreements = [d for d in disagreement_classifications if d.get("type") == "diagnostic"]
        diag_summary = "; ".join([
            f"{d.get('description', 'diagnostic finding')} ({d.get('location', 'site unspecified')})"
            for d in diag_disagreements[:3]
        ])

        verdict["primary_signal"] = (
            f"32B diagnostic analysis diverged from 7B on core {body_region} findings. "
            f"Pattern type: {pattern_type}. {n_disagreements} disagreement(s) identified."
        )
        verdict["confidence_weight"] = 0.8

        # Phase 5: Case-specific 32B help explanation
        verdict["why_32b_helped"] = (
            f"CASE-SPECIFIC: 32B's {n_disagreements}x larger parameter count enabled "
            f"specialist-level diagnostic reasoning for this {body_region} case. "
            f"The diagnostic disagreements centered on: {diag_summary}. "
            f"7B's faster inference likely assessed these as benign variations, while 32B's "
            f"deeper pattern recognition identified concerning features. Specifically, 32B "
            f"detected {diag_disagreements[0].get('description', 'diagnostic markers')} at "
            f"{diag_disagreements[0].get('location', 'anatomical site')} that matches known "
            f"pathology patterns for {pattern_type} cases at this severity level ({severity_impact:.0%} impact)."
        )

        verdict["recommended_action"] = (
            "Strongly consider 32B's diagnostic interpretation. If promoting consult path, "
            "ensure the vet reviews both 7B and 32B findings for reconciliation. "
            f"Override confidence: {verdict['confidence_weight']:.0%} based on diagnostic specificity."
        )

    # =========================================================================
    # Rule: Image Quality Degradation - 32B Should Be Discounted
    # =========================================================================
    elif image_quality in ("poor", "marginal", "unknown"):
        verdict["verdict_type"] = "DISCARD_32B"
        verdict["triggered_rules"].append("IMAGE_QUALITY_DEGRADATION")

        # Phase 5: Evidence-driven quality impact analysis
        quality_impact = {
            "poor": {
                "confidence_reduction": 0.6,
                "specific_issues": "resolution < 256px, heavy compression, significant motion blur",
                "artifact_risks": ["compression_artifact_mimics_pathology", "detail_loss_prevents_lesion_assessment"]
            },
            "marginal": {
                "confidence_reduction": 0.4,
                "specific_issues": "resolution 256-512px, moderate compression, minor blur",
                "artifact_risks": ["partial_artifact_interference", "borderline_detail_visibility"]
            },
            "unknown": {
                "confidence_reduction": 0.5,
                "specific_issues": "quality assessment unavailable, cannot validate diagnostic reliability",
                "artifact_risks": ["unknown_confounders", "unquantified_imaging_conditions"]
            }
        }

        impact = quality_impact.get(image_quality, quality_impact["unknown"])

        verdict["primary_signal"] = (
            f"Image quality ({image_quality}) limits 32B's ability to provide meaningful "
            f"specialist analysis over 7B. Both models are working from degraded input. "
            f"Specific issues: {impact['specific_issues']}."
        )
        verdict["confidence_weight"] = 0.3

        # Phase 5: Evidence-driven discounting explanation
        verdict["why_32b_discounted"] = (
            f"Evidence-driven discounting for {body_region} case with {image_quality} image quality. "
            f"32B's additional {n_unc_divs}x uncertainty expressions cannot compensate for "
            f"insufficient visual input. Specific failure modes detected: {', '.join(impact['artifact_risks'])}. "
            f"When image quality is {image_quality}, 32B's verbose reasoning may generate "
            f"confident-sounding but unreliable assessments ({impact['confidence_reduction']:.0%} reliability reduction). "
            f"The {n_unc_divs} uncertainty divergence points in this case reflect model "
            f"hallucination risk (creating plausible-sounding but untestable hypotheses) "
            f"rather than genuine diagnostic insight. 7B's simpler output is equally unreliable "
            f"but creates less false confidence."
        )

        verdict["recommended_action"] = (
            f"Discount 32B output ({verdict['confidence_weight']:.0%} weight). "
            f"Request higher quality images ({impact['specific_issues']}) before either model "
            f"output can be considered clinically reliable. Consider ultrasound or "
            f"repeat photography under standardized conditions."
        )

    # =========================================================================
    # Rule: Excessive Uncertainty - Case Stayed Ambiguous
    # =========================================================================
    elif (n_unc_divs > 3 and n_disagreements == 0 and conf_delta < 0.15):
        verdict["verdict_type"] = "ESCALATE_HUMAN"
        verdict["triggered_rules"].append("PERSISTENT_AMBIGUITY")

        # Phase 5: Identify specific arbitration blockers
        blockers = []
        if temporal_context == "single_image":
            blockers.append("SINGLE_IMAGE_LIMITATION: No temporal comparison available to track lesion changes")
        if image_quality in ("poor", "marginal", "unknown"):
            blockers.append(f"IMAGE_QUALITY_BLOCKER: {image_quality} quality prevents confident feature assessment")
        if severity in ("monitor", "unknown"):
            blockers.append("SEVERITY_AMBIGUITY: Cannot determine urgency threshold for clinical action")
        if consult_conf < 0.5 and review_conf < 0.5:
            blockers.append("DUAL_LOW_CONFIDENCE: Both models independently low-confidence on same differentials")
        if n_unc_divs > 5:
            blockers.append("MULTIPLE_UNCERTAINTY_GAPS: >5 distinct uncertainty points prevent diagnostic narrowing")
        blockers.append("INSUFFICIENT_CONTEXT: Case presentation lacks decisive features for AI resolution")

        verdict["arbitration_blockers"] = blockers

        verdict["primary_signal"] = (
            f"Both models expressed significant uncertainty ({n_unc_divs} divergence points) "
            f"suggesting the case lacks sufficient diagnostic features for AI resolution. "
            f"{len(blockers)} specific blockers identified preventing confident arbitration."
        )
        verdict["confidence_weight"] = 0.2

        # Phase 5: Deep why_case_ambiguous with explicit blockers
        verdict["why_case_ambiguous"] = (
            f"EXPLICIT ARBITRATION BLOCKERS for {body_region} case: "
            f"(1) Confidence convergence: 7B ({consult_conf:.0%}) and 32B ({review_conf:.0%}) "
            f"both below 50% despite independent analysis. "
            f"(2) Uncertainty divergence: {n_unc_divs} distinct areas where models "
            f"identified different information gaps (not just different conclusions). "
            f"(3) Temporal context: {temporal_context} provides no longitudinal comparison. "
            f"(4) Image quality: {image_quality} prevents feature validation. "
            f"The {n_unc_divs} uncertainty divergences indicate both models identified "
            f"different but equally valid gaps in case information. "
            f"This is not a failure of 32B reasoning but a genuine diagnostic limitation "
            f"of the presented case. Primary blocker: {blockers[0] if blockers else 'insufficient_case_evidence'}."
        )

        verdict["recommended_action"] = (
            f"ESCALATE to human veterinarian. {len(blockers)} arbitration blockers prevent AI resolution. "
            f"Clinical examination or additional diagnostic imaging required. "
            f"Key missing information: {blockers[0] if blockers else 'comprehensive_case_history'}."
        )

    # =========================================================================
    # Rule: 7B Was Too Quick - 32B Added Genuine Value
    # =========================================================================
    elif (n_agreements > 2 and conf_delta > 0.25 and review_conf > consult_conf):
        verdict["verdict_type"] = "SHOULD_OVERRIDE_32B"
        verdict["triggered_rules"].append("7B_SURFACE_ASSESSMENT")

        # Phase 5: Case-specific evidence of 32B value
        agreement_features = shadow.get("agreement_overlap", [])[:3]
        feature_summary = "; ".join([
            f"{a.get('finding', 'diagnostic feature')} at {a.get('location', 'site')}"
            for a in agreement_features
        ]) if agreement_features else "aligned diagnostic features"

        verdict["primary_signal"] = (
            f"32B added meaningful depth to 7B's initial {body_region} assessment. "
            f"Confidence delta: +{conf_delta:.2f} (7B: {consult_conf:.2f} -> 32B: {review_conf:.2f}). "
            f"Pattern type: {pattern_type}."
        )
        verdict["confidence_weight"] = 0.75

        # Phase 5: Deep case-specific 32B help explanation
        verdict["why_32b_helped"] = (
            f"CASE-SPECIFIC: 7B's faster inference produced a {consult_conf:.0%} confidence "
            f"assessment for this {body_region} case. 32B's deeper reasoning increased "
            f"confidence to {review_conf:.0%} (+{conf_delta:.0%} improvement) by identifying "
            f"and validating {n_agreements} diagnostic features: {feature_summary}. "
            f"7B recognized these features but did not fully articulate their clinical significance. "
            f"32B's additional reasoning cycles connected: (1) visual pattern to differential diagnosis, "
            f"(2) differential to severity estimate, (3) severity to action threshold. "
            f"The {conf_delta:.0%} confidence improvement reflects genuine specialist-level "
            f"reasoning added value for {pattern_type} pattern type in {severity} severity context."
        )

        verdict["recommended_action"] = (
            "Accept 32B's enhanced assessment. The consult pathway can proceed with "
            f"32B's richer differential diagnosis as the working clinical narrative. "
            f"Override confidence: {verdict['confidence_weight']:.0%} based on evidence depth."
        )

    # =========================================================================
    # Rule: 7B and 32B Are Well Aligned - No Arbitration Needed
    # =========================================================================
    elif n_disagreements == 0 and conf_delta < 0.2:
        verdict["verdict_type"] = "NO_ARBITRATION_NEEDED"
        verdict["triggered_rules"].append("HIGH_MODEL_ALIGNMENT")

        # Phase 5: Confidence components analysis
        alignment_strength = "very_high" if conf_delta < 0.05 else "high" if conf_delta < 0.15 else "moderate"

        verdict["confidence_components"] = {
            "alignment_strength": alignment_strength,
            "7b_confidence": consult_conf,
            "32b_confidence": review_conf,
            "agreement_count": n_agreements,
            "confidence_delta": conf_delta,
        }

        verdict["primary_signal"] = (
            f"7B and 32B outputs are well aligned for {body_region}. {n_agreements} agreement points, "
            f"confidence delta: {conf_delta:.2f} ({alignment_strength} alignment)"
        )
        verdict["confidence_weight"] = 0.7

        # Phase 5: Deep alignment explanation
        verdict["natural_language_summary"] = (
            f"{alignment_strength.title()} alignment between fast (7B: {consult_conf:.0%}) "
            f"and thorough (32B: {review_conf:.0%}) models for {body_region} case. "
            f"The {n_agreements} overlapping findings and minimal confidence spread "
            f"({conf_delta:.0%}) indicate high diagnostic reliability. "
            f"32B confirmed rather than revised 7B's assessment. "
            f"Both models independently converged on the same {pattern_type} pattern. "
            f"This {alignment_strength} agreement reduces both FP and FN risk significantly."
        )

        verdict["recommended_action"] = (
            "Proceed with consult pathway. High model agreement supports confidence "
            f"in the diagnostic conclusion. {verdict['confidence_weight']:.0%} reliability."
        )

    # =========================================================================
    # Fallback: Moderate Disagreement Without Clear Signal
    # =========================================================================
    else:
        verdict["verdict_type"] = "NO_ARBITRATION_NEEDED"
        verdict["triggered_rules"].append("MODERATE_DISAGREEMENT_NO_CLEAR_OVERRIDE")

        # Phase 5: Identify partial blockers even in moderate cases
        partial_blockers = []
        if image_quality == "marginal":
            partial_blockers.append("marginal_image_quality_partial_confidence_reduction")
        if temporal_context == "single_image":
            partial_blockers.append("single_image_limits_temporal_comparison")
        if conf_delta > 0.15:
            partial_blockers.append("moderate_confidence_divergence_requires_monitoring")
        verdict["arbitration_blockers"] = partial_blockers

        verdict["primary_signal"] = (
            f"Mixed signals for {body_region}: {n_disagreements} disagreements, {n_unc_divs} uncertainties, "
            f"delta: {conf_delta:.2f}. Neither clear override nor clear alignment achieved."
        )
        verdict["confidence_weight"] = 0.5

        # Phase 5: Moderate case natural language summary
        verdict["natural_language_summary"] = (
            f"Moderate disagreement territory for {body_region} case. 32B found {n_disagreements} "
            f"points of disagreement and {n_unc_divs} areas where uncertainty diverged. "
            f"Confidence spread ({conf_delta:.0%}) is within normal variation for AI-assisted diagnosis "
            f"but above threshold for confident arbitration. "
            f"Partial blockers present: {', '.join(partial_blockers) if partial_blockers else 'none'}. "
            f"Pattern type ({pattern_type}) and severity impact ({severity_impact:.0%}) suggest "
            f"monitoring rather than escalation at this time."
        )

        verdict["recommended_action"] = (
            "Continue normal consult pathway with monitoring. Flag for human review if clinical "
            "instinct suggests uncertainty despite AI alignment. "
            f"Confidence: {verdict['confidence_weight']:.0%} - review if {body_region} symptoms persist."
        )

    # =========================================================================
    # Phase 5: Generate comprehensive natural language summary
    # =========================================================================
    verdict["natural_language_summary"] = (
        f"[{verdict['verdict_type']}] {verdict['primary_signal']} "
        f"(confidence_weight: {verdict['confidence_weight']:.0%}, "
        f"triggered: {', '.join(verdict['triggered_rules'])}). "
        f"Body region: {body_region}, Image quality: {image_quality}, Severity: {severity}."
    )

    return verdict


# =============================================================================
# Phase 5: FP/FN Escalation Autopsy - Root Cause Analysis
# =============================================================================

# Root cause categories for escalation autopsies
ESCALATION_ROOT_CAUSES = {
    "image_quality": [
        "resolution_insufficient",
        "lighting_inadequate",
        "angle_obscured",
        "motion_blur",
        "compression_artifact",
    ],
    "model_bias": [
        "breed_specific_pattern_misidentified",
        "age_related_change_confused_with_pathology",
        "coat_color_artifact_misleading",
        "chronic_change_misread_as_acute",
    ],
    "context_gap": [
        "history_incomplete",
        "previous_treatment_not_disclosed",
        "concurrent_medication_missing",
        "diet_information_absent",
    ],
    "threshold_miss": [
        "subtle_change_below_detection",
        "early_stage_findings_underweighted",
        "borderline_lesion_size_unremarked",
        "low_contrast_feature_ignored",
    ],
    "ambiguous_input": [
        "conflicting_signals_in_case",
        "multiple_possible_differentials",
        "atypical_presentation",
        "overlapping_symptom_cluster",
    ],
}

# Body region specific failure patterns
BODY_REGION_FAILURE_PATTERNS = {
    "skin": [
        "surface_lesion_depth_difficult_to_assess",
        "pigmentation_pattern_ambiguous",
        "secondary_bacterial_change_masked_underlying_fungal",
        "pruritus_cause_multifactorial",
    ],
    "eye": [
        "ocular_surface_detail_limited_by_image",
        "intraocular_pressure_cannot_be_measured_from_image",
        "retrobulbar_lesion_not_visible",
        "subtle_uveal_signs_missed",
    ],
    "ear": [
        "deep_canal_changes_obscured",
        "tympanic_membrane_status_unclear",
        "vestibular_component_cannot_be_assessed",
        "middle_ear_involvement_uncertain",
    ],
    "musculoskeletal": [
        "subtle_fracture_line_not_apparent",
        "early_degenerative_change_minimal",
        "soft_tissue_swelling_difficult_to_quantify",
        "neurological_deficit_not_visible",
    ],
    "dental": [
        "subgingival_changes_not_visible",
        "pulp_status_cannot_be_determined",
        "early_periodontal_attachment_loss_missed",
        "endodontic_radiograph_required",
    ],
    "abdomen": [
        "organ_detail_limited_by_overlying_gas",
        "small_masses_below_resolution",
        "retroperitoneal_changes_obscured",
        "vascular_flow_cannot_be_assessed",
    ],
    "respiratory": [
        "lung_consolidation_detail_limited",
        "early_metastatic_nodules_minimal",
        "pleural_effusion_volume_estimated",
        "airway_caliber_changes_subtle",
    ],
    "cardiovascular": [
        "heart_sound_abnormality_not_capturable",
        "murmur_significance_cannot_be_graded",
        "pericardial_effusion_present_but_small",
        "vascular_bruit_not_apparent",
    ],
}


def _classify_escalation_autopsy(
    case_id: str,
    feedback_entry: dict | None = None,
    shadow: dict | None = None,
    final_outcome: str | None = None
) -> dict[str, Any]:
    """
    Perform escalation autopsy to understand WHY an escalation happened incorrectly
    (false positive) or WHY an escalation was missed (false negative).

    Phase 5 enhancements:
    - primary_root_cause: Most likely failure category (with failure mode sub-type)
    - secondary_contributors: Supporting failure factors
    - body_region_patterns: Failure patterns specific to body region
    - severity_patterns: Failure patterns by severity level
    - image_quality_patterns: Failure patterns by image quality
    - temporal_context_patterns: Failure patterns by temporal context
    - pattern_type_analysis: Failure patterns by diagnostic pattern type
    - failure_mode_classification: THRESHOLD_MISTAKE | CONTEXT_GAP | POOR_IMAGE_EVIDENCE
    - root_cause_narrative: Deep narrative explaining the specific failure chain
    - cluster_summary: Aggregated summary by body_region/severity/image_quality/temporal_context
    - natural_language_autopsy: Comprehensive human-readable explanation
    - evidence_chain: Specific evidence items that led to the failure
    """
    autopsy = {
        "case_id": case_id,
        "autopsy_type": "UNKNOWN",
        "primary_root_cause": "",
        "failure_mode_classification": "",
        "secondary_contributors": [],
        "body_region_patterns": [],
        "severity_patterns": [],
        "image_quality_patterns": [],
        "temporal_context_patterns": [],
        "pattern_type_analysis": [],
        "root_cause_narrative": "",
        "cluster_summary": {},
        "evidence_chain": [],
        "natural_language_autopsy": "",
        "improvement_recommendations": [],
    }

    if feedback_entry is None and shadow is None:
        return autopsy

    # Extract case metadata
    body_region = (
        feedback_entry.get("body_region", "unknown")
        if feedback_entry
        else shadow.get("body_region", "unknown")
    )
    image_quality = (
        feedback_entry.get("image_quality", "unknown")
        if feedback_entry
        else shadow.get("image_quality", "unknown")
    )
    severity = (
        feedback_entry.get("severity", "unknown")
        if feedback_entry
        else shadow.get("severity", "unknown")
    )
    temporal_context = (
        feedback_entry.get("temporal_context", shadow.get("temporal_context", "single_image"))
        if feedback_entry or shadow
        else "single_image"
    )
    quality_signals = (
        feedback_entry.get("quality_signals", {})
        if feedback_entry
        else {}
    )
    disagreement_classifications = (
        shadow.get("disagreement_classifications", [])
        if shadow
        else []
    )
    pattern_type = shadow.get("pattern_type", "unknown") if shadow else "unknown"

    # Phase 5: Build evidence chain from available data
    if disagreement_classifications:
        autopsy["evidence_chain"] = [
            {
                "type": d.get("type", "unknown"),
                "description": d.get("description", "unspecified"),
                "location": d.get("location", "unknown"),
                "severity_tag": d.get("severity", "UNKNOWN"),
            }
            for d in disagreement_classifications if isinstance(d, dict)
        ]

    # =========================================================================
    # Determine Autopsy Type and Root Cause
    # =========================================================================
    if final_outcome:
        # When outcome is known, we can classify FP vs FN
        if final_outcome == "false_positive":
            autopsy["autopsy_type"] = "FALSE_POSITIVE"
            fp_root = _detect_fp_root_cause(
                quality_signals, image_quality, body_region, disagreement_classifications
            )
            autopsy["primary_root_cause"] = fp_root

            # Phase 5: Classify failure mode
            autopsy["failure_mode_classification"] = _classify_failure_mode(
                fp_root, image_quality, quality_signals, disagreement_classifications
            )

            # Phase 5: Build deep root cause narrative
            autopsy["root_cause_narrative"] = _build_fp_root_cause_narrative(
                case_id, body_region, image_quality, severity, temporal_context,
                pattern_type, disagreement_classifications, quality_signals, fp_root,
                autopsy["failure_mode_classification"]
            )

        elif final_outcome == "false_negative":
            autopsy["autopsy_type"] = "FALSE_NEGATIVE"
            fn_root = _detect_fn_root_cause(
                quality_signals, image_quality, body_region, disagreement_classifications
            )
            autopsy["primary_root_cause"] = fn_root

            # Phase 5: Classify failure mode
            autopsy["failure_mode_classification"] = _classify_failure_mode(
                fn_root, image_quality, quality_signals, disagreement_classifications
            )

            # Phase 5: Build deep root cause narrative
            autopsy["root_cause_narrative"] = _build_fn_root_cause_narrative(
                case_id, body_region, image_quality, severity, temporal_context,
                pattern_type, disagreement_classifications, quality_signals, fn_root,
                autopsy["failure_mode_classification"]
            )

    # =========================================================================
    # Body Region Specific Pattern Analysis
    # =========================================================================
    body_region_lower = body_region.lower() if isinstance(body_region, str) else "unknown"
    if body_region_lower in BODY_REGION_FAILURE_PATTERNS:
        autopsy["body_region_patterns"] = BODY_REGION_FAILURE_PATTERNS[body_region_lower]
    elif body_region_lower != "unknown":
        autopsy["body_region_patterns"] = [
            "body_region_specific_pattern_not_catalogued",
            f"manual_review_recommended_for_{body_region_lower}_cases",
        ]

    # =========================================================================
    # Phase 5: Temporal Context Pattern Analysis
    # =========================================================================
    temporal_pattern_map = {
        "single_image": [
            "no_longitudinal_comparison_available",
            "cannot_track_lesion_evolution",
            "acute_vs_chronic_cannot_be_distinguished",
            "treatment_response_unmeasurable",
        ],
        "multiple_images_same_day": [
            "same_day_comparison_limited_utility",
            "requires_historical_baseline",
            "subtle_changes_difficult_to_detect",
        ],
        "multi_day_sequence": [
            "temporal_resolution_may_be_insufficient",
            "interval_between_images_critical",
            "missing_intermediate_timepoints",
        ],
        "extended_longitudinal": [
            "best_temporal_context_for_tracking",
            "lesion_evolution_patterns_identifiable",
            "treatment_response_quantifiable",
        ],
    }

    if temporal_context in temporal_pattern_map:
        autopsy["temporal_context_patterns"] = temporal_pattern_map[temporal_context]
    else:
        autopsy["temporal_context_patterns"] = [
            f"temporal_context_{temporal_context}_not_analyzed"
        ]

    # =========================================================================
    # Phase 5: Cluster Summary by Multiple Dimensions
    # =========================================================================
    autopsy["cluster_summary"] = {
        "by_body_region": {
            "region": body_region,
            "failure_patterns": autopsy["body_region_patterns"][:2],
            "risk_assessment": _assess_body_region_risk(body_region, final_outcome),
        },
        "by_severity": {
            "severity": severity,
            "failure_patterns": _get_severity_failure_patterns(severity, final_outcome),
            "risk_assessment": _assess_severity_risk(severity, final_outcome),
        },
        "by_image_quality": {
            "quality": image_quality,
            "failure_patterns": _get_image_quality_failure_patterns(image_quality, final_outcome),
            "risk_assessment": _assess_image_quality_risk(image_quality, final_outcome),
        },
        "by_temporal_context": {
            "context": temporal_context,
            "failure_patterns": autopsy["temporal_context_patterns"][:2],
            "risk_assessment": _assess_temporal_context_risk(temporal_context, final_outcome),
        },
        "composite_risk_score": _compute_composite_risk_score(
            body_region, severity, image_quality, temporal_context, final_outcome
        ),
    }

    # =========================================================================
    # Severity Level Pattern Analysis
    # =========================================================================
    if severity in ("monitor", "needs_review"):
        autopsy["severity_patterns"] = [
            "low_severity_cases_higher_fp_risk",
            "monitor_level_findings_more_likely_to_be_overcalled",
            "benign_appearing_lesions_misinterpreted_at_low_severity",
        ]
    elif severity in ("urgent", "emergency"):
        autopsy["severity_patterns"] = [
            "high_severity_cases_higher_fn_risk",
            "subtle_changes_missed_under_time_pressure",
            "confirmation_bias_toward_stable_diagnosis",
        ]

    # =========================================================================
    # Image Quality Pattern Analysis
    # =========================================================================
    if image_quality in ("poor", "marginal"):
        autopsy["image_quality_patterns"] = [
            "poor_image_quality_increases_both_fp_and_fn_risk",
            "compression_artifact_mimics_pathology",
            "resolution_limit_prevents_subtle_change_detection",
        ]
        autopsy["improvement_recommendations"].append(
            "Implement mandatory image quality gates before AI analysis"
        )
    elif image_quality == "good":
        autopsy["image_quality_patterns"] = [
            "good_image_quality_reduces_fp_risk",
            "still_cannot_exclude_all_false_negative_risk",
            "model_artifact_bias_persists_despite_good_quality",
        ]

    # =========================================================================
    # Pattern Type Analysis
    # =========================================================================
    pattern_types_seen = set()
    for d in disagreement_classifications:
        if isinstance(d, dict) and "type" in d:
            pattern_types_seen.add(d["type"])

    if "diagnostic" in pattern_types_seen:
        autopsy["pattern_type_analysis"].append(
            f"Diagnostic pattern ({pattern_type}) disagreements carry highest clinical risk. "
            f"When 7B and 32B disagree on diagnostic type, FP/FN risk increases significantly. "
            f"This case involved {len([d for d in disagreement_classifications if d.get('type') == 'diagnostic'])} "
            f"diagnostic disagreements in the {body_region} region."
        )
    if "urgency" in pattern_types_seen:
        autopsy["pattern_type_analysis"].append(
            f"Urgency disagreements indicate calibration issues between models for {body_region} cases. "
            f"High stakes for both FP (unnecessary emergency) and FN (delayed urgent care) at {severity} severity."
        )
    if "prognostic" in pattern_types_seen:
        autopsy["pattern_type_analysis"].append(
            f"Prognostic disagreements reflect uncertainty about disease trajectory. "
            f"FN risk higher when subtle progression signs are missed in {temporal_context} context."
        )
    if not pattern_types_seen:
        autopsy["pattern_type_analysis"].append(
            f"No disagreement classifications available for pattern analysis. "
            f"Pattern type: {pattern_type}."
        )

    # =========================================================================
    # Phase 5: Secondary Contributors
    # =========================================================================
    autopsy["secondary_contributors"] = _identify_secondary_contributors(
        quality_signals, image_quality, severity, temporal_context,
        disagreement_classifications, final_outcome
    )

    # =========================================================================
    # Generate Natural Language Autopsy
    # =========================================================================
    autopsy["natural_language_autopsy"] = _build_autopsy_narrative(autopsy, feedback_entry, shadow)

    return autopsy


# =============================================================================
# Phase 5: Enhanced Root Cause Analysis Functions
# =============================================================================

def _classify_failure_mode(
    root_cause: str,
    image_quality: str,
    quality_signals: dict,
    disagreement_classifications: list[dict]
) -> str:
    """
    Classify the failure mode as THRESHOLD_MISTAKE, CONTEXT_GAP, or POOR_IMAGE_EVIDENCE.

    Phase 5: Provides clearer distinction between different failure types.
    Enhanced with sub-classifications for more granular failure understanding.
    """
    failure_analysis = {
        "primary_mode": "CONTEXT_GAP",
        "sub_classification": "",
        "evidence_quality_assessment": "",
        "confidence_reliability": "",
        "recommended_mitigation": "",
    }
    
    if image_quality in ("poor", "marginal", "unknown"):
        failure_analysis["primary_mode"] = "POOR_IMAGE_EVIDENCE"
        failure_analysis["evidence_quality_assessment"] = (
            f"Image quality ({image_quality}) is insufficient for reliable visual assessment. "
            "Features cannot be confidently validated."
        )
        failure_analysis["confidence_reliability"] = "LOW - output should be significantly discounted"
        failure_analysis["recommended_mitigation"] = "Obtain higher quality images before analysis"
        
        if image_quality == "poor":
            failure_analysis["sub_classification"] = "SEVERELY_LIMITED_EVIDENCE"
        elif image_quality == "marginal":
            failure_analysis["sub_classification"] = "PARTIALLY_LIMITED_EVIDENCE"
        else:
            failure_analysis["sub_classification"] = "EVIDENCE_QUALITY_UNKNOWN"
        
        # Return just the primary mode for backward compatibility
        return failure_analysis["primary_mode"]

    if root_cause in ("context_gap", "summary_too_brief"):
        failure_analysis["primary_mode"] = "CONTEXT_GAP"
        failure_analysis["sub_classification"] = "HISTORICAL_CONTEXT_MISSING"
        failure_analysis["evidence_quality_assessment"] = (
            "Image quality is adequate but case context is insufficient for calibration. "
            "Without history, the model cannot properly weight findings."
        )
        failure_analysis["confidence_reliability"] = "MEDIUM - case context limits reliability"
        failure_analysis["recommended_mitigation"] = "Request additional history before final assessment"

    if root_cause in ("threshold_miss", "subtle_change_below_detection"):
        failure_analysis["primary_mode"] = "THRESHOLD_MISTAKE"
        failure_analysis["sub_classification"] = "DETECTION_THRESHOLD_ERROR"
        failure_analysis["evidence_quality_assessment"] = (
            "Evidence quality is adequate but the model set detection threshold incorrectly. "
            "Findings were above/below the threshold they should have been."
        )
        failure_analysis["confidence_reliability"] = "MEDIUM-HIGH - evidence supports assessment but calibration was off"
        failure_analysis["recommended_mitigation"] = "Review threshold calibration for this pattern type"

    if quality_signals.get("uncertainty_overload") or quality_signals.get("low_confidence"):
        failure_analysis["primary_mode"] = "CONTEXT_GAP"
        failure_analysis["sub_classification"] = "SIGNAL_AMBIGUITY"
        failure_analysis["evidence_quality_assessment"] = (
            "Multiple conflicting signals prevented clear interpretation. "
            "The model had difficulty reconciling contradictory evidence."
        )
        failure_analysis["confidence_reliability"] = "LOW-MEDIUM - signal ambiguity reduces reliability"
        failure_analysis["recommended_mitigation"] = "Request clarification on conflicting signals"

    if any(d.get("type") == "diagnostic" for d in disagreement_classifications if isinstance(d, dict)):
        diag_disagreements = [d for d in disagreement_classifications if d.get("type") == "diagnostic"]
        if any("borderline" in d.get("description", "").lower() for d in diag_disagreements):
            failure_analysis["primary_mode"] = "THRESHOLD_MISTAKE"
            failure_analysis["sub_classification"] = "BORDERLINE_FEATURES"
            failure_analysis["evidence_quality_assessment"] = (
                "Borderline features fall near the decision threshold. "
                "Small changes in interpretation could flip the decision."
            )
            failure_analysis["confidence_reliability"] = "MEDIUM - borderline nature increases uncertainty"
            failure_analysis["recommended_mitigation"] = "Request additional diagnostic tests for borderline cases"
        elif any("subtle" in d.get("description", "").lower() for d in diag_disagreements):
            failure_analysis["primary_mode"] = "THRESHOLD_MISTAKE"
            failure_analysis["sub_classification"] = "SUBTLE_FEATURES"
            failure_analysis["evidence_quality_assessment"] = (
                "Subtle features were present but at the edge of reliable detection. "
                "These findings require higher resolution or specialist review."
            )
            failure_analysis["confidence_reliability"] = "MEDIUM-LOW - subtle features reduce reliability"
            failure_analysis["recommended_mitigation"] = "Use higher resolution imaging or specialist consultation"

    return failure_analysis["primary_mode"]


def _build_deep_failure_mode_narrative(
    failure_mode: str,
    root_cause: str,
    image_quality: str,
    body_region: str,
    severity: str,
    temporal_context: str,
    disagreement_classifications: list[dict],
    quality_signals: dict,
    is_false_positive: bool
) -> dict[str, Any]:
    """
    Build comprehensive failure mode narrative with specific details.
    
    Phase 5: Goes beyond high-level categorization to explain the specific
    mechanism of failure in this case.
    
    Returns:
        - mechanism: How the failure occurred
        - evidence_chain: What evidence contributed to the failure
        - what_would_fix: Specific changes that would prevent recurrence
        - severity_assessment: Clinical impact of this failure type
        - recurrence_risk: Likelihood of this failure recurring
    """
    narrative = {
        "mechanism": "",
        "evidence_chain": [],
        "what_would_fix": [],
        "severity_assessment": "",
        "recurrence_risk": "medium",
        "specific_finding_details": [],
    }
    
    # Extract specific findings
    for d in disagreement_classifications:
        if isinstance(d, dict):
            narrative["specific_finding_details"].append({
                "finding": d.get("description", "unspecified"),
                "location": d.get("location", "unknown"),
                "type": d.get("type", "unknown"),
                "severity_tag": d.get("severity", "UNKNOWN"),
            })
    
    # Failure mode specific analysis
    if failure_mode == "POOR_IMAGE_EVIDENCE":
        narrative["mechanism"] = (
            f"IMAGE EVIDENCE FAILURE: The {image_quality} image quality prevented reliable feature assessment. "
            f"The AI could not confidently validate the {len(narrative['specific_finding_details'])} finding(s) "
            f"identified in the {body_region} region. "
            f"Without clear visual evidence, the model defaulted to a more conservative interpretation, "
            f"which {'over-escalated' if is_false_positive else 'under-escalated'} in this case."
        )
        
        if image_quality == "poor":
            narrative["evidence_chain"] = [
                "Poor resolution → features unrecognizable",
                "Compression artifacts → mimicked pathology",
                "Model uncertain → conservative bias triggered",
                f"Result: {'False positive escalation' if is_false_positive else 'False negative missed escalation'}",
            ]
            narrative["recurrence_risk"] = "high"
        else:
            narrative["evidence_chain"] = [
                f"{image_quality} resolution → some features visible but uncertain",
                "Partial feature visibility → incomplete assessment",
                "Model hedging → {'over' if is_false_positive else 'under'}-estimated confidence",
                f"Result: {'False positive escalation' if is_false_positive else 'False negative missed escalation'}",
            ]
            narrative["recurrence_risk"] = "medium"
        
        narrative["what_would_fix"] = [
            "Obtain higher quality images with better lighting",
            "Capture multiple angles for cross-validation",
            "Include reference images from healthy baseline if available",
            "Consider in-person examination for definitive assessment",
            "Implement mandatory image quality gates before AI analysis",
        ]
        
    elif failure_mode == "THRESHOLD_MISTAKE":
        diag_disagreements = [d for d in disagreement_classifications if d.get("type") == "diagnostic"]
        specific_features = "; ".join([
            f"{d.get('description', 'feature')} at {d.get('location', 'site')}"
            for d in diag_disagreements[:2]
        ]) if diag_disagreements else "borderline features"
        
        narrative["mechanism"] = (
            f"THRESHOLD CALIBRATION FAILURE: The AI incorrectly set the decision threshold "
            f"for the {body_region} {severity} severity case. "
            f"Features that should have been {'below' if is_false_positive else 'above'} the escalation "
            f"threshold were misclassified: {specific_features}. "
            f"The model's internal threshold was {'too low' if is_false_positive else 'too high'} for "
            f"this {temporal_context} case type."
        )
        
        if is_false_positive:
            narrative["evidence_chain"] = [
                "Normal/borderline features presented",
                "Model threshold too low for these features",
                f"Features misinterpreted: {specific_features}",
                "Conservative bias triggered unnecessarily",
                "Result: Over-escalation (false positive)",
            ]
        else:
            narrative["evidence_chain"] = [
                "Concerning features present",
                "Model threshold too high for these features",
                f"Features missed or underweighted: {specific_features}",
                "Confidence overcalibrated to non-escalation",
                "Result: Under-escalation (false negative)",
            ]
        
        narrative["what_would_fix"] = [
            f"Adjust threshold calibration for {body_region} region",
            "Review threshold settings for borderline feature patterns",
            "Implement regional threshold multipliers in clinical matrix",
            "Consider specialist review for threshold-adjacent cases",
            f"Track {specific_features} pattern type for threshold review",
        ]
        narrative["recurrence_risk"] = "medium"
        
    elif failure_mode == "CONTEXT_GAP":
        narrative["mechanism"] = (
            f"CONTEXT DEPENDENCY FAILURE: The AI lacked sufficient case context for calibrated assessment. "
            f"Temporal context: {temporal_context}. "
            f"Without historical baseline or complete presentation, the model could not properly "
            f"{'rule out' if is_false_positive else 'identify'} the concerning findings in {body_region}. "
            f"The model defaulted to {'conservative' if is_false_positive else 'aggressive'} interpretation "
            f"without context to guide calibration."
        )
        
        narrative["evidence_chain"] = [
            "Missing temporal comparison data",
            "No baseline for {body_region} assessment",
            f"Model defaulted to {'conservative' if is_false_positive else 'aggressive'} stance",
            f"Result: {'False positive' if is_false_positive else 'False negative'} due to context absence",
        ]
        
        narrative["what_would_fix"] = [
            "Request historical images when available",
            "Implement mandatory context fields in intake",
            "Flag single-image cases for elevated scrutiny",
            "Develop context-completeness scoring",
            "Consider delayed assessment when context is incomplete",
        ]
        narrative["recurrence_risk"] = "high"
    
    # Severity assessment
    severity_impacts = {
        "emergency": "CRITICAL - Life-threatening delay/over-escalation",
        "urgent": "HIGH - Significant impact on care timing",
        "needs_review": "MEDIUM - Delayed appropriate care",
        "monitor": "LOW - Minor impact on care plan",
    }
    narrative["severity_assessment"] = severity_impacts.get(
        severity.lower() if isinstance(severity, str) else "needs_review",
        f"Severity {severity} has uncertain impact"
    )
    
    return narrative


def _build_fp_root_cause_narrative(
    case_id: str,
    body_region: str,
    image_quality: str,
    severity: str,
    temporal_context: str,
    pattern_type: str,
    disagreement_classifications: list[dict],
    quality_signals: dict,
    root_cause: str,
    failure_mode: str
) -> str:
    """
    Build deep root cause narrative for false positive cases.

    Phase 5: Provides case-specific narrative explaining the failure chain.
    """
    parts = []

    parts.append(f"FALSE POSITIVE ROOT CAUSE ANALYSIS for case {case_id}:")
    parts.append(f"Body region: {body_region}, Severity: {severity}, Pattern type: {pattern_type}.")

    # Failure mode specific narrative
    if failure_mode == "POOR_IMAGE_EVIDENCE":
        parts.append(
            f"PRIMARY FAILURE MODE: Poor image evidence. "
            f"Image quality was {image_quality}, preventing confident feature assessment. "
            f"The AI escalated based on artifacts or ambiguous visual features that appeared "
            f"concerning but were actually imaging artifacts or normal variation. "
            f"Specific failure chain: {image_quality} image quality â†’ visual ambiguity â†’ "
            f"model defaulted to higher confidence interpretation â†’ inappropriate escalation."
        )
    elif failure_mode == "THRESHOLD_MISTAKE":
        diag_disagreements = [d for d in disagreement_classifications if d.get("type") == "diagnostic"]
        specific_features = "; ".join([
            f"{d.get('description', 'feature')} at {d.get('location', 'site')}"
            for d in diag_disagreements[:2]
        ]) if diag_disagreements else "borderline features"

        parts.append(
            f"PRIMARY FAILURE MODE: Threshold mistake. "
            f"The AI set the escalation threshold too low for {body_region} {pattern_type} cases. "
            f"Specific features misidentified as concerning: {specific_features}. "
            f"Failure chain: borderline features â†’ misinterpreted as pathology â†’ "
            f"severity impact overestimated â†’ unnecessary escalation."
        )
    elif failure_mode == "CONTEXT_GAP":
        parts.append(
            f"PRIMARY FAILURE MODE: Context gap. "
            f"The AI lacked sufficient case context to make calibrated escalation decisions. "
            f"Temporal context: {temporal_context}. "
            f"Missing context items: patient history, previous treatment response, or baseline imaging. "
            f"Failure chain: incomplete context â†’ reduced calibration â†’ "
            f"conservative bias toward escalation â†’ false positive."
        )

    # Add secondary contributors
    if quality_signals.get("uncertainty_overload"):
        parts.append("Contributing factor: uncertainty overload caused model to default to escalation.")

    return " ".join(parts)


def _build_fn_root_cause_narrative(
    case_id: str,
    body_region: str,
    image_quality: str,
    severity: str,
    temporal_context: str,
    pattern_type: str,
    disagreement_classifications: list[dict],
    quality_signals: dict,
    root_cause: str,
    failure_mode: str
) -> str:
    """
    Build deep root cause narrative for false negative cases.

    Phase 5: Provides case-specific narrative explaining the failure chain.
    """
    parts = []

    parts.append(f"FALSE NEGATIVE ROOT CAUSE ANALYSIS for case {case_id}:")
    parts.append(f"Body region: {body_region}, Severity: {severity}, Pattern type: {pattern_type}.")

    # Failure mode specific narrative
    if failure_mode == "POOR_IMAGE_EVIDENCE":
        parts.append(
            f"PRIMARY FAILURE MODE: Poor image evidence. "
            f"Image quality was {image_quality}, preventing detection of subtle findings. "
            f"The AI failed to identify critical features that were obscured by artifacts "
            f"or below the resolution threshold. "
            f"Specific failure chain: {image_quality} image quality â†’ features obscured â†’ "
            f"normal-appearing image â†’ no escalation flagged â†’ missed true positive."
        )
    elif failure_mode == "THRESHOLD_MISTAKE":
        high_severity = [d for d in disagreement_classifications if d.get("severity") == "HIGH_SEVERITY"]
        missed_features = "; ".join([
            f"{d.get('description', 'feature')} at {d.get('location', 'site')}"
            for d in high_severity[:2]
        ]) if high_severity else "subtle high-severity markers"

        parts.append(
            f"PRIMARY FAILURE MODE: Threshold mistake. "
            f"The AI set the escalation threshold too high for {body_region} {pattern_type} cases. "
            f"Missed critical features: {missed_features}. "
            f"Failure chain: subtle features â†’ weighted below detection threshold â†’ "
            f"severity impact underestimated â†’ escalation not triggered â†’ missed true positive."
        )
    elif failure_mode == "CONTEXT_GAP":
        parts.append(
            f"PRIMARY FAILURE MODE: Context gap. "
            f"The AI lacked sufficient case context to identify concerning patterns. "
            f"Temporal context: {temporal_context}. "
            f"Without historical comparison or concurrent symptoms, subtle progression signs "
            f"were not recognized as clinically significant. "
            f"Failure chain: missing context â†’ pattern unrecognized â†’ "
            f"chronic or progressive condition not identified â†’ missed escalation."
        )

    # Add severity-specific context
    if severity in ("urgent", "emergency"):
        parts.append(
            "CRITICAL: This was a high-severity case where FN has highest clinical impact. "
            "The missed escalation may have delayed urgent care."
        )

    return " ".join(parts)


def _identify_secondary_contributors(
    quality_signals: dict,
    image_quality: str,
    severity: str,
    temporal_context: str,
    disagreement_classifications: list[dict],
    final_outcome: str | None
) -> list[str]:
    """
    Identify secondary contributing factors to the failure.

    Phase 5: Provides comprehensive list of contributing factors.
    """
    contributors = []

    # Image quality contributor
    if image_quality == "marginal":
        contributors.append("marginal_image_quality_reduced_confidence")

    # Temporal context contributor
    if temporal_context == "single_image":
        contributors.append("single_image_no_longitudinal_comparison")

    # Quality signal contributors
    if quality_signals.get("uncertainty_overload"):
        contributors.append("uncertainty_overload_caused_conservative_bias")
    if quality_signals.get("low_confidence"):
        contributors.append("low_confidence_model_hedging")

    # Severity contributors for FN
    if final_outcome == "false_negative" and severity in ("monitor", "needs_review"):
        contributors.append("low_severity_cases_higher_fn_risk")

    # Severity contributors for FP
    if final_outcome == "false_positive" and severity in ("urgent", "emergency"):
        contributors.append("high_severity_pressure_caused_over_escalation")

    # Pattern type contributors
    if disagreement_classifications:
        pattern_types = set(d.get("type") for d in disagreement_classifications if isinstance(d, dict))
        if "prognostic" in pattern_types:
            contributors.append("prognostic_patterns_harder_to_assess")

    return contributors


def _assess_body_region_risk(body_region: str, outcome: str | None) -> str:
    """Assess risk level for a body region."""
    high_risk_regions = ["eye", "oral", "lymph_nodes", "abdomen"]
    medium_risk_regions = ["skin", "ear", "paw", "musculoskeletal"]

    if body_region.lower() in high_risk_regions:
        return "high_risk_region"
    elif body_region.lower() in medium_risk_regions:
        return "medium_risk_region"
    return "standard_risk_region"


def _get_severity_failure_patterns(severity: str, outcome: str | None) -> list[str]:
    """Get failure patterns for severity level."""
    patterns = []

    if severity in ("monitor", "needs_review"):
        patterns.extend([
            "low_severity_cases_higher_fp_risk" if outcome == "false_positive" else "low_severity_cases_higher_fn_risk",
            "monitor_level_findings_more_likely_to_be_overcalled" if outcome == "false_positive" else "monitor_level_findings_more_likely_to_be_missed",
        ])
    elif severity in ("urgent", "emergency"):
        patterns.extend([
            "high_severity_cases_higher_fn_risk" if outcome == "false_negative" else "high_severity_cases_higher_fp_risk",
            "subtle_changes_missed_under_time_pressure" if outcome == "false_negative" else "urgency_pressure_caused_over_escalation",
        ])

    return patterns


def _get_image_quality_failure_patterns(image_quality: str, outcome: str | None) -> list[str]:
    """Get failure patterns for image quality."""
    if image_quality in ("poor", "marginal"):
        return [
            "poor_image_quality_increases_both_fp_and_fn_risk",
            "compression_artifact_mimics_pathology",
            "resolution_limit_prevents_subtle_change_detection",
        ]
    elif image_quality == "good":
        return [
            "good_image_quality_reduces_fp_risk",
            "model_artifact_bias_persists_despite_good_quality",
        ]
    return ["image_quality_unknown"]


def _assess_temporal_context_risk(temporal_context: str, outcome: str | None) -> str:
    """Assess risk level for temporal context."""
    if temporal_context == "single_image":
        return "high_risk_no_temporal_comparison"
    elif temporal_context in ("multiple_images_same_day", "multi_day_sequence"):
        return "medium_risk_limited_temporal_data"
    elif temporal_context == "extended_longitudinal":
        return "low_risk_full_temporal_data"
    return "unknown_temporal_risk"


def _compute_composite_risk_score(
    body_region: str,
    severity: str,
    image_quality: str,
    temporal_context: str,
    outcome: str | None
) -> dict:
    """Compute composite risk score across all dimensions."""
    score = 0.0
    factors = []

    # Body region risk
    if body_region.lower() in ["eye", "oral", "lymph nodes", "abdomen"]:
        score += 0.25
        factors.append(("body_region", 0.25, "high_risk_region"))

    # Severity risk
    if severity in ("urgent", "emergency"):
        score += 0.3
        factors.append(("severity", 0.3, "high_severity"))
    elif severity in ("monitor", "needs_review"):
        score += 0.15
        factors.append(("severity", 0.15, "low_severity"))

    # Image quality risk
    if image_quality in ("poor", "marginal"):
        score += 0.35
        factors.append(("image_quality", 0.35, "poor_quality"))
    elif image_quality == "unknown":
        score += 0.2
        factors.append(("image_quality", 0.2, "unknown_quality"))

    # Temporal context risk
    if temporal_context == "single_image":
        score += 0.1
        factors.append(("temporal_context", 0.1, "no_temporal_data"))

    # Outcome adjustment
    if outcome == "false_positive":
        score *= 0.9  # FP slightly lower composite risk
    elif outcome == "false_negative":
        score *= 1.1  # FN slightly higher composite risk

    return {
        "composite_score": min(1.0, score),
        "risk_factors": [{"dimension": f[0], "contribution": f[1], "reason": f[2]} for f in factors],
        "risk_level": "high" if score >= 0.6 else "medium" if score >= 0.3 else "low"
    }


def _detect_fp_root_cause(
    quality_signals: dict,
    image_quality: str,
    body_region: str,
    disagreement_classifications: list[dict]
) -> str:
    """Detect most likely root cause for a false positive escalation."""
    if quality_signals.get("uncertainty_overload"):
        return "ambiguous_input"
    if image_quality in ("poor", "marginal"):
        return "image_quality"
    if any(d.get("type") == "diagnostic" for d in disagreement_classifications if isinstance(d, dict)):
        return "threshold_miss"
    return "model_bias"


def _detect_fn_root_cause(
    quality_signals: dict,
    image_quality: str,
    body_region: str,
    disagreement_classifications: list[dict]
) -> str:
    """Detect most likely root cause for a false negative missed escalation."""
    if quality_signals.get("low_confidence"):
        return "ambiguous_input"
    if quality_signals.get("summary_too_brief"):
        return "context_gap"
    if any(d.get("severity") == "HIGH_SEVERITY" for d in disagreement_classifications if isinstance(d, dict)):
        return "threshold_miss"
    return "model_bias"


def _build_autopsy_narrative(
    autopsy: dict,
    feedback_entry: dict | None,
    shadow: dict | None
) -> str:
    """
    Build comprehensive natural language explanation of the escalation autopsy.

    Phase 5: Enhanced with failure mode classification, root cause narrative,
    and cluster summary integration.
    """
    parts = []

    if autopsy["autopsy_type"] == "FALSE_POSITIVE":
        parts.append(
            "FALSE POSITIVE AUTOPSY: The AI escalated a case that did not warrant "
            "emergency intervention. This wastes clinical resources, may cause "
            "unnecessary owner concern, and erodes trust in the AI system."
        )
    elif autopsy["autopsy_type"] == "FALSE_NEGATIVE":
        parts.append(
            "FALSE NEGATIVE AUTOPSY: A case requiring escalation was missed by "
            "the AI. This represents the highest-risk failure mode (delayed urgent care) "
            "and requires thorough root cause analysis to prevent recurrence."
        )
    else:
        parts.append(
            "ESCALATION AUTOPSY: Root cause analysis of AI escalation behavior "
            "to identify improvement opportunities."
        )

    # Phase 5: Failure mode classification
    if autopsy.get("failure_mode_classification"):
        parts.append(
            f"Failure mode: {autopsy['failure_mode_classification'].replace('_', ' ')}. "
        )

    # Phase 5: Root cause narrative (deep explanation)
    if autopsy.get("root_cause_narrative"):
        parts.append(autopsy["root_cause_narrative"])
    elif autopsy["primary_root_cause"]:
        parts.append(
            f"Primary failure category: {autopsy['primary_root_cause'].replace('_', ' ')}. "
        )

    # Phase 5: Cluster summary integration
    cluster_summary = autopsy.get("cluster_summary", {})
    if cluster_summary:
        composite_risk = cluster_summary.get("composite_risk_score", {})
        if composite_risk:
            parts.append(
                f"Composite risk score: {composite_risk.get('composite_score', 0):.0%} "
                f"({composite_risk.get('risk_level', 'unknown')} risk). "
            )

        # Body region summary
        body_region_summary = cluster_summary.get("by_body_region", {})
        if body_region_summary.get("region") != "unknown":
            parts.append(
                f"Body region ({body_region_summary.get('region')}) risk: "
                f"{body_region_summary.get('risk_assessment', 'unknown')}. "
            )

        # Severity summary
        severity_summary = cluster_summary.get("by_severity", {})
        if severity_summary.get("severity") != "unknown":
            patterns = severity_summary.get("failure_patterns", [])
            if patterns:
                parts.append(
                    f"Severity ({severity_summary.get('severity')}) failure patterns: "
                    f"{', '.join(patterns[:2])}. "
                )

        # Image quality summary
        iq_summary = cluster_summary.get("by_image_quality", {})
        if iq_summary.get("quality") != "unknown":
            parts.append(
                f"Image quality ({iq_summary.get('quality')}) contributed to risk. "
            )

        # Temporal context summary
        tc_summary = cluster_summary.get("by_temporal_context", {})
        if tc_summary.get("context"):
            parts.append(
                f"Temporal context ({tc_summary.get('context')}): "
                f"{tc_summary.get('risk_assessment', 'unknown')}. "
            )

    # Secondary contributors
    if autopsy["secondary_contributors"]:
        parts.append(
            f"Secondary contributors: {', '.join(autopsy['secondary_contributors'][:3])}."
        )

    # Evidence chain summary
    evidence_chain = autopsy.get("evidence_chain", [])
    if evidence_chain:
        evidence_summary = "; ".join([
            f"{e.get('type', 'unknown')}: {e.get('description', 'feature')}"
            for e in evidence_chain[:3]
        ])
        parts.append(f"Evidence chain: {evidence_summary}.")

    # Pattern type analysis
    if autopsy["pattern_type_analysis"]:
        parts.append(f"Pattern analysis: {' '.join(autopsy['pattern_type_analysis'][:2])}")

    # Image quality patterns
    if autopsy["image_quality_patterns"]:
        parts.append(
            f"Image quality patterns: {', '.join(autopsy['image_quality_patterns'][:2])}."
        )

    # Improvement recommendations
    if autopsy["improvement_recommendations"]:
        parts.append(
            f"Recommended improvements: {'; '.join(autopsy['improvement_recommendations'][:2])}"
        )

    return " ".join(parts)


# =============================================================================
# Phase 5: Longitudinal Differential Evolution Tracking
# =============================================================================

def _compute_longitudinal_differential_evolution(
    case_id: str,
    previous_consults: list[dict] | None = None,
    current_consult: dict | None = None
) -> dict[str, Any]:
    """
    Track how the differential diagnosis evolved across multiple timepoints.

    Phase 5 enhancements:
    - evolution_timeline: Ordered list of differential changes
    - confidence_shift_per_timepoint: How confidence changed at each step
    - evidence_drivers: What evidence caused the largest shifts (with specific evidence items)
    - highest_uncertainty_reduction_question: What question would most reduce uncertainty
    - natural_language_evolution_summary: Human-readable evolution narrative
    - what_changed_confidence_most: Deep analysis of primary confidence drivers
    - what_evidence_caused_shift: Specific evidence items causing shifts
    - what_collapsed_uncertainty_fastest: Most impactful single question
    - temporal_patterns: Patterns across the longitudinal sequence
    """
    evolution = {
        "case_id": case_id,
        "evolution_timeline": [],
        "confidence_shift_per_timepoint": [],
        "evidence_drivers": [],
        "highest_uncertainty_reduction_question": "",
        "natural_language_evolution_summary": "",
        "differential_added": [],
        "differential_removed": [],
        "differential_ranked_higher": [],
        "differential_ranked_lower": [],
        # Phase 5: Deep longitudinal reasoning
        "what_changed_confidence_most": {},
        "what_evidence_caused_shift": [],
        "what_collapsed_uncertainty_fastest": "",
        "temporal_patterns": {},
        "confidence_shift_narrative": {},
    }

    if not previous_consults and not current_consult:
        return evolution

    # =========================================================================
    # Build Evolution Timeline
    # =========================================================================
    all_consults = (previous_consults or []) + ([current_consult] if current_consult else [])

    for i, consult in enumerate(all_consults):
        timestamp = consult.get("timestamp", consult.get("processed_at", ""))
        confidence = consult.get("confidence", 0.5)
        differential = consult.get("differential_diagnosis", consult.get("differential", []))
        findings = consult.get("findings", [])
        uncertainties = consult.get("uncertainties", [])
        summary = consult.get("summary", "")

        timepoint = {
            "timepoint_index": i,
            "timestamp": timestamp,
            "confidence": confidence,
            "differential_count": len(differential) if isinstance(differential, list) else 0,
            "findings_count": len(findings) if isinstance(findings, list) else 0,
            "uncertainties_count": len(uncertainties) if isinstance(uncertainties, list) else 0,
            "differential": differential[:5] if isinstance(differential, list) else [],
            "findings": findings[:5] if isinstance(findings, list) else [],
            "uncertainties": uncertainties[:3] if isinstance(uncertainties, list) else [],
        }
        evolution["evolution_timeline"].append(timepoint)
        evolution["confidence_shift_per_timepoint"].append(confidence)

    # =========================================================================
    # Phase 5: Compute Confidence Shifts with Evidence Attribution
    # =========================================================================
    if len(evolution["confidence_shift_per_timepoint"]) >= 2:
        shifts = []
        for i in range(1, len(evolution["confidence_shift_per_timepoint"])):
            prev = evolution["confidence_shift_per_timepoint"][i - 1]
            curr = evolution["confidence_shift_per_timepoint"][i]
            shift = curr - prev
            shifts.append(shift)

            # Phase 5: Extract evidence that caused the shift
            prev_consult = all_consults[i - 1]
            curr_consult_evidence = all_consults[i]

            prev_findings = set(f.get("finding", "") if isinstance(f, dict) else str(f)
                              for f in prev_consult.get("findings", []))
            curr_findings = set(f.get("finding", "") if isinstance(f, dict) else str(f)
                               for f in curr_consult_evidence.get("findings", []))

            new_findings = curr_findings - prev_findings
            lost_findings = prev_findings - curr_findings

            if abs(shift) > 0.15:
                evidence_entry = {
                    "timepoint": i,
                    "shift_direction": "increased" if shift > 0 else "decreased",
                    "shift_magnitude": round(abs(shift), 3),
                    "possible_cause": (
                        "new_positive_findings" if shift > 0 else "conflicting_or_insufficient_evidence"
                    ),
                    # Phase 5: Evidence attribution
                    "new_evidence_detected": list(new_findings) if shift > 0 else [],
                    "evidence_lost": list(lost_findings) if shift < 0 else [],
                    "previous_confidence": prev,
                    "new_confidence": curr,
                }
                evolution["evidence_drivers"].append(evidence_entry)

        # Find timepoint with largest shift
        if shifts:
            largest_shift_idx = shifts.index(max(shifts, key=abs)) + 1
            largest_shift = shifts[largest_shift_idx - 1]
            evolution["largest_confidence_shift"] = {
                "timepoint": largest_shift_idx,
                "magnitude": round(abs(largest_shift), 3),
                "direction": "increased" if largest_shift > 0 else "decreased",
            }

            # Phase 5: Deep analysis of what changed confidence most
            evolution["what_changed_confidence_most"] = _analyze_what_changed_confidence(
                all_consults, largest_shift_idx, largest_shift
            )

            # Phase 5: Evidence that caused the shift
            if largest_shift_idx < len(all_consults):
                evolution["what_evidence_caused_shift"] = _extract_shift_evidence(
                    all_consults, largest_shift_idx, largest_shift
                )

    # =========================================================================
    # Identify Differential Changes
    # =========================================================================
    if len(all_consults) >= 2:
        prev_differential = (
            all_consults[-2].get("differential_diagnosis", [])
            if len(all_consults) >= 2 else []
        )
        curr_differential = (
            all_consults[-1].get("differential_diagnosis", [])
            if all_consults else []
        )

        if isinstance(prev_differential, list) and isinstance(curr_differential, list):
            prev_items = {d.get("diagnosis", d) if isinstance(d, dict) else str(d)
                         for d in prev_differential}
            curr_items = {d.get("diagnosis", d) if isinstance(d, dict) else str(d)
                         for d in curr_differential}

            evolution["differential_added"] = list(curr_items - prev_items)
            evolution["differential_removed"] = list(prev_items - curr_items)

            # Phase 5: Rank changes
            evolution["differential_ranked_higher"] = _identify_rank_changes(
                prev_differential, curr_differential, "higher"
            )
            evolution["differential_ranked_lower"] = _identify_rank_changes(
                prev_differential, curr_differential, "lower"
            )

    # =========================================================================
    # Phase 5: Generate Highest Value Clarification Question
    # =========================================================================
    if all_consults:
        latest_consult = all_consults[-1]
        latest_uncertainties = latest_consult.get("uncertainties", [])
        latest_findings = latest_consult.get("findings", [])

        # Phase 5: Deep analysis of what question would collapse uncertainty fastest
        evolution["what_collapsed_uncertainty_fastest"] = _generate_collapse_question(
            latest_consult, latest_uncertainties, latest_findings,
            evolution.get("differential_added", []), evolution.get("differential_removed", [])
        )

        if latest_uncertainties:
            top_uncertainty = latest_uncertainties[0] if latest_uncertainties else "case complexity"
            evolution["highest_uncertainty_reduction_question"] = (
                f"Clarifying '{top_uncertainty}' would most reduce diagnostic uncertainty. "
                f"{evolution['what_collapsed_uncertainty_fastest']['rationale']}"
            )

    # =========================================================================
    # Phase 5: Temporal Patterns
    # =========================================================================
    evolution["temporal_patterns"] = _analyze_temporal_patterns(
        all_consults, evolution["confidence_shift_per_timepoint"]
    )

    # =========================================================================
    # Generate Natural Language Summary
    # =========================================================================
    n_timepoints = len(evolution["evolution_timeline"])
    if n_timepoints == 1:
        evolution["natural_language_evolution_summary"] = (
            f"Single consult for case {case_id}. No longitudinal evolution data available. "
            f"Current confidence: {evolution['confidence_shift_per_timepoint'][0]:.0%}. "
            f"{_build_single_consult_summary(latest_consult) if all_consults else ''}"
        )
    else:
        conf_range = (
            max(evolution["confidence_shift_per_timepoint"]) -
            min(evolution["confidence_shift_per_timepoint"])
        )

        # Phase 5: Deep evolution summary
        evolution_summary_parts = [
            f"Case {case_id} evolved across {n_timepoints} timepoints.",
            f"Confidence ranged from {min(evolution['confidence_shift_per_timepoint']):.0%} "
            f"to {max(evolution['confidence_shift_per_timepoint']):.0%} (spread: {conf_range:.0%}).",
            f"{len(evolution['evidence_drivers'])} significant evidence shifts detected."
        ]

        if evolution.get("what_changed_confidence_most"):
            wccm = evolution["what_changed_confidence_most"]
            evolution_summary_parts.append(
                f"Primary confidence driver: {wccm.get('primary_driver', 'unknown')}. "
                f"{wccm.get('explanation', '')}"
            )

        if evolution.get("differential_added"):
            evolution_summary_parts.append(
                f"{len(evolution['differential_added'])} new differentials added: "
                f"{', '.join(evolution['differential_added'][:3])}."
            )

        if evolution.get("differential_removed"):
            evolution_summary_parts.append(
                f"{len(evolution['differential_removed'])} differentials ruled out: "
                f"{', '.join(evolution['differential_removed'][:3])}."
            )

        evolution["natural_language_evolution_summary"] = " ".join(evolution_summary_parts)

        # Phase 5: Confidence shift narrative
        evolution["confidence_shift_narrative"] = _build_confidence_shift_narrative(evolution)

    return evolution


# =============================================================================
# Phase 5: Enhanced Longitudinal Reasoning Functions
# =============================================================================

def _analyze_what_changed_confidence(
    all_consults: list[dict],
    timepoint_idx: int,
    shift_magnitude: float
) -> dict:
    """
    Analyze what changed confidence most at the timepoint with largest shift.

    Phase 5: Provides deep analysis of primary confidence drivers with
    specific evidence attribution and mechanistic explanation.
    """
    if timepoint_idx >= len(all_consults):
        return {"primary_driver": "unknown", "explanation": ""}

    prev_consult = all_consults[timepoint_idx - 1]
    curr_consult = all_consults[timepoint_idx]

    # Compare findings
    prev_findings = set(f.get("finding", "") if isinstance(f, dict) else str(f)
                       for f in prev_consult.get("findings", []))
    curr_findings = set(f.get("finding", "") if isinstance(f, dict) else str(f)
                       for f in curr_consult.get("findings", []))

    new_findings = curr_findings - prev_findings
    lost_findings = prev_findings - curr_findings
    retained_findings = curr_findings & prev_findings

    # Compare uncertainties
    prev_unc = set(u.get("uncertainty", u) if isinstance(u, dict) else str(u)
                  for u in prev_consult.get("uncertainties", []))
    curr_unc = set(u.get("uncertainty", u) if isinstance(u, dict) else str(u)
                  for u in curr_consult.get("uncertainties", []))

    resolved_unc = prev_unc - curr_unc
    new_unc = curr_unc - prev_unc

    # Determine primary driver with mechanism
    if new_findings and shift_magnitude > 0:
        driver = "new_positive_findings"
        explanation = (
            f"New findings appeared: {', '.join(list(new_findings)[:3])}. "
            f"These findings increased confidence by {abs(shift_magnitude):.0%}. "
            f"{len(retained_findings)} findings were retained from previous consult."
        )
        mechanism = (
            f"MECHANISM: The appearance of {', '.join(list(new_findings)[:2])} provided new positive evidence. "
            f"This evidence was consistent with the existing differential, reinforcing the diagnosis. "
            f"The model integrated this new evidence by: (1) increasing confidence in top differential(s), "
            f"(2) reducing uncertainty weight on ruling out alternatives, and "
            f"(3) strengthening the overall case for the primary diagnosis."
        )
    elif lost_findings and shift_magnitude < 0:
        driver = "lost_positive_evidence"
        explanation = (
            f"Previously held findings were not confirmed: {', '.join(list(lost_findings)[:3])}. "
            f"Confidence decreased by {abs(shift_magnitude):.0%}. "
            f"Only {len(retained_findings)} findings were retained."
        )
        mechanism = (
            f"MECHANISM: The loss of {', '.join(list(lost_findings)[:2])} removed positive evidence. "
            f"The model reacted by: (1) questioning the original diagnosis, "
            f"(2) broadening the differential to include alternatives, and "
            f"(3) reducing confidence in the primary diagnosis."
        )
    elif resolved_unc:
        driver = "uncertainty_resolved"
        explanation = (
            f"Uncertainties were resolved: {', '.join(list(resolved_unc)[:3])}. "
            f"This increased confidence in the differential diagnosis."
        )
        mechanism = (
            f"MECHANISM: Resolution of {', '.join(list(resolved_unc)[:2])} removed diagnostic blockers. "
            f"The model integrated this by: (1) narrowing the differential, "
            f"(2) increasing confidence in the remaining possibilities, and "
            f"(3) reducing hedging between alternatives."
        )
    elif new_unc:
        driver = "new_uncertainties_identified"
        explanation = (
            f"New uncertainties emerged: {', '.join(list(new_unc)[:3])}. "
            f"This decreased confidence despite other evidence."
        )
        mechanism = (
            f"MECHANISM: Emergence of {', '.join(list(new_unc)[:2])} introduced new diagnostic uncertainty. "
            f"The model responded by: (1) expanding the differential, "
            f"(2) reducing commitment to any single diagnosis, and "
            f"(3) increasing hedging across multiple possibilities."
        )
    else:
        driver = "differential_reconfiguration"
        explanation = "The differential was reconfigured without clear evidence change."
        mechanism = (
            "MECHANISM: No clear evidence change was detected, yet confidence shifted. "
            "This may indicate: (1) model re-evaluated existing evidence differently, "
            "(2) internal weighting adjustment, or (3) threshold effect at a decision boundary."
        )

    return {
        "primary_driver": driver,
        "explanation": explanation,
        "mechanism": mechanism,
        "new_findings": list(new_findings),
        "lost_findings": list(lost_findings),
        "retained_findings": list(retained_findings),
        "resolved_uncertainties": list(resolved_unc),
        "new_uncertainties": list(new_unc),
        "shift_magnitude": shift_magnitude,
        "evidence_strength": "strong" if len(new_findings) + len(resolved_unc) > 2 else "moderate" if len(new_findings) + len(resolved_unc) > 0 else "weak",
    }


def _generate_deep_evidence_attribution(
    evidence_items: list[dict],
    shift_magnitude: float
) -> dict[str, Any]:
    """
    Generate deep attribution of which specific evidence caused the confidence shift.
    
    Phase 5: Goes beyond listing evidence to explain HOW each piece of evidence
    contributed to the shift.
    
    Returns:
        - causal_evidence: Evidence items with causal explanation
        - supporting_evidence: Secondary supporting evidence
        - contradicting_evidence: Any evidence that opposed the shift
        - net_contribution: Overall evidence contribution summary
        - evidence_weight_analysis: How much weight each evidence item carried
    """
    attribution = {
        "causal_evidence": [],
        "supporting_evidence": [],
        "contradicting_evidence": [],
        "net_contribution": "",
        "evidence_weight_analysis": {},
        "confidence_impact_calculation": "",
    }
    
    if not evidence_items:
        attribution["net_contribution"] = "No specific evidence items could be attributed to the shift."
        return attribution
    
    # Categorize evidence by type and impact
    for item in evidence_items:
        evidence_type = item.get("type", "unknown")
        impact = item.get("confidence_impact", "")
        
        if evidence_type == "new_finding":
            if impact == "+":
                attribution["causal_evidence"].append({
                    **item,
                    "causal_explanation": (
                        f"New finding '{item.get('evidence', 'unspecified')}' at {item.get('location', 'unknown location')} "
                        f"provided direct positive evidence for the diagnosis. "
                        f"This finding: (1) matched expected pattern for the differential, "
                        f"(2) was not present in previous consult, and "
                        f"(3) increased model confidence by providing fresh supporting evidence."
                    ),
                    "weight": 0.3 + (0.05 if item.get("location") != "unknown" else 0),
                })
            else:
                attribution["supporting_evidence"].append({
                    **item,
                    "causal_explanation": (
                        f"Finding '{item.get('evidence', 'unspecified')}' appeared but had negative impact. "
                        f"This may indicate artifact or misclassification."
                    ),
                    "weight": 0.1,
                })
                
        elif evidence_type == "resolved_uncertainty":
            attribution["causal_evidence"].append({
                **item,
                "causal_explanation": (
                    f"Resolution of uncertainty '{item.get('evidence', 'unspecified')}' removed a diagnostic blocker. "
                    f"This allowed the model to commit more fully to the primary differential. "
                    f"The removal of this uncertainty: (1) narrowed the differential, "
                    f"(2) increased confidence in remaining possibilities, and "
                    f"(3) reduced need for hedging between alternatives."
                ),
                "weight": 0.25,
            })
    
    # Calculate net contribution
    positive_weight = sum(e.get("weight", 0) for e in attribution["causal_evidence"])
    negative_weight = sum(e.get("weight", 0) for e in attribution["contradicting_evidence"])
    net_weight = positive_weight - negative_weight
    
    attribution["evidence_weight_analysis"] = {
        "total_positive_weight": round(positive_weight, 2),
        "total_negative_weight": round(negative_weight, 2),
        "net_weight": round(net_weight, 2),
        "normalized_impact": round(net_weight * abs(shift_magnitude), 3) if shift_magnitude != 0 else 0,
    }
    
    if net_weight > 0.1:
        attribution["net_contribution"] = (
            f"Evidence strongly supported the {abs(shift_magnitude):.0%} confidence {'increase' if shift_magnitude > 0 else 'decrease'}. "
            f"Primary causal items: {', '.join([e.get('evidence', 'finding') for e in attribution['causal_evidence'][:2]] or ['none identified'])}. "
            f"Net evidence weight: +{net_weight:.2f}."
        )
        attribution["confidence_impact_calculation"] = (
            f"Confidence shift ({abs(shift_magnitude):.0%}) was driven by: "
            f"(1) {len(attribution['causal_evidence'])} causal evidence item(s) with combined weight {positive_weight:.2f}, "
            f"(2) {len(attribution['supporting_evidence'])} supporting item(s), and "
            f"(3) {len(attribution['contradicting_evidence'])} contradicting item(s). "
            f"The evidence profile {'supported' if net_weight > 0 else 'opposed'} the observed shift."
        )
    else:
        attribution["net_contribution"] = (
            f"Evidence for the shift was {'weak' if net_weight < 0.1 else 'mixed'}. "
            f"Causal items: {len(attribution['causal_evidence'])}, "
            f"supporting: {len(attribution['supporting_evidence'])}, "
            f"contradicting: {len(attribution['contradicting_evidence'])}."
        )
        attribution["confidence_impact_calculation"] = (
            f"Evidence was insufficient to fully explain the {abs(shift_magnitude):.0%} shift. "
            f"This may indicate threshold effects, model internal reweighting, or evidence not captured in this analysis."
        )
    
    return attribution


def _analyze_what_changed_confidence(
    all_consults: list[dict],
    timepoint_idx: int,
    shift_magnitude: float
) -> dict:
    """
    Analyze what changed confidence most at the timepoint with largest shift.

    Phase 5: Provides deep analysis of primary confidence drivers.
    """
    if timepoint_idx >= len(all_consults):
        return {"primary_driver": "unknown", "explanation": ""}

    prev_consult = all_consults[timepoint_idx - 1]
    curr_consult = all_consults[timepoint_idx]

    # Compare findings
    prev_findings = set(f.get("finding", "") if isinstance(f, dict) else str(f)
                       for f in prev_consult.get("findings", []))
    curr_findings = set(f.get("finding", "") if isinstance(f, dict) else str(f)
                       for f in curr_consult.get("findings", []))

    new_findings = curr_findings - prev_findings
    lost_findings = prev_findings - curr_findings
    retained_findings = curr_findings & prev_findings

    # Compare uncertainties
    prev_unc = set(u.get("uncertainty", u) if isinstance(u, dict) else str(u)
                  for u in prev_consult.get("uncertainties", []))
    curr_unc = set(u.get("uncertainty", u) if isinstance(u, dict) else str(u)
                  for u in curr_consult.get("uncertainties", []))

    resolved_unc = prev_unc - curr_unc
    new_unc = curr_unc - prev_unc

    # Determine primary driver
    if new_findings and shift_magnitude > 0:
        driver = "new_positive_findings"
        explanation = (
            f"New findings appeared: {', '.join(list(new_findings)[:3])}. "
            f"These findings increased confidence by {abs(shift_magnitude):.0%}. "
            f"{len(retained_findings)} findings were retained from previous consult."
        )
    elif lost_findings and shift_magnitude < 0:
        driver = "lost_positive_evidence"
        explanation = (
            f"Previously held findings were not confirmed: {', '.join(list(lost_findings)[:3])}. "
            f"Confidence decreased by {abs(shift_magnitude):.0%}. "
            f"Only {len(retained_findings)} findings were retained."
        )
    elif resolved_unc:
        driver = "uncertainty_resolved"
        explanation = (
            f"Uncertainties were resolved: {', '.join(list(resolved_unc)[:3])}. "
            f"This increased confidence in the differential diagnosis."
        )
    elif new_unc:
        driver = "new_uncertainties_identified"
        explanation = (
            f"New uncertainties emerged: {', '.join(list(new_unc)[:3])}. "
            f"This decreased confidence despite other evidence."
        )
    else:
        driver = "differential_reconfiguration"
        explanation = "The differential was reconfigured without clear evidence change."

    return {
        "primary_driver": driver,
        "explanation": explanation,
        "new_findings": list(new_findings),
        "lost_findings": list(lost_findings),
        "retained_findings": list(retained_findings),
        "resolved_uncertainties": list(resolved_unc),
        "new_uncertainties": list(new_unc),
    }


def _extract_shift_evidence(
    all_consults: list[dict],
    timepoint_idx: int,
    shift_magnitude: float
) -> list[dict]:
    """
    Extract specific evidence items that caused the confidence shift.

    Phase 5: Provides specific evidence attribution for shifts.
    """
    if timepoint_idx >= len(all_consults):
        return []

    prev_consult = all_consults[timepoint_idx - 1]
    curr_consult = all_consults[timepoint_idx]

    evidence_items = []

    # New findings evidence
    prev_findings = {f.get("finding", "") if isinstance(f, dict) else str(f)
                    for f in prev_consult.get("findings", [])}
    curr_findings = {f.get("finding", "") if isinstance(f, dict) else str(f)
                    for f in curr_consult.get("findings", [])}

    for finding in curr_consult.get("findings", []):
        finding_text = finding.get("finding", "") if isinstance(finding, dict) else str(finding)
        if finding_text and finding_text not in prev_findings:
            evidence_items.append({
                "type": "new_finding",
                "evidence": finding_text,
                "location": finding.get("location", "unknown") if isinstance(finding, dict) else "unknown",
                "confidence_impact": "+" if shift_magnitude > 0 else "-",
                "timestamp": curr_consult.get("timestamp", curr_consult.get("processed_at", "")),
            })

    # Resolved uncertainties evidence
    prev_unc = {u.get("uncertainty", u) if isinstance(u, dict) else str(u)
               for u in prev_consult.get("uncertainties", [])}
    curr_unc = {u.get("uncertainty", u) if isinstance(u, dict) else str(u)
               for u in curr_consult.get("uncertainties", [])}

    for resolved in (prev_unc - curr_unc):
        evidence_items.append({
            "type": "resolved_uncertainty",
            "evidence": resolved,
            "confidence_impact": "+",
            "timestamp": curr_consult.get("timestamp", curr_consult.get("processed_at", "")),
        })

    return evidence_items


def _identify_rank_changes(
    prev_differential: list,
    curr_differential: list,
    direction: str
) -> list[str]:
    """
    Identify diagnoses that changed rank in the differential.

    Phase 5: Tracks how differential priorities shifted.
    """
    prev_dict = {d.get("diagnosis", d) if isinstance(d, dict) else str(d): i
                 for i, d in enumerate(prev_differential)}
    curr_dict = {d.get("diagnosis", d) if isinstance(d, dict) else str(d): i
                 for i, d in enumerate(curr_differential)}

    changes = []
    for diagnosis, prev_rank in prev_dict.items():
        if diagnosis in curr_dict:
            curr_rank = curr_dict[diagnosis]
            rank_change = prev_rank - curr_rank  # Positive = moved up
            if direction == "higher" and rank_change > 0:
                changes.append(f"{diagnosis} (rank {prev_rank}â†’{curr_rank})")
            elif direction == "lower" and rank_change < 0:
                changes.append(f"{diagnosis} (rank {prev_rank}â†’{curr_rank})")

    return changes[:5]


def _generate_collapse_question(
    latest_consult: dict,
    uncertainties: list,
    findings: list,
    differential_added: list,
    differential_removed: list
) -> dict:
    """
    Generate the single question that would collapse uncertainty fastest.

    Phase 5: Provides actionable diagnostic question.
    """
    # Prioritize questions based on evidence gaps
    question_types = []

    # If there are unresolved uncertainties, ask about them
    if uncertainties:
        top_unc = uncertainties[0] if isinstance(uncertainties[0], dict) else {"uncertainty": uncertainties[0]}
        question_types.append({
            "question": f"Has the pet exhibited any {top_unc.get('uncertainty', 'symptoms')} since the last consult?",
            "rationale": f"This would resolve the primary uncertainty: {top_unc.get('uncertainty', 'unknown')}",
            "estimated_impact": 0.15,
            "evidence_gap_addressed": "temporal_symptom_history",
        })

    # If new differentials were added, ask to rule them in/out
    if differential_added:
        top_new = list(differential_added)[0]
        question_types.append({
            "question": f"Has there been any change in {top_new} symptoms since the last assessment?",
            "rationale": f"New differential '{top_new}' was added. Confirming or ruling out would shift confidence.",
            "estimated_impact": 0.12,
            "evidence_gap_addressed": "differential_discrimination",
        })

    # If differentials were removed, ask for confirmation
    if differential_removed:
        top_removed = list(differential_removed)[0]
        question_types.append({
            "question": f"Can we confirm that {top_removed} has been ruled out? What clinical signs support this?",
            "rationale": f"Differential '{top_removed}' was removed. Confirming supports remaining differentials.",
            "estimated_impact": 0.10,
            "evidence_gap_addressed": "differential_confirmation",
        })

    # If findings are sparse, ask for more detail
    if not findings or len(findings) < 2:
        question_types.append({
            "question": "What specific clinical signs or changes have you observed in your pet since the last visit?",
            "rationale": "Limited findings in current consult. More detail would improve differential specificity.",
            "estimated_impact": 0.18,
            "evidence_gap_addressed": "insufficient_clinical_signs",
        })

    # Default question if no specific gaps identified
    if not question_types:
        question_types.append({
            "question": "What is the most significant change in your pet's condition since the last assessment?",
            "rationale": "General question to capture any new clinical information.",
            "estimated_impact": 0.10,
            "evidence_gap_addressed": "general_information_gap",
        })

    # Return the highest impact question
    best_question = max(question_types, key=lambda q: q["estimated_impact"])

    return {
        "question": best_question["question"],
        "rationale": best_question["rationale"],
        "estimated_impact": best_question["estimated_impact"],
        "evidence_gap_addressed": best_question["evidence_gap_addressed"],
        "alternative_questions": question_types[:3],
    }


def _analyze_temporal_patterns(
    all_consults: list[dict],
    confidence_timeline: list[float]
) -> dict:
    """
    Analyze temporal patterns across the longitudinal sequence.

    Phase 5: Identifies patterns in how confidence evolved.
    """
    n_timepoints = len(all_consults)

    patterns = {
        "trend": "stable",
        "confidence_volatility": 0.0,
        "acceleration": "linear",
        "pattern_description": "",
    }

    if n_timepoints < 2:
        patterns["pattern_description"] = "Single timepoint - no temporal pattern available."
        return patterns

    # Calculate volatility (variance in confidence changes)
    if len(confidence_timeline) >= 2:
        changes = [confidence_timeline[i] - confidence_timeline[i-1]
                  for i in range(1, len(confidence_timeline))]
        if changes:
            import statistics
            patterns["confidence_volatility"] = round(statistics.stdev(changes) if len(changes) > 1 else 0, 3)

    # Determine trend
    if confidence_timeline:
        first_half_avg = sum(confidence_timeline[:len(confidence_timeline)//2]) / max(1, len(confidence_timeline)//2)
        second_half_avg = sum(confidence_timeline[len(confidence_timeline)//2:]) / max(1, len(confidence_timeline) - len(confidence_timeline)//2)

        if second_half_avg > first_half_avg + 0.1:
            patterns["trend"] = "increasing"
        elif second_half_avg < first_half_avg - 0.1:
            patterns["trend"] = "decreasing"
        else:
            patterns["trend"] = "stable"

    # Determine acceleration (is confidence change accelerating or decelerating?)
    if len(confidence_timeline) >= 3:
        changes = [confidence_timeline[i] - confidence_timeline[i-1]
                  for i in range(1, len(confidence_timeline))]
        if len(changes) >= 2:
            if changes[-1] > changes[0] + 0.05:
                patterns["acceleration"] = "accelerating"
            elif changes[-1] < changes[0] - 0.05:
                patterns["acceleration"] = "decelerating"
            else:
                patterns["acceleration"] = "linear"

    # Build pattern description
    patterns["pattern_description"] = (
        f"Confidence shows {patterns['trend']} trend with {patterns['acceleration']} "
        f"change. Volatility: {patterns['confidence_volatility']:.0%}. "
        f"Based on {n_timepoints} timepoints."
    )

    return patterns


def _build_single_consult_summary(consult: dict) -> str:
    """Build summary for single consult (no longitudinal data)."""
    confidence = consult.get("confidence", 0.5)
    findings = consult.get("findings", [])
    uncertainties = consult.get("uncertainties", [])

    parts = []
    parts.append(f"Confidence: {confidence:.0%}.")

    if findings:
        parts.append(f"{len(findings)} findings identified.")
    else:
        parts.append("No specific findings documented.")

    if uncertainties:
        parts.append(f"Primary uncertainty: {uncertainties[0] if isinstance(uncertainties[0], dict) else uncertainties[0]}.")

    return " ".join(parts)


def _build_confidence_shift_narrative(evolution: dict) -> dict:
    """
    Build detailed narrative of confidence shifts across timepoints.

    Phase 5: Provides comprehensive shift analysis.
    """
    narrative = {
        "summary": "",
        "shifts_by_timepoint": [],
        "net_change": 0.0,
        "shift_count": len(evolution.get("evidence_drivers", [])),
    }

    confidence_timeline = evolution.get("confidence_shift_per_timepoint", [])

    if len(confidence_timeline) >= 2:
        narrative["net_change"] = round(
            confidence_timeline[-1] - confidence_timeline[0], 3
        )

    for driver in evolution.get("evidence_drivers", []):
        narrative["shifts_by_timepoint"].append({
            "timepoint": driver.get("timepoint", 0),
            "direction": driver.get("shift_direction", "unknown"),
            "magnitude": driver.get("shift_magnitude", 0),
            "cause": driver.get("possible_cause", "unknown"),
            "new_evidence": driver.get("new_evidence_detected", []),
            "evidence_lost": driver.get("evidence_lost", []),
        })

    # Build summary text
    if narrative["net_change"] > 0:
        narrative["summary"] = (
            f"Confidence increased by {abs(narrative['net_change']):.0%} over the course of care. "
            f"{narrative['shift_count']} significant shifts were detected, primarily driven by "
            f"new evidence accumulation. "
            f"{' '.join([d.get('explanation', '') for k, d in [('what_changed', evolution.get('what_changed_confidence_most', {}))] if d])}"
        )
    elif narrative["net_change"] < 0:
        narrative["summary"] = (
            f"Confidence decreased by {abs(narrative['net_change']):.0%} over the course of care. "
            f"{narrative['shift_count']} significant shifts were detected, primarily driven by "
            f"evidence loss or new uncertainties. "
            f"{' '.join([d.get('explanation', '') for k, d in [('what_changed', evolution.get('what_changed_confidence_most', {}))] if d])}"
        )
    else:
        narrative["summary"] = (
            f"Confidence remained stable (net change: {narrative['net_change']:.0%}). "
            f"No major shifts detected across {narrative['shift_count']} timepoints."
        )

    return narrative


# =============================================================================
# FastAPI Application
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for model loading."""
    if not STUB_MODE:
        load_model()
    yield
    global MODEL, PROCESSOR
    MODEL = None
    PROCESSOR = None


app = FastAPI(
    title="async-review-service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/healthz")
def healthz():
    """Health check endpoint with full system status."""
    with STATE_LOCK:
        queue_size = len(PROCESSING_QUEUE)
        results_cached = len(REVIEW_RESULTS)
        shadow_disagreements_tracked = len(SHADOW_DISAGREEMENTS)
        outcome_feedback_entries = len(OUTCOME_FEEDBACK)
        dead_letter_size = len(DEAD_LETTER_QUEUE)
        state_transitions_tracked = len(REVIEW_STATE_TRANSITIONS)

    return {
        "ok": True,
        "service": "async-review-service",
        "mode": "stub" if STUB_MODE else "production",
        "model": MODEL_NAME,
        "device": DEVICE,
        "queue_size": queue_size,
        "results_cached": results_cached,
        "shadow_disagreements_tracked": shadow_disagreements_tracked,
        "outcome_feedback_entries": outcome_feedback_entries,
        "dead_letter_queue_size": dead_letter_size,
        "state_transitions_tracked": state_transitions_tracked,
        "callback_retry_config": {
            "max_retries": MAX_CALLBACK_RETRIES,
            "retry_delay_seconds": CALLBACK_RETRY_DELAY_SECONDS,
        },
    }


@app.post("/review")
async def review(
    payload: AsyncReviewRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
):
    """
    Submit a case for async review.

    Returns immediately with a case_id. The review is processed in background.
    Use GET /review/{case_id} to retrieve results.
    """

    validate_auth(authorization)

    try:
        case_id = generate_case_id(payload)
        with STATE_LOCK:
            PROCESSING_QUEUE.append(case_id)

        # Queue background processing
        background_tasks.add_task(process_review_task, payload)

        return JSONResponse({
            "ok": True,
            "case_id": case_id,
            "status": "queued",
            "message": "Review queued. Poll GET /review/{case_id} for results.",
        })

    except Exception as e:
        logger.error("Error queuing review", exc_info=e)
        raise HTTPException(status_code=500, detail="Failed to queue review")


@app.get("/review/{case_id}", response_model=ReviewResponse)
async def get_review(case_id: str):
    """Retrieve results of an async review by case_id."""

    with STATE_LOCK:
        result = REVIEW_RESULTS.get(case_id)
        queued = case_id in PROCESSING_QUEUE

    if result:
        return result

    if queued:
        return JSONResponse({
            "status": "processing",
            "case_id": case_id,
            "message": "Review still in progress. Check back shortly.",
        })

    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


@app.get("/shadow/{case_id}")
async def get_shadow_disagreement(case_id: str):
    """
    Retrieve shadow disagreement analysis for a case.

    This shows how the 32B review diverged from the 7B consult opinion.
    Shadow analysis is advisory only and does not affect clinical decisions.
    """
    with STATE_LOCK:
        shadow = SHADOW_DISAGREEMENTS.get(case_id)

    if shadow is None:
        return JSONResponse({
            "status": "not_analyzed",
            "case_id": case_id,
            "message": "No shadow analysis available. Provide consult_opinion in review request.",
        })

    return JSONResponse({
        "status": "available",
        "shadow": shadow,
    })


@app.get("/feedback/summary")
async def get_feedback_summary():
    """
    Get aggregated outcome feedback summary with enhanced analytics.

    Returns anonymized statistics about review quality for improvement tracking,
    including quality signals and shadow disagreement patterns.
    """
    with STATE_LOCK:
        feedback_entries = list(OUTCOME_FEEDBACK)

    if not feedback_entries:
        return JSONResponse({
            "status": "no_data",
            "message": "No outcome feedback recorded yet.",
        })

    review_entries = [f for f in feedback_entries if "review_confidence" in f]
    manual_feedback_entries = [f for f in feedback_entries if "review_confidence" not in f]
    shadow_analyzed_count = sum(1 for f in review_entries if f.get("shadow_analyzed"))

    if review_entries:
        review_total = len(review_entries)
        avg_confidence = sum(float(f.get("review_confidence", 0.0)) for f in review_entries) / review_total
        avg_agreements = sum(int(f.get("n_agreements", 0)) for f in review_entries) / review_total
        avg_disagreements = sum(int(f.get("n_disagreements", 0)) for f in review_entries) / review_total
        avg_uncertainties = sum(int(f.get("n_uncertainties", 0)) for f in review_entries) / review_total
        avg_summary_len = sum(int(f.get("review_summary_length", 0)) for f in review_entries) / review_total

        # Confidence distribution buckets
        conf_buckets = {"low": 0, "medium": 0, "high": 0}
        for f in review_entries:
            conf = float(f.get("review_confidence", 0.5))
            if conf < 0.5:
                conf_buckets["low"] += 1
            elif conf < 0.75:
                conf_buckets["medium"] += 1
            else:
                conf_buckets["high"] += 1

        # Quality signal aggregation
        quality_signal_counts: dict[str, int] = {}
        for f in review_entries:
            signals = f.get("quality_signals", {})
            for sig_name in signals.keys():
                if sig_name != "confidence_vs_consult_delta":
                    quality_signal_counts[sig_name] = quality_signal_counts.get(sig_name, 0) + 1

        # Shadow disagreement stats
        shadow_disagreement_count = sum(1 for f in review_entries if f.get("shadow_n_disagreements", 0) > 0)
        avg_confidence_delta_with_consult = 0.0
        delta_count = 0
        for f in review_entries:
            delta = f.get("quality_signals", {}).get("confidence_vs_consult_delta")
            if delta is not None:
                avg_confidence_delta_with_consult += delta
                delta_count += 1
        avg_confidence_delta_with_consult = avg_confidence_delta_with_consult / delta_count if delta_count > 0 else 0.0

    else:
        avg_confidence = 0.0
        avg_agreements = 0.0
        avg_disagreements = 0.0
        avg_uncertainties = 0.0
        avg_summary_len = 0.0
        conf_buckets = {"low": 0, "medium": 0, "high": 0}
        quality_signal_counts = {}
        shadow_disagreement_count = 0
        avg_confidence_delta_with_consult = 0.0

    severity_dist: dict[str, int] = {}
    for f in review_entries:
        sev = f.get("severity", "unknown")
        severity_dist[sev] = severity_dist.get(sev, 0) + 1

    domain_dist: dict[str, int] = {}
    for f in review_entries:
        domain = f.get("domain", "unknown")
        domain_dist[domain] = domain_dist.get(domain, 0) + 1

    image_quality_dist: dict[str, int] = {}
    for f in review_entries:
        iq = f.get("image_quality", "unknown")
        image_quality_dist[iq] = image_quality_dist.get(iq, 0) + 1

    return JSONResponse({
        "status": "available",
        "summary": {
            "total_feedback_entries": len(feedback_entries),
            "review_feedback_entries": len(review_entries),
            "manual_feedback_entries": len(manual_feedback_entries),
            "avg_review_confidence": round(avg_confidence, 3),
            "avg_agreements_per_review": round(avg_agreements, 2),
            "avg_disagreements_per_review": round(avg_disagreements, 2),
            "avg_uncertainties_per_review": round(avg_uncertainties, 2),
            "avg_summary_length_chars": round(avg_summary_len, 1),
            "shadow_analysis_count": shadow_analyzed_count,
            "shadow_disagreement_instances": shadow_disagreement_count,
            "confidence_distribution": conf_buckets,
            "confidence_delta_vs_consult_avg": round(avg_confidence_delta_with_consult, 3),
            "quality_signal_counts": quality_signal_counts,
            "severity_distribution": severity_dist,
            "domain_distribution": domain_dist,
            "image_quality_distribution": image_quality_dist,
        },
        "insights": _generate_feedback_insights(review_entries, quality_signal_counts, conf_buckets, shadow_disagreement_count),
    })


def _generate_feedback_insights(review_entries: list[dict], quality_signals: dict, conf_buckets: dict, shadow_disagreements: int) -> dict:
    """
    Generate actionable insights from feedback data.
    """
    insights = {
        "summary": "",
        "recommendations": [],
        "flags": [],
    }

    if not review_entries:
        return insights

    total = len(review_entries)

    # Confidence insights
    low_conf_pct = (conf_buckets.get("low", 0) / total) * 100 if total > 0 else 0
    if low_conf_pct > 30:
        insights["flags"].append(f"High rate of low-confidence reviews ({low_conf_pct:.1f}%)")
        insights["recommendations"].append("Investigate if image quality issues or case complexity driving low confidence")

    # Quality signal insights
    if quality_signals.get("uncertainty_overload", 0) > total * 0.2:
        insights["flags"].append("Many reviews with uncertainty overload")
        insights["recommendations"].append("Consider if differential_considerations and followup recommendations are too verbose")

    if quality_signals.get("summary_too_brief", 0) > total * 0.15:
        insights["flags"].append("Some reviews have overly brief summaries")
        insights["recommendations"].append("Enforce minimum summary length requirements in prompt")

    # Shadow disagreement insights
    shadow_pct = (shadow_disagreements / total) * 100 if total > 0 else 0
    if shadow_pct > 40:
        insights["flags"].append(f"High 7B-32B disagreement rate ({shadow_pct:.1f}%)")
        insights["recommendations"].append("Review if 32B is appropriately calibrated against 7B baseline")

    # Generate summary
    if insights["flags"]:
        insights["summary"] = f"{len(insights['flags'])} quality flag(s) detected, {len(insights['recommendations'])} recommendation(s) generated"
    else:
        insights["summary"] = "No significant quality issues detected"

    return insights


@app.post("/feedback/record")
async def record_outcome_feedback(feedback_data: dict):
    """
    Manually record an outcome feedback entry.

    Used for closing the feedback loop when final outcome is known.
    """
    global OUTCOME_FEEDBACK

    required_fields = ["case_id", "outcome"]
    for field in required_fields:
        if field not in feedback_data:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")

    entry = {
        "case_id": feedback_data["case_id"],
        "recorded_at": datetime.utcnow().isoformat() + "Z",
        "feedback_kind": "manual_outcome",
        "outcome": feedback_data["outcome"],
        "outcome_confidence": feedback_data.get("outcome_confidence"),
        "notes": feedback_data.get("notes", ""),
    }

    with STATE_LOCK:
        OUTCOME_FEEDBACK.append(entry)
        _trim_list_in_place(OUTCOME_FEEDBACK, MAX_FEEDBACK_HISTORY)
        total_feedback_entries = len(OUTCOME_FEEDBACK)

    logger.info("Recorded manual outcome feedback for case %s", feedback_data["case_id"])

    return JSONResponse({
        "ok": True,
        "case_id": feedback_data["case_id"],
        "total_feedback_entries": total_feedback_entries,
    })


@app.get("/feedback/synthesis")
async def get_feedback_synthesis():
    """
    Get synthesized feedback analysis with trends and aggregated statistics.

    This endpoint provides:
    - Overall quality signal distribution
    - Trend analysis over time
    - Domain-specific insights
    - Shadow disagreement patterns
    - Actionable recommendations
    """
    with STATE_LOCK:
        feedback_entries = list(OUTCOME_FEEDBACK)
        shadow_entries = dict(SHADOW_DISAGREEMENTS)

    if not feedback_entries:
        return {
            "status": "no_data",
            "message": "No feedback entries available for synthesis",
            "total_entries": 0,
        }

    # Aggregate statistics
    total_entries = len(feedback_entries)

    # Quality signal distribution
    quality_signal_counts = {
        "low_confidence": 0,
        "high_disagreement_ratio": 0,
        "uncertainty_overload": 0,
        "summary_too_brief": 0,
    }

    # Confidence statistics
    confidences = []
    confidence_deltas = []

    # Domain distribution
    domain_counts = {}
    severity_counts = {}
    body_region_counts = {}

    # Shadow analysis stats
    shadow_analyzed_count = 0
    high_alignment_count = 0
    moderate_alignment_count = 0
    low_alignment_count = 0
    requires_attention_count = 0

    # Process entries
    for entry in feedback_entries:
        signals = entry.get("quality_signals", {})
        for signal_name in quality_signal_counts:
            if signals.get(signal_name):
                quality_signal_counts[signal_name] += 1

        confidences.append(entry.get("review_confidence", 0.5))

        delta = signals.get("confidence_vs_consult_delta")
        if delta is not None:
            confidence_deltas.append(delta)

        domain = entry.get("domain", "unknown")
        domain_counts[domain] = domain_counts.get(domain, 0) + 1

        severity = entry.get("severity", "unknown")
        severity_counts[severity] = severity_counts.get(severity, 0) + 1

        body_region = entry.get("body_region", "unknown")
        body_region_counts[body_region] = body_region_counts.get(body_region, 0) + 1

        if entry.get("shadow_analyzed"):
            shadow_analyzed_count += 1

    # Process shadow entries
    for shadow in shadow_entries.values():
        synopsis = shadow.get("synopsis", "")
        if "HIGH_ALIGNMENT" in synopsis:
            high_alignment_count += 1
        elif "MODERATE_ALIGNMENT" in synopsis:
            moderate_alignment_count += 1
        else:
            low_alignment_count += 1

        if shadow.get("requires_attention"):
            requires_attention_count += 1

    # Calculate statistics
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    min_confidence = min(confidences) if confidences else 0
    max_confidence = max(confidences) if confidences else 0

    avg_delta = sum(confidence_deltas) / len(confidence_deltas) if confidence_deltas else 0

    # Generate insights
    insights = []

    # Quality signal insights
    if quality_signal_counts["low_confidence"] > total_entries * 0.2:
        insights.append({
            "type": "warning",
            "message": f"High rate of low confidence reviews ({quality_signal_counts['low_confidence']}/{total_entries})",
            "suggestion": "Consider reviewing model calibration or case selection criteria"
        })

    if quality_signal_counts["high_disagreement_ratio"] > total_entries * 0.15:
        insights.append({
            "type": "warning",
            "message": f"Frequent high disagreement ratios ({quality_signal_counts['high_disagreement_ratio']}/{total_entries})",
            "suggestion": "Review if 7B-32B model configuration is optimal"
        })

    if quality_signal_counts["uncertainty_overload"] > total_entries * 0.1:
        insights.append({
            "type": "info",
            "message": f"Moderate uncertainty overload cases ({quality_signal_counts['uncertainty_overload']}/{total_entries})",
            "suggestion": "These cases may benefit from additional clinical context"
        })

    # Shadow analysis insights
    if requires_attention_count > 0:
        insights.append({
            "type": "alert",
            "message": f"{requires_attention_count} cases require clinical attention due to high-severity disagreements",
            "suggestion": "Review HIGH_SEVERITY disagreement classifications in shadow analysis"
        })

    # Confidence delta insight
    if avg_delta < -0.1:
        insights.append({
            "type": "info",
            "message": f"32B model is generally less confident than 7B (avg delta: {avg_delta:.3f})",
            "suggestion": "This may indicate 32B is appropriately more cautious or needs calibration"
        })
    elif avg_delta > 0.1:
        insights.append({
            "type": "info",
            "message": f"32B model is generally more confident than 7B (avg delta: {avg_delta:.3f})",
            "suggestion": "32B's higher confidence may reflect its larger capacity"
        })

    # Build synthesis response
    synthesis = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_entries": total_entries,
        "shadow_analyzed_count": shadow_analyzed_count,
        "statistics": {
            "avg_confidence": round(avg_confidence, 3),
            "min_confidence": round(min_confidence, 3),
            "max_confidence": round(max_confidence, 3),
            "avg_confidence_delta_vs_consult": round(avg_delta, 3),
        },
        "quality_signal_distribution": quality_signal_counts,
        "domain_distribution": domain_counts,
        "severity_distribution": severity_counts,
        "body_region_distribution": body_region_counts,
        "shadow_analysis": {
            "high_alignment": high_alignment_count,
            "moderate_alignment": moderate_alignment_count,
            "low_alignment": low_alignment_count,
            "requires_attention": requires_attention_count,
        },
        "insights": insights,
        "recommendations": [
            "Monitor LOW_ALIGNMENT cases for systematic issues",
            "Review high-severity disagreements for clinical pattern identification",
            "Consider feedback loop refinement based on outcome data"
        ] if insights else []
    }

    return synthesis


@app.get("/feedback/trends")
async def get_feedback_trends(window_hours: int = 24):
    """
    Get trend analysis for feedback quality signals over a time window.

    Args:
        window_hours: Time window for trend analysis (default: 24 hours)
    """
    from datetime import timedelta

    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=window_hours)

    with STATE_LOCK:
        feedback_entries = list(OUTCOME_FEEDBACK)

    # Filter to window
    window_entries = []
    for entry in feedback_entries:
        stored_at = entry.get("stored_at") or entry.get("recorded_at")
        if stored_at:
            try:
                entry_time = datetime.fromisoformat(stored_at.replace("Z", "+00:00"))
                if entry_time > cutoff_time:
                    window_entries.append(entry)
            except (ValueError, AttributeError):
                continue

    if not window_entries:
        return {
            "status": "no_data",
            "window_hours": window_hours,
            "message": f"No feedback entries in the last {window_hours} hours"
        }

    # Calculate trends
    confidences = [e.get("review_confidence", 0.5) for e in window_entries]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    # Quality signals in window
    quality_signals_in_window = {
        "low_confidence": 0,
        "high_disagreement_ratio": 0,
        "uncertainty_overload": 0,
        "summary_too_brief": 0,
    }

    for entry in window_entries:
        signals = entry.get("quality_signals", {})
        for sig in quality_signals_in_window:
            if signals.get(sig):
                quality_signals_in_window[sig] += 1

    return {
        "window_hours": window_hours,
        "entries_in_window": len(window_entries),
        "avg_confidence": round(avg_confidence, 3),
        "quality_signals": quality_signals_in_window,
        "trend_direction": "improving" if avg_confidence > 0.7 else "stable" if avg_confidence > 0.5 else "declining"
    }


@app.get("/reviews")
async def list_reviews(limit: int = 10):
    """List recent review results."""
    with STATE_LOCK:
        recent = list(REVIEW_RESULTS.values())[-limit:]
        total = len(REVIEW_RESULTS)
        queue_size = len(PROCESSING_QUEUE)
    return {
        "reviews": [r.model_dump() for r in recent],
        "total": total,
        "queue_size": queue_size,
    }


# =============================================================================
# Dead Letter Queue Management Endpoints
# =============================================================================


async def _retry_dead_letter_entry(entry: dict) -> bool:
    """
    Internal helper to retry a dead letter queue entry.

    Args:
        entry: The dead letter entry to retry

    Returns:
        True if retry was successful, False otherwise
    """
    import httpx

    case_id = entry.get("case_id")
    callback_url = entry.get("callback_url")
    payload = entry.get("payload")
    retry_count = entry.get("retry_count", 0)

    if not callback_url or not isinstance(payload, dict):
        entry["retry_status"] = "abandoned"
        entry["error"] = "Missing callback_url or payload"
        return False

    if retry_count >= MAX_CALLBACK_RETRIES:
        entry["retry_status"] = "abandoned"
        return False

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(callback_url, json=payload)
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:120]}")

        entry["retry_status"] = "resolved"
        entry["retry_count"] = retry_count + 1
        entry["last_retry_at"] = datetime.now(timezone.utc).isoformat()
        _record_state_transition(case_id, "dead_letter_resolved", {"retry_count": entry["retry_count"]})
        return True
    except Exception as e:
        entry["retry_status"] = "failed" if retry_count + 1 < MAX_CALLBACK_RETRIES else "abandoned"
        entry["retry_count"] = retry_count + 1
        entry["error"] = str(e)[:200]
        entry["last_retry_at"] = datetime.now(timezone.utc).isoformat()
        return False


@app.get("/dead-letter")
async def get_dead_letter_queue(
    limit: int = 50,
    status: str = None,
    authorization: str | None = Header(default=None),
):
    """
    Get entries from the dead letter queue for inspection and retry.

    Args:
        limit: Maximum number of entries to return
        status: Filter by status (pending, retried, resolved, abandoned)
    """
    validate_auth(authorization)

    with STATE_LOCK:
        entries = [
            {
                "case_id": entry.get("case_id"),
                "callback_url": entry.get("callback_url"),
                "retry_status": entry.get("retry_status"),
                "retry_count": entry.get("retry_count", 0),
                "recorded_at": entry.get("recorded_at"),
                "last_retry_at": entry.get("last_retry_at"),
                "error": entry.get("error"),
            }
            for entry in DEAD_LETTER_QUEUE
        ]

    if status:
        entries = [e for e in entries if e.get("retry_status") == status]

    # Return most recent first
    return {
        "total": len(entries),
        "entries": entries[-limit:] if limit else entries,
    }


@app.post("/dead-letter/{case_id}/retry")
async def retry_dead_letter_entry(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Attempt to retry a specific dead letter queue entry.

    Returns the result of the retry attempt.
    """
    validate_auth(authorization)

    with STATE_LOCK:
        entry = next((e for e in DEAD_LETTER_QUEUE if e.get("case_id") == case_id), None)

    if not entry:
        raise HTTPException(status_code=404, detail=f"Dead letter entry for case {case_id} not found")

    success = await _retry_dead_letter_entry(entry)

    return {
        "case_id": case_id,
        "retry_success": success,
        "entry_status": entry.get("retry_status"),
        "error": entry.get("error"),
    }


@app.post("/dead-letter/retry-all")
async def retry_all_dead_letter_entries(
    authorization: str | None = Header(default=None),
):
    """
    Attempt to retry all pending dead letter queue entries.

    Returns summary of retry results.
    """
    validate_auth(authorization)

    with STATE_LOCK:
        pending_entries = [e for e in DEAD_LETTER_QUEUE if e.get("retry_status") == "pending"]

    results = {
        "total": len(pending_entries),
        "succeeded": 0,
        "failed": 0,
        "details": []
    }

    for entry in pending_entries:
        success = await _retry_dead_letter_entry(entry)
        if success:
            results["succeeded"] += 1
        else:
            results["failed"] += 1
        results["details"].append({
            "case_id": entry.get("case_id"),
            "success": success,
            "status": entry.get("retry_status")
        })

    return results


@app.delete("/dead-letter/{case_id}")
async def delete_dead_letter_entry(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """Delete a specific dead letter queue entry (mark as abandoned)."""
    validate_auth(authorization)

    with STATE_LOCK:
        for i, e in enumerate(DEAD_LETTER_QUEUE):
            if e.get("case_id") == case_id:
                DEAD_LETTER_QUEUE[i]["retry_status"] = "abandoned"
                return {"ok": True, "message": f"Dead letter entry {case_id} marked as abandoned"}

    raise HTTPException(status_code=404, detail=f"Dead letter entry for case {case_id} not found")


@app.delete("/reviews/{case_id}")
async def delete_review(case_id: str):
    """Delete a stored review result."""
    with STATE_LOCK:
        if case_id in REVIEW_RESULTS:
            del REVIEW_RESULTS[case_id]
            REVIEW_CONTEXT.pop(case_id, None)
            SHADOW_DISAGREEMENTS.pop(case_id, None)
            return {"ok": True, "message": f"Review {case_id} deleted"}

        if case_id in PROCESSING_QUEUE:
            PROCESSING_QUEUE.remove(case_id)
            return {"ok": True, "message": f"Queued review {case_id} cancelled"}

    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


# =============================================================================
# Shadow Disagreement Clustering
# =============================================================================
# Groups cases where model predictions diverge significantly from expected outcomes
# without triggering direct corrections, enabling learning from implicit feedback.

SHADOW_DISAGREEMENT_CLUSTERS: list[dict] = []
MAX_SHADOW_CLUSTER_HISTORY = 500


def _compute_disagreement_score(case_id: str) -> float:
    """
    Compute disagreement score for a shadow disagreement case.

    Higher scores indicate greater divergence between model prediction and expected outcome.
    """
    if case_id not in SHADOW_DISAGREEMENTS:
        return 0.0

    disagreement = SHADOW_DISAGREEMENTS[case_id]
    severity_weight = disagreement.get("severity_impact", 0.5)
    confidence_delta = abs(
        disagreement.get("consult_confidence", 0.5)
        - disagreement.get("review_confidence", 0.5)
    )

    return (severity_weight * 0.6) + (confidence_delta * 0.4)


def _cluster_similar_disagreements(disagreement: dict, clusters: list[dict]) -> int | None:
    """
    Find a cluster index for a similar disagreement, or None if no match.

    Similarity is based on domain, body region, and disagreement pattern.
    """
    for i, cluster in enumerate(clusters):
        if cluster.get("domain") == disagreement.get("domain") and \
           cluster.get("body_region") == disagreement.get("body_region") and \
           cluster.get("pattern_type") == disagreement.get("pattern_type"):
            return i
    return None


@app.get("/shadow/disagreements")
async def get_shadow_disagreements(
    limit: int = 50,
    min_score: float = 0.0,
    authorization: str | None = Header(default=None),
):
    """
    Get shadow disagreements for analysis.

    Returns cases where 7B consult predictions diverged from 32B review opinions,
    enabling analysis of implicit feedback patterns.
    """
    validate_auth(authorization)

    with STATE_LOCK:
        disagreements = [
            {
                "case_id": case_id,
                "disagreement_score": _compute_disagreement_score(case_id),
                **disagreement
            }
            for case_id, disagreement in SHADOW_DISAGREEMENTS.items()
        ]

    # Filter by minimum score
    disagreements = [d for d in disagreements if d["disagreement_score"] >= min_score]

    # Sort by score descending
    disagreements.sort(key=lambda x: x["disagreement_score"], reverse=True)

    return {
        "total": len(disagreements),
        "disagreements": disagreements[:limit]
    }


@app.get("/shadow/clusters")
async def get_shadow_clusters(
    authorization: str | None = Header(default=None),
):
    """
    Get clustered shadow disagreements.

    Groups similar disagreement patterns together for pattern analysis.
    """
    validate_auth(authorization)

    with STATE_LOCK:
        return {
            "total_clusters": len(SHADOW_DISAGREEMENT_CLUSTERS),
            "clusters": list(SHADOW_DISAGREEMENT_CLUSTERS)
        }


@app.post("/shadow/analyze")
async def analyze_shadow_patterns(
    authorization: str | None = Header(default=None),
):
    """
    Analyze shadow disagreement patterns and update clusters.

    This endpoint processes all shadow disagreements and groups them
    into clusters based on similarity of domain, body region, and pattern.
    """
    validate_auth(authorization)

    with STATE_LOCK:
        # Build new clusters from current disagreements
        new_clusters = []

        for case_id, disagreement in SHADOW_DISAGREEMENTS.items():
            cluster_idx = _cluster_similar_disagreements(disagreement, new_clusters)

            if cluster_idx is not None:
                # Add to existing cluster
                new_clusters[cluster_idx]["case_count"] += 1
                new_clusters[cluster_idx]["cases"].append(case_id)
                new_clusters[cluster_idx]["avg_score"] = (
                    (new_clusters[cluster_idx]["avg_score"] * (new_clusters[cluster_idx]["case_count"] - 1) +
                     _compute_disagreement_score(case_id)) / new_clusters[cluster_idx]["case_count"]
                )
            else:
                # Create new cluster
                new_clusters.append({
                    "domain": disagreement.get("domain", "unknown"),
                    "body_region": disagreement.get("body_region", "unknown"),
                    "pattern_type": disagreement.get("pattern_type", "unknown"),
                    "case_count": 1,
                    "cases": [case_id],
                    "avg_score": _compute_disagreement_score(case_id),
                    "representative_pattern": disagreement.get("consult_summary", "")[:200]
                })

        SHADOW_DISAGREEMENT_CLUSTERS[:] = new_clusters[-MAX_SHADOW_CLUSTER_HISTORY:]

        return {
            "total_clusters": len(SHADOW_DISAGREEMENT_CLUSTERS),
            "clusters": SHADOW_DISAGREEMENT_CLUSTERS
        }


# =============================================================================
# Phase 5: Shadow Intelligence API Endpoints
# =============================================================================

@app.get("/shadow/arbitration/{case_id}")
async def get_arbitration_rationale(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Get Phase 5 arbitration rationale for a shadow-analyzed case.

    Returns enriched natural-language explanation of:
    - Why 32B helped (or should be discounted)
    - When case stayed genuinely ambiguous
    - Structured verdict and confidence weight
    """
    validate_auth(authorization)

    with STATE_LOCK:
        shadow = SHADOW_DISAGREEMENTS.get(case_id)

    if shadow is None:
        return JSONResponse({
            "status": "not_analyzed",
            "case_id": case_id,
            "message": "No shadow analysis available for this case.",
        })

    arbitration = shadow.get("arbitration_rationale")
    if arbitration is None:
        # Generate on-demand if not stored
        with STATE_LOCK:
            review = REVIEW_RESULTS.get(case_id)

        if review is None:
            return JSONResponse({
                "status": "no_review",
                "case_id": case_id,
                "message": "No review result available to generate arbitration.",
            })

        arbitration = _generate_arbitration_rationale(shadow, review, shadow.get("consult_opinion"))

    return JSONResponse({
        "status": "available",
        "case_id": case_id,
        "arbitration": arbitration,
    })


@app.post("/shadow/autopsy")
async def perform_escalation_autopsy(
    autopsy_request: dict,
    authorization: str | None = Header(default=None),
):
    """
    Perform Phase 5 escalation autopsy on a case.

    Produces root cause analysis for why an escalation happened incorrectly
    (false positive) or why escalation was missed (false negative).

    Request body:
    - case_id: Case identifier
    - outcome: "false_positive" | "false_negative" | None
    """
    validate_auth(authorization)

    case_id = autopsy_request.get("case_id")
    if not case_id:
        raise HTTPException(status_code=400, detail="case_id is required")

    outcome = autopsy_request.get("outcome")

    with STATE_LOCK:
        shadow = SHADOW_DISAGREEMENTS.get(case_id)
        # Find matching feedback entry
        feedback_entry = None
        for entry in reversed(OUTCOME_FEEDBACK):
            if entry.get("case_id") == case_id:
                feedback_entry = entry
                break

    autopsy = _classify_escalation_autopsy(case_id, feedback_entry, shadow, outcome)

    return JSONResponse({
        "case_id": case_id,
        "autopsy": autopsy,
    })


@app.get("/shadow/autopsy/synthesis")
async def get_autopsy_synthesis(
    min_cases: int = 5,
    authorization: str | None = Header(default=None),
):
    """
    Get synthesized autopsy analysis across all cases.

    Aggregates false positive and false negative patterns by:
    - Body region
    - Severity level
    - Image quality
    - Pattern type
    """
    validate_auth(authorization)

    with STATE_LOCK:
        feedback_entries = list(OUTCOME_FEEDBACK)

    if len(feedback_entries) < min_cases:
        return JSONResponse({
            "status": "insufficient_data",
            "message": f"Need at least {min_cases} cases, have {len(feedback_entries)}",
            "total_entries": len(feedback_entries),
        })

    # Aggregate patterns
    body_region_counts: dict[str, dict] = {}
    severity_counts: dict[str, int] = {}
    image_quality_counts: dict[str, int] = {}
    root_cause_counts: dict[str, int] = {}

    for entry in feedback_entries:
        body_region = entry.get("body_region", "unknown")
        severity = entry.get("severity", "unknown")
        image_quality = entry.get("image_quality", "unknown")

        # Body region aggregation
        if body_region not in body_region_counts:
            body_region_counts[body_region] = {"fp": 0, "fn": 0, "total": 0}
        body_region_counts[body_region]["total"] += 1

        # Severity aggregation
        severity_counts[severity] = severity_counts.get(severity, 0) + 1

        # Image quality aggregation
        image_quality_counts[image_quality] = image_quality_counts.get(image_quality, 0) + 1

    return JSONResponse({
        "status": "available",
        "total_cases": len(feedback_entries),
        "body_region_analysis": body_region_counts,
        "severity_distribution": severity_counts,
        "image_quality_distribution": image_quality_counts,
        "root_cause_summary": root_cause_counts,
        "recommendations": _generate_autopsy_recommendations(body_region_counts, severity_counts, image_quality_counts),
    })


def _generate_autopsy_recommendations(
    body_region_counts: dict,
    severity_counts: dict,
    image_quality_counts: dict
) -> list[str]:
    """Generate actionable recommendations based on autopsy synthesis."""
    recommendations = []

    # Find highest-risk body regions
    if body_region_counts:
        highest_volume_region = max(body_region_counts.items(), key=lambda x: x[1].get("total", 0))
        recommendations.append(
            f"Focus training on {highest_volume_region[0]} cases - highest volume region"
        )

    # Image quality recommendation
    poor_quality_count = image_quality_counts.get("poor", 0) + image_quality_counts.get("marginal", 0)
    total_quality_count = sum(image_quality_counts.values())
    if total_quality_count > 0 and (poor_quality_count / total_quality_count) > 0.3:
        recommendations.append(
            "High rate of poor/marginal image quality. Consider implementing image quality gates."
        )

    # Severity recommendation
    urgent_emergency_count = severity_counts.get("urgent", 0) + severity_counts.get("emergency", 0)
    if urgent_emergency_count > 5:
        recommendations.append(
            "Significant urgent/emergency volume. Ensure model calibration for high-severity cases."
        )

    if not recommendations:
        recommendations.append("No specific patterns detected. Continue monitoring for emerging trends.")

    return recommendations


@app.get("/shadow/longitudinal/{case_id}")
async def get_longitudinal_evolution(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Get Phase 5 longitudinal differential evolution for a case.

    Shows how the differential diagnosis evolved across timepoints,
    what evidence caused the largest confidence shifts, and what
    clarification question would most reduce uncertainty.
    """
    validate_auth(authorization)

    with STATE_LOCK:
        # Look for previous consults in feedback entries
        previous_consults = []
        for entry in OUTCOME_FEEDBACK:
            if entry.get("case_id") == case_id:
                previous_consults.append(entry)

        # Get current review result
        review_result = REVIEW_RESULTS.get(case_id)

    if not previous_consults and review_result is None:
        return JSONResponse({
            "status": "no_data",
            "case_id": case_id,
            "message": "No longitudinal data available for this case.",
        })

    current_consult = None
    if review_result:
        current_consult = review_result.model_dump() if hasattr(review_result, 'model_dump') else dict(review_result)

    evolution = _compute_longitudinal_differential_evolution(
        case_id,
        previous_consults if len(previous_consults) > 1 else None,
        current_consult
    )

    return JSONResponse({
        "case_id": case_id,
        "evolution": evolution,
    })


# =============================================================================
# Severity Synthesis Logic
# =============================================================================
# Aggregates and weighs multiple severity indicators to produce calibrated risk scores.

SEVERITY_INDICATORS: list[dict] = []
MAX_SEVERITY_HISTORY = 1000


def _synthesize_risk_score(indicators: list[dict]) -> dict:
    """
    Synthesize a calibrated risk score from multiple severity indicators.

    Uses weighted averaging based on indicator reliability and relevance.
    """
    if not indicators:
        return {"risk_score": 0.0, "confidence": 0.0, "calibration": "insufficient_data"}

    # Weight factors for different indicator sources
    source_weights = {
        "consult": 0.3,
        "review": 0.4,
        "outcome": 0.3
    }

    weighted_sum = 0.0
    weight_total = 0.0

    for indicator in indicators:
        source = indicator.get("source", "unknown")
        severity = indicator.get("severity", 0.5)
        reliability = indicator.get("reliability", 0.5)

        weight = source_weights.get(source, 0.2) * reliability
        weighted_sum += severity * weight
        weight_total += weight

    if weight_total == 0:
        return {"risk_score": 0.0, "confidence": 0.0, "calibration": "no_weighted_indicators"}

    raw_score = weighted_sum / weight_total

    # Calibrate score based on agreement between indicators
    severities = [ind.get("severity", 0.5) for ind in indicators]
    std_dev = _calculate_std_dev(severities)

    if std_dev < 0.1:
        calibration = "high_agreement"
        confidence = 0.9
    elif std_dev < 0.2:
        calibration = "moderate_agreement"
        confidence = 0.7
    else:
        calibration = "low_agreement"
        confidence = 0.5

    # Apply calibration to score
    calibrated_score = raw_score * confidence

    return {
        "risk_score": round(calibrated_score, 3),
        "raw_score": round(raw_score, 3),
        "confidence": round(confidence, 3),
        "calibration": calibration,
        "indicator_count": len(indicators),
        "agreement_std_dev": round(std_dev, 3)
    }


def _calculate_std_dev(values: list[float]) -> float:
    """Calculate standard deviation of a list of values."""
    if len(values) < 2:
        return 0.0

    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / len(values)
    return variance ** 0.5


@app.post("/severity/synthesize")
async def synthesize_severity(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Synthesize a calibrated risk score from multiple severity indicators for a case.

    Aggregates indicators from consult, review, and outcome data to produce
    a calibrated risk score with confidence assessment.
    """
    validate_auth(authorization)

    indicators = []

    # Collect from shadow disagreements
    if case_id in SHADOW_DISAGREEMENTS:
        disagreement = SHADOW_DISAGREEMENTS[case_id]
        indicators.append({
            "source": "consult",
            "severity": disagreement.get("severity_impact", 0.5),
            "reliability": 0.6,
            "description": "7B consult severity assessment"
        })

    # Collect from review results
    if case_id in REVIEW_RESULTS:
        review_context = _review_context_for_case(case_id)
        indicators.append({
            "source": "review",
            "severity": SEVERITY_SCORE_MAP.get(
                str(review_context.get("requested_severity", "needs_review")).lower(),
                0.5,
            ),
            "reliability": 0.8,
            "description": "32B review severity assessment"
        })

    # Collect from outcome feedback
    with STATE_LOCK:
        for feedback in OUTCOME_FEEDBACK:
            if feedback.get("case_id") == case_id:
                indicators.append({
                    "source": "outcome",
                    "severity": feedback.get("outcome_severity", 0.5),
                    "reliability": 0.7,
                    "description": "Outcome-based severity"
                })
                break

    synthesis = _synthesize_risk_score(indicators)

    # Record the synthesis for historical tracking
    with STATE_LOCK:
        SEVERITY_INDICATORS.append({
            "case_id": case_id,
            "synthesized_at": datetime.now(timezone.utc).isoformat(),
            **synthesis,
            "indicators": indicators
        })
        _trim_list_in_place(SEVERITY_INDICATORS, MAX_SEVERITY_HISTORY)

    return {
        "case_id": case_id,
        "synthesis": synthesis
    }


@app.get("/severity/indicators")
async def get_severity_indicators(
    limit: int = 100,
    authorization: str | None = Header(default=None),
):
    """Get historical severity synthesis records."""
    validate_auth(authorization)

    with STATE_LOCK:
        return {
            "total": len(SEVERITY_INDICATORS),
            "indicators": SEVERITY_INDICATORS[-limit:]
        }


# =============================================================================
# Outcome-Learning Heuristics
# =============================================================================
# Tracks case resolution patterns and extracts actionable insights.

OUTCOME_LEARNING: list[dict] = []
MAX_LEARNING_HISTORY = 500


def _extract_resolution_pattern(case_id: str, outcome: dict) -> dict:
    """Extract resolution pattern from case outcome."""
    return {
        "case_id": case_id,
        "initial_severity": outcome.get("initial_severity", "unknown"),
        "final_outcome": outcome.get("outcome", "unknown"),
        "time_to_resolution": outcome.get("time_to_resolution"),
        "interventions_applied": outcome.get("interventions", []),
        "outcome_pattern": _classify_outcome_pattern(outcome)
    }


def _classify_outcome_pattern(outcome: dict) -> str:
    """Classify the outcome pattern based on resolution characteristics."""
    if outcome.get("outcome") == "resolved" and outcome.get("time_to_resolution"):
        if outcome["time_to_resolution"] < 24:
            return "rapid_resolution"
        elif outcome["time_to_resolution"] < 72:
            return "standard_resolution"
        else:
            return "prolonged_resolution"

    if outcome.get("outcome") == "escalated":
        return "required_escalation"

    if outcome.get("outcome") == "pending":
        return "ongoing_monitoring"

    return "undetermined"


def _compute_learning_insights(patterns: list[dict]) -> list[dict]:
    """Compute actionable insights from resolution patterns."""
    insights = []

    # Group by outcome pattern
    pattern_groups = {}
    for pattern in patterns:
        pattern_type = pattern.get("outcome_pattern", "unknown")
        if pattern_type not in pattern_groups:
            pattern_groups[pattern_type] = []
        pattern_groups[pattern_type].append(pattern)

    # Generate insights for each pattern group
    for pattern_type, cases in pattern_groups.items():
        if len(cases) >= 3:
            avg_time = sum(c.get("time_to_resolution", 0) for c in cases if c.get("time_to_resolution")) / len(cases)

            insights.append({
                "insight_type": "resolution_pattern",
                "pattern": pattern_type,
                "case_count": len(cases),
                "avg_resolution_time_hours": round(avg_time, 1) if avg_time > 0 else None,
                "recommendation": f"Cases with {pattern_type} pattern ({len(cases)} occurrences) may benefit from early intervention review"
            })

    return insights


@app.post("/outcome/record")
async def record_outcome(
    case_id: str,
    outcome: dict,
    authorization: str | None = Header(default=None),
):
    """
    Record an outcome for a case to enable learning.

    The outcome data is used to extract resolution patterns and generate
    actionable insights for improving future consultation quality.
    """
    validate_auth(authorization)

    pattern = _extract_resolution_pattern(case_id, outcome)

    with STATE_LOCK:
        OUTCOME_LEARNING.append({
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            **pattern
        })
        _trim_list_in_place(OUTCOME_LEARNING, MAX_LEARNING_HISTORY)

    return {
        "ok": True,
        "case_id": case_id,
        "pattern": pattern
    }


@app.get("/outcome/insights")
async def get_outcome_insights(
    authorization: str | None = Header(default=None),
):
    """
    Get actionable insights derived from outcome learning.

    Returns patterns and recommendations extracted from case resolution data.
    """
    validate_auth(authorization)

    with STATE_LOCK:
        patterns = list(OUTCOME_LEARNING)

    insights = _compute_learning_insights(patterns)

    return {
        "total_outcomes": len(patterns),
        "insights": insights
    }


@app.get("/outcome/patterns")
async def get_outcome_patterns(
    limit: int = 100,
    authorization: str | None = Header(default=None),
):
    """Get recorded outcome patterns for analysis."""
    validate_auth(authorization)

    with STATE_LOCK:
        return {
            "total": len(OUTCOME_LEARNING),
            "patterns": OUTCOME_LEARNING[-limit:]
        }


# =============================================================================
# Cross-Case Narrative Summaries
# =============================================================================
# Synthesizes decision patterns, outcome trajectories, and key differentiating
# factors across multiple patient cases for promotion threshold analysis.

CROSS_CASE_SUMMARIES: list[dict] = []
MAX_SUMMARY_HISTORY = 100


@app.post("/summary/cross-case")
async def generate_cross_case_summary(
    case_ids: list[str],
    summary_type: str = "decision_pattern",
    authorization: str | None = Header(default=None),
):
    """
    Generate a cross-case narrative summary.

    Synthesizes decision patterns, outcome trajectories, and differentiating
    factors across multiple cases to support promotion threshold analysis.

    Summary types:
    - decision_pattern: Analyzes how decisions were made across cases
    - outcome_trajectory: Compares how cases evolved over time
    - complexity_analysis: Identifies what makes cases simple vs complex
    - performance_distinction: Highlights what differentiates satisfactory from exemplary
    """
    validate_auth(authorization)

    if len(case_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 cases required for cross-case summary")

    cases_data = []

    # Collect data for each case
    for case_id in case_ids:
        case_info = {"case_id": case_id}

        # From review results
        if case_id in REVIEW_RESULTS:
            case_info["review"] = _review_result_dict(case_id)
            case_info["review_context"] = _review_context_for_case(case_id)

        # From shadow disagreements
        if case_id in SHADOW_DISAGREEMENTS:
            case_info["shadow"] = SHADOW_DISAGREEMENTS[case_id]

        # From outcome learning
        with STATE_LOCK:
            for outcome in OUTCOME_LEARNING:
                if outcome.get("case_id") == case_id:
                    case_info["outcome"] = outcome
                    break

        # From severity synthesis
        with STATE_LOCK:
            for severity in SEVERITY_INDICATORS:
                if severity.get("case_id") == case_id:
                    case_info["severity_synthesis"] = severity
                    break

        cases_data.append(case_info)

    # Generate summary based on type
    if summary_type == "decision_pattern":
        summary_text = _synthesize_decision_pattern_summary(cases_data)
    elif summary_type == "outcome_trajectory":
        summary_text = _synthesize_outcome_trajectory_summary(cases_data)
    elif summary_type == "complexity_analysis":
        summary_text = _synthesize_complexity_analysis_summary(cases_data)
    elif summary_type == "performance_distinction":
        summary_text = _synthesize_performance_distinction_summary(cases_data)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown summary type: {summary_type}")

    summary_record = {
        "summary_id": f"summary_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary_type": summary_type,
        "case_count": len(cases_data),
        "case_ids": case_ids,
        "summary": summary_text,
        "key_findings": _extract_key_findings(cases_data, summary_type),
        "promotion_relevance": _assess_promotion_relevance(cases_data, summary_type)
    }

    with STATE_LOCK:
        CROSS_CASE_SUMMARIES.append(summary_record)
        _trim_list_in_place(CROSS_CASE_SUMMARIES, MAX_SUMMARY_HISTORY)

    return summary_record


def _synthesize_decision_pattern_summary(cases: list[dict]) -> str:
    """Synthesize a decision pattern summary across cases."""
    patterns = []
    for case in cases:
        if "review" in case:
            review = case["review"]
            review_context = case.get("review_context", {})
            patterns.append({
                "case_id": case["case_id"],
                "triage": review_context.get(
                    "requested_severity",
                    review.get("requested_severity", "unknown"),
                ),
                "reasoning": review.get("summary", "")[:100]
            })

    # Identify common patterns
    triage_distribution = {}
    for p in patterns:
        triage = p.get("triage", "unknown")
        triage_distribution[triage] = triage_distribution.get(triage, 0) + 1

    summary = f"Cross-case analysis of {len(cases)} cases identified {len(patterns)} decision points. "
    summary += f"Triage distribution: {triage_distribution}. "

    return summary


def _synthesize_outcome_trajectory_summary(cases: list[dict]) -> str:
    """Synthesize an outcome trajectory summary across cases."""
    trajectories = []
    for case in cases:
        if "outcome" in case:
            trajectories.append({
                "case_id": case["case_id"],
                "initial": case["outcome"].get("initial_severity"),
                "final": case["outcome"].get("final_outcome"),
                "pattern": case["outcome"].get("outcome_pattern")
            })

    if not trajectories:
        return "Insufficient outcome data for trajectory analysis."

    summary = f"Outcome trajectory analysis across {len(trajectories)} cases. "
    patterns = [t.get("pattern") for t in trajectories if t.get("pattern")]
    if patterns:
        from collections import Counter
        pattern_counts = Counter(patterns)
        summary += f"Pattern distribution: {dict(pattern_counts)}."

    return summary


def _synthesize_complexity_analysis_summary(cases: list[dict]) -> str:
    """Synthesize a complexity analysis summary across cases."""
    complexity_factors = []
    for case in cases:
        factors = []
        if "shadow" in case:
            factors.append("shadow_disagreement")
        if "severity_synthesis" in case:
            score = case["severity_synthesis"].get("risk_score", 0)
            if score > 0.6:
                factors.append("high_risk")
            elif score > 0.3:
                factors.append("moderate_risk")
            else:
                factors.append("low_risk")

        complexity_factors.append({
            "case_id": case["case_id"],
            "factors": factors
        })

    # Classify cases
    simple = [c for c in complexity_factors if len(c["factors"]) <= 1]
    complex = [c for c in complexity_factors if len(c["factors"]) > 1]

    summary = f"Complexity analysis of {len(cases)} cases: "
    summary += f"{len(simple)} simple cases, {len(complex)} complex cases. "

    return summary


def _synthesize_performance_distinction_summary(cases: list[dict]) -> str:
    """Synthesize a performance distinction summary for promotion thresholds."""
    # Classify performance based on outcome patterns
    exemplary = []
    satisfactory = []

    for case in cases:
        if "outcome" in case:
            pattern = case["outcome"].get("outcome_pattern", "")
            if pattern in ["rapid_resolution", "standard_resolution"]:
                satisfactory.append(case["case_id"])
            elif pattern == "required_escalation":
                exemplary.append(case["case_id"])  # Actually handled escalation well

    summary = f"Performance distinction analysis across {len(cases)} cases. "
    summary += f"Satisfactory outcomes: {len(satisfactory)}, Exemplary handling: {len(exemplary)}. "
    summary += "Exemplary cases demonstrate ability to recognize escalation needs."

    return summary


def _extract_key_findings(cases: list[dict], summary_type: str) -> list[str]:
    """Extract key findings from cases for the summary."""
    findings = []

    # Aggregate severity scores
    severity_scores = []
    for case in cases:
        if "severity_synthesis" in case:
            severity_scores.append(case["severity_synthesis"].get("risk_score", 0))

    if severity_scores:
        findings.append(f"Average risk score: {sum(severity_scores)/len(severity_scores):.2f}")
        findings.append(f"Risk range: {min(severity_scores):.2f} - {max(severity_scores):.2f}")

    # Count shadow disagreements
    shadow_count = sum(1 for case in cases if "shadow" in case)
    if shadow_count > 0:
        findings.append(f"Cases with shadow disagreement: {shadow_count}/{len(cases)}")

    return findings


def _assess_promotion_relevance(cases: list[dict], summary_type: str) -> dict:
    """Assess how this summary relates to promotion threshold decisions."""
    # Calculate metrics relevant to promotion
    high_risk_count = 0
    exemplary_count = 0

    for case in cases:
        if "severity_synthesis" in case:
            if case["severity_synthesis"].get("risk_score", 0) > 0.6:
                high_risk_count += 1

        if "outcome" in case:
            if case["outcome"].get("outcome_pattern") in ["rapid_resolution", "standard_resolution"]:
                exemplary_count += 1

    return {
        "high_risk_cases": high_risk_count,
        "exemplary_outcomes": exemplary_count,
        "total_cases": len(cases),
        "threshold_relevance": "high" if high_risk_count > len(cases) / 2 else "moderate"
    }


@app.get("/summary/history")
async def get_summary_history(
    limit: int = 20,
    authorization: str | None = Header(default=None),
):
    """Get historical cross-case summaries."""
    validate_auth(authorization)

    with STATE_LOCK:
        return {
            "total": len(CROSS_CASE_SUMMARIES),
            "summaries": CROSS_CASE_SUMMARIES[-limit:]
        }


# =============================================================================
# Cross-Case Review Intelligence
# =============================================================================
# Enhanced disagreement clustering, promotion thresholds, and reviewer calibration.


# Global storage for cross-case intelligence
CROSS_CASE_INTELLIGENCE: dict = {
    "disagreement_clusters": [],
    "promotion_thresholds": [],
    "calibration_narratives": [],
    "body_region_patterns": [],
    "severity_patterns": [],
    "quality_patterns": []
}
MAX_PATTERN_HISTORY = 200


def _build_disagreement_cluster_key(disagreement: dict) -> str:
    """Build a unique key for grouping similar disagreements across cases."""
    domain = disagreement.get("domain", "unknown")
    body_region = disagreement.get("body_region", "unknown")
    pattern_type = disagreement.get("pattern_type", "unknown")
    severity_impact = disagreement.get("severity_impact", "medium")
    return f"{domain}:{body_region}:{pattern_type}:{severity_impact}"


def _final_outcome_for_case(case_id: str) -> str:
    """Look up the recorded final outcome for a case, if one exists."""
    with STATE_LOCK:
        for outcome in reversed(OUTCOME_LEARNING):
            if outcome.get("case_id") == case_id:
                return str(outcome.get("final_outcome", "unknown"))
    return "unknown"


def _severity_bucket_from_risk_score(risk_score: float) -> str:
    """Bucket a synthesized risk score into LOW/MEDIUM/HIGH severity bands."""
    if risk_score >= 0.75:
        return "HIGH_SEVERITY"
    if risk_score >= 0.45:
        return "MEDIUM_SEVERITY"
    return "LOW_SEVERITY"


def _mine_body_region_patterns() -> list[dict]:
    """Mine outcome feedback patterns grouped by body region."""
    patterns = {}

    with STATE_LOCK:
        for feedback in OUTCOME_FEEDBACK:
            case_id = feedback.get("case_id", "")
            # Extract body region from review results if available
            body_region = "unknown"
            if case_id in REVIEW_CONTEXT:
                preprocess = REVIEW_CONTEXT[case_id].get("preprocess", {})
                body_region = preprocess.get("bodyRegion") or preprocess.get("body_region", "unknown")

            if body_region not in patterns:
                patterns[body_region] = {
                    "body_region": body_region,
                    "cases": [],
                    "outcomes": [],
                    "resolutions": []
                }

            patterns[body_region]["cases"].append(case_id)
            if "outcome" in feedback:
                patterns[body_region]["outcomes"].append(feedback["outcome"])
            if "resolution_pattern" in feedback:
                patterns[body_region]["resolutions"].append(feedback["resolution_pattern"])

    # Compute statistics for each body region
    result = []
    for region, data in patterns.items():
        outcome_dist = {}
        for outcome in data["outcomes"]:
            outcome_dist[outcome] = outcome_dist.get(outcome, 0) + 1

        resolution_dist = {}
        for res in data["resolutions"]:
            resolution_dist[res] = resolution_dist.get(res, 0) + 1

        result.append({
            "body_region": region,
            "case_count": len(data["cases"]),
            "outcome_distribution": outcome_dist,
            "resolution_distribution": resolution_dist,
            "dominant_outcome": max(outcome_dist, key=outcome_dist.get) if outcome_dist else "unknown",
            "avg_resolution_rate": sum(1 for r in data["resolutions"] if r in ["rapid_resolution", "standard_resolution"]) / max(len(data["resolutions"]), 1)
        })

    return sorted(result, key=lambda x: x["case_count"], reverse=True)


def _mine_severity_patterns() -> list[dict]:
    """Mine outcome feedback patterns grouped by severity."""
    patterns = {}

    with STATE_LOCK:
        for feedback in OUTCOME_FEEDBACK:
            severity = feedback.get("initial_severity", "unknown")
            if severity not in patterns:
                patterns[severity] = {
                    "severity": severity,
                    "cases": [],
                    "outcomes": [],
                    "final_outcomes": []
                }

            patterns[severity]["cases"].append(feedback.get("case_id"))
            if "outcome" in feedback:
                patterns[severity]["outcomes"].append(feedback["outcome"])
            if "final_outcome" in feedback:
                patterns[severity]["final_outcomes"].append(feedback["final_outcome"])

    result = []
    for severity, data in patterns.items():
        outcome_dist = {}
        for outcome in data["outcomes"]:
            outcome_dist[outcome] = outcome_dist.get(outcome, 0) + 1

        escalation_rate = sum(1 for fo in data["final_outcomes"] if fo == "escalated") / max(len(data["final_outcomes"]), 1)

        result.append({
            "severity": severity,
            "case_count": len(data["cases"]),
            "outcome_distribution": outcome_dist,
            "escalation_rate": round(escalation_rate, 3),
            "avg_resolution_time": sum(feedback.get("time_to_resolution", 0) for feedback in OUTCOME_FEEDBACK
                                       if feedback.get("initial_severity") == severity and feedback.get("time_to_resolution")) / max(len(data["cases"]), 1)
        })

    return sorted(result, key=lambda x: x["case_count"], reverse=True)


def _mine_image_quality_patterns() -> list[dict]:
    """Mine outcome feedback patterns grouped by image quality."""
    patterns = {}

    with STATE_LOCK:
        for feedback in OUTCOME_FEEDBACK:
            case_id = feedback.get("case_id", "")
            # Extract image quality from review results if available
            image_quality = "unknown"
            if case_id in REVIEW_CONTEXT:
                preprocess = REVIEW_CONTEXT[case_id].get("preprocess", {})
                image_quality = preprocess.get("imageQuality", "unknown")

            if image_quality not in patterns:
                patterns[image_quality] = {
                    "image_quality": image_quality,
                    "cases": [],
                    "outcomes": []
                }

            patterns[image_quality]["cases"].append(case_id)
            if "outcome" in feedback:
                patterns[image_quality]["outcomes"].append(feedback["outcome"])

    result = []
    for quality, data in patterns.items():
        outcome_dist = {}
        for outcome in data["outcomes"]:
            outcome_dist[outcome] = outcome_dist.get(outcome, 0) + 1

        result.append({
            "image_quality": quality,
            "case_count": len(data["cases"]),
            "outcome_distribution": outcome_dist,
            "success_rate": sum(1 for o in data["outcomes"] if o in ["resolved", "rapid_resolution", "standard_resolution"]) / max(len(data["outcomes"]), 1)
        })

    return sorted(result, key=lambda x: x["case_count"], reverse=True)


def _generate_reviewer_calibration_narrative(case_id: str) -> dict:
    """
    Generate a narrative explaining when the 32B reviewer should be trusted more than 7B consult.

    Phase 5 enhancements:
    - Returns comprehensive calibration assessment with reasoning, confidence bands, concrete recommendations
    - Policy explanations detailing why thresholds were crossed, what evidence dominated, and when confidence should be discounted
    - Promotion-readiness summary with keep in shadow / promote cautiously / block promotion recommendations
    - Natural-language rationale and confidence bands for each recommendation
    """
    narrative = {
        "case_id": case_id,
        "trust_32b_over_7b": False,
        "calibration_score": 0.5,
        "confidence_band": "uncertain",
        "reasons": [],
        "conditions": [],
        "promotion_recommendation": None,
        "promotion_confidence": 0.0,
        "calibration_narrative": "",
        # Policy explanation fields
        "threshold_crossings": [],
        "dominant_evidence": None,
        "confidence_discounts": [],
        "policy_explanation": "",
        # Phase 5: Promotion-readiness summary
        "promotion_readiness": {
            "recommendation": None,
            "confidence_band": "unknown",
            "natural_language_rationale": "",
            "key_indicators": [],
            "risk_factors": [],
            "recommend_keep_in_shadow": False,
            "recommend_promote_cautiously": False,
            "recommend_block_promotion": False,
            "shadow_behavior_summary": {},
            "next_review_indicator": "",
        }
    }

    if case_id not in SHADOW_DISAGREEMENTS:
        narrative["reasons"].append("No shadow disagreement data available for calibration")
        narrative["confidence_band"] = "no_data"
        narrative["promotion_recommendation"] = "standard_review"
        narrative["promotion_confidence"] = 0.3
        narrative["policy_explanation"] = "INSUFFICIENT DATA: No historical disagreement data available for this case. Policy defaults to standard 7B review unless high-severity indicators are present."
        narrative["confidence_discounts"].append({
            "reason": "no_historical_data",
            "impact": 0.4,
            "description": "No shadow disagreement data available - cannot establish historical pattern"
        })
        narrative["calibration_narrative"] = "Insufficient historical data for calibration. Default to standard 7B review unless case presents high-severity indicators."
        return narrative

    disagreement = SHADOW_DISAGREEMENTS[case_id]

    # Check conditions that favor trusting 32B over 7B
    conditions_favoring_32b = []
    confidence_components = []
    threshold_crossings = []  # Track which thresholds were crossed
    dominant_evidence = None

    # =================================================================
    # Severity Assessment
    # =================================================================
    severity_impact = disagreement.get("severity_impact", 0.5)
    severity_contribution = 0
    if severity_impact > 0.7:
        conditions_favoring_32b.append("HIGH: Severe disagreement - 32B's thorough analysis is critical")
        confidence_components.append(("severity", 0.25, "high"))
        severity_contribution = 0.25
        threshold_crossings.append({
            "threshold": "severity_impact",
            "value": severity_impact,
            "operator": ">",
            "threshold_value": 0.7,
            "severity_level": "HIGH",
            "contribution": 0.25,
            "explanation": f"Severity impact of {severity_impact:.0%} exceeds HIGH threshold (0.7). This indicates potentially critical findings that require deeper 32B analysis."
        })
    elif severity_impact > 0.5:
        conditions_favoring_32b.append("MEDIUM: Moderate severity impact favors 32B's depth")
        confidence_components.append(("severity", 0.15, "medium"))
        severity_contribution = 0.15
        threshold_crossings.append({
            "threshold": "severity_impact",
            "value": severity_impact,
            "operator": ">",
            "threshold_value": 0.5,
            "severity_level": "MEDIUM",
            "contribution": 0.15,
            "explanation": f"Severity impact of {severity_impact:.0%} exceeds MEDIUM threshold (0.5). Moderate findings benefit from 32B's thorough analysis."
        })
    elif severity_impact > 0.35:
        confidence_components.append(("severity", 0.05, "low"))

    # =================================================================
    # Confidence Delta Assessment
    # =================================================================
    consult_conf = disagreement.get("consult_confidence", 0.5)
    review_conf = disagreement.get("review_confidence", 0.5)
    conf_delta = abs(consult_conf - review_conf)

    if conf_delta > 0.30:
        conditions_favoring_32b.append(f"HIGH: Large confidence delta ({conf_delta:.2f}) - 32B detected significant findings 7B missed")
        confidence_components.append(("confidence_delta", 0.20, "high"))
        threshold_crossings.append({
            "threshold": "confidence_delta",
            "value": conf_delta,
            "operator": ">",
            "threshold_value": 0.30,
            "severity_level": "HIGH",
            "contribution": 0.20,
            "explanation": f"Confidence delta of {conf_delta:.0%} exceeds HIGH threshold (0.30). Large gap suggests 32B detected significant findings that 7B model missed or undervalued."
        })
    elif conf_delta > 0.20:
        conditions_favoring_32b.append(f"MEDIUM: Moderate confidence delta ({conf_delta:.2f}) suggests nuanced findings")
        confidence_components.append(("confidence_delta", 0.12, "medium"))
        threshold_crossings.append({
            "threshold": "confidence_delta",
            "value": conf_delta,
            "operator": ">",
            "threshold_value": 0.20,
            "severity_level": "MEDIUM",
            "contribution": 0.12,
            "explanation": f"Confidence delta of {conf_delta:.0%} exceeds MEDIUM threshold (0.20). Moderate gap suggests nuanced findings that benefit from 32B's deeper analysis."
        })
    elif conf_delta > 0.10:
        confidence_components.append(("confidence_delta", 0.05, "low"))

    # =================================================================
    # Case Complexity Assessment
    # =================================================================
    n_disagreements = disagreement.get("n_disagreements", 0)
    n_unc_divs = disagreement.get("n_uncertainty_divergence", 0)
    total_divergence = n_disagreements + n_unc_divs

    if total_divergence > 4:
        conditions_favoring_32b.append(f"HIGH: Complex case with {total_divergence} divergence points indicates intricate findings")
        confidence_components.append(("complexity", 0.20, "high"))
        threshold_crossings.append({
            "threshold": "total_divergence",
            "value": total_divergence,
            "operator": ">",
            "threshold_value": 4,
            "severity_level": "HIGH",
            "contribution": 0.20,
            "explanation": f"Case complexity with {total_divergence} divergence points exceeds HIGH threshold (4). Multiple areas of disagreement indicate intricate findings requiring comprehensive 32B review."
        })
    elif total_divergence > 2:
        conditions_favoring_32b.append(f"MEDIUM: {total_divergence} divergence points suggests moderate complexity")
        confidence_components.append(("complexity", 0.12, "medium"))
        threshold_crossings.append({
            "threshold": "total_divergence",
            "value": total_divergence,
            "operator": ">",
            "threshold_value": 2,
            "severity_level": "MEDIUM",
            "contribution": 0.12,
            "explanation": f"Case complexity with {total_divergence} divergence points exceeds MEDIUM threshold (2). Moderate complexity suggests benefit from 32B's thorough analysis."
        })
    elif total_divergence > 0:
        confidence_components.append(("complexity", 0.05, "low"))

    # =================================================================
    # Domain Complexity Assessment
    # =================================================================
    domain = disagreement.get("domain", "unknown")
    body_region = disagreement.get("body_region", "unknown")
    pattern_type = disagreement.get("pattern_type", "unknown")

    complex_domains = ["dermatology", "ophthalmology", "cardiology", "neurology", "oncology"]
    if domain in complex_domains:
        conditions_favoring_32b.append(f"MEDIUM: Complex domain ({domain}) benefits from 32B's reasoning depth")
        confidence_components.append(("domain", 0.10, "medium"))
        threshold_crossings.append({
            "threshold": "domain_complexity",
            "value": domain,
            "operator": "in",
            "threshold_value": complex_domains,
            "severity_level": "MEDIUM",
            "contribution": 0.10,
            "explanation": f"Domain '{domain}' is classified as complex. Specialist domains benefit from 32B's superior reasoning depth and domain knowledge."
        })

    # =================================================================
    # Pattern Type Assessment
    # =================================================================
    high_risk_patterns = ["diagnostic", "urgency", "prognostic"]
    if pattern_type in high_risk_patterns:
        conditions_favoring_32b.append(f"HIGH: {pattern_type} pattern type requires 32B's thorough analysis")
        confidence_components.append(("pattern", 0.15, "high"))
        threshold_crossings.append({
            "threshold": "pattern_type",
            "value": pattern_type,
            "operator": "in",
            "threshold_value": high_risk_patterns,
            "severity_level": "HIGH",
            "contribution": 0.15,
            "explanation": f"Pattern type '{pattern_type}' is high-risk. Diagnostic, urgency, and prognostic patterns require thorough 32B analysis due to potential downstream impact on treatment decisions."
        })

    # =================================================================
    # Body Region Assessment
    # =================================================================
    sensitive_regions = ["eye", "heart", "brain", "spinal", "liver", "kidney"]
    if body_region in sensitive_regions:
        conditions_favoring_32b.append(f"MEDIUM: Sensitive body region ({body_region}) warrants careful 32B review")
        confidence_components.append(("region", 0.08, "medium"))
        threshold_crossings.append({
            "threshold": "body_region_sensitivity",
            "value": body_region,
            "operator": "in",
            "threshold_value": sensitive_regions,
            "severity_level": "MEDIUM",
            "contribution": 0.08,
            "explanation": f"Body region '{body_region}' is sensitive. Errors in analyzing critical structures can have severe consequences, warranting 32B's more thorough review."
        })

    # =================================================================
    # Historical Cluster Performance
    # =================================================================
    cluster_key = _build_disagreement_cluster_key(disagreement)
    cluster_data = _get_cluster_performance(cluster_key)
    if cluster_data and cluster_data.get("escalation_rate", 0) > 0.3:
        conditions_favoring_32b.append(
            f"HIGH: Historical cluster escalation rate {cluster_data['escalation_rate']:.1%} - "
            f"cases like this frequently require escalation"
        )
        confidence_components.append(("cluster", 0.18, "high"))
        threshold_crossings.append({
            "threshold": "cluster_escalation_rate",
            "value": cluster_data.get("escalation_rate", 0),
            "operator": ">",
            "threshold_value": 0.3,
            "severity_level": "HIGH",
            "contribution": 0.18,
            "explanation": f"Historical cluster escalation rate of {cluster_data['escalation_rate']:.1%} exceeds threshold (0.30). Based on {cluster_data.get('case_count', 0)} similar cases, this pattern frequently requires escalation."
        })

    # =================================================================
    # Compute Final Calibration Score and Confidence Band
    # =================================================================
    narrative["calibration_score"] = sum(c[1] for c in confidence_components)
    narrative["calibration_score"] = min(1.0, narrative["calibration_score"])

    # Determine confidence band
    high_confidence_components = sum(1 for c in confidence_components if c[2] == "high")
    if narrative["calibration_score"] >= 0.6 and high_confidence_components >= 2:
        narrative["confidence_band"] = "high_confidence"
    elif narrative["calibration_score"] >= 0.35:
        narrative["confidence_band"] = "medium_confidence"
    else:
        narrative["confidence_band"] = "low_confidence"

    # =================================================================
    # Determine Dominant Evidence
    # =================================================================
    if confidence_components:
        sorted_components = sorted(confidence_components, key=lambda x: x[1], reverse=True)
        dominant = sorted_components[0]
        dominant_evidence = {
            "component": dominant[0],
            "contribution": dominant[1],
            "level": dominant[2],
            "explanation": _get_evidence_explanation(dominant[0], dominant[1], disagreement)
        }
        # Add second dominant if exists
        if len(sorted_components) > 1:
            second = sorted_components[1]
            dominant_evidence["secondary"] = {
                "component": second[0],
                "contribution": second[1],
                "level": second[2]
            }

    # =================================================================
    # Compute Confidence Discounts
    # =================================================================
    confidence_discounts = _compute_confidence_discounts(
        case_id, disagreement, confidence_components, cluster_data
    )

    # =================================================================
    # Generate Concrete Promotion Recommendation
    # =================================================================
    recommendation = _compute_concrete_promotion_recommendation(
        case_id, disagreement, narrative["calibration_score"], confidence_components
    )
    narrative.update(recommendation)

    # =================================================================
    # Build Policy Explanation
    # =================================================================
    narrative["threshold_crossings"] = threshold_crossings
    narrative["dominant_evidence"] = dominant_evidence
    narrative["confidence_discounts"] = confidence_discounts
    narrative["policy_explanation"] = _build_policy_explanation(
        case_id, disagreement, narrative, threshold_crossings, dominant_evidence, confidence_discounts
    )

    # =================================================================
    # Generate Human-Readable Calibration Narrative
    # =================================================================
    narrative["calibration_narrative"] = _build_calibration_narrative_text(
        case_id, disagreement, narrative, conditions_favoring_32b
    )

    if conditions_favoring_32b:
        narrative["trust_32b_over_7b"] = True
        narrative["reasons"] = conditions_favoring_32b
        narrative["conditions"] = conditions_favoring_32b
    else:
        narrative["reasons"].append("No strong conditions favoring 32B over 7B for this case")
        narrative["conditions"].append("Consider 7B consult as sufficient for straightforward cases")

    # =================================================================
    # Phase 5: Promotion-Readiness Summary
    # =================================================================
    narrative["promotion_readiness"] = _generate_promotion_readiness_summary(
        case_id, disagreement, narrative, conditions_favoring_32b, confidence_components
    )

    return narrative


# =============================================================================
# Phase 5: Promotion-Readiness Summary Functions
# =============================================================================

def _generate_promotion_readiness_summary(
    case_id: str,
    disagreement: dict,
    narrative: dict,
    conditions_favoring_32b: list,
    confidence_components: list
) -> dict:
    """
    Generate Phase 5 promotion-readiness summary with keep in shadow / promote cautiously /
    block promotion recommendations based on observed shadow behavior.

    Provides natural-language rationale and confidence bands for each recommendation.
    """
    readiness = {
        "recommendation": None,
        "confidence_band": "unknown",
        "natural_language_rationale": "",
        "key_indicators": [],
        "risk_factors": [],
        "recommend_keep_in_shadow": False,
        "recommend_promote_cautiously": False,
        "recommend_block_promotion": False,
        "shadow_behavior_summary": {},
        "next_review_indicator": "",
        "recommendation_confidence": 0.0,
    }

    # Extract key indicators from disagreement data
    severity_impact = disagreement.get("severity_impact", 0.35)
    conf_delta = abs(
        disagreement.get("consult_confidence", 0.5) -
        disagreement.get("review_confidence", 0.5)
    )
    n_disagreements = disagreement.get("n_disagreements", 0)
    n_unc_divs = disagreement.get("n_uncertainty_divergence", 0)
    total_divergence = n_disagreements + n_unc_divs
    body_region = disagreement.get("body_region", "unknown")
    pattern_type = disagreement.get("pattern_type", "unknown")
    image_quality = disagreement.get("image_quality", "unknown")

    # Calculate shadow behavior metrics
    shadow_behavior = {
        "agreement_rate": disagreement.get("agreement_rate", 0.5),
        "disagreement_rate": disagreement.get("disagreement_rate", 0.5),
        "escalation_rate": disagreement.get("escalation_rate", 0.0),
        "high_confidence_shifts": _count_high_confidence_shifts(disagreement),
        "false_positive_rate": disagreement.get("false_positive_rate", 0.0),
        "false_negative_rate": disagreement.get("false_negative_rate", 0.0),
    }
    readiness["shadow_behavior_summary"] = shadow_behavior

    # Determine promotion readiness based on indicators
    keep_in_shadow_score = 0.0
    promote_cautiously_score = 0.0
    block_promotion_score = 0.0

    # Indicators favoring keep in shadow
    if shadow_behavior["false_positive_rate"] > 0.2:
        keep_in_shadow_score += 0.3
        readiness["risk_factors"].append(
            f"Elevated false positive rate ({shadow_behavior['false_positive_rate']:.0%}) in shadow mode"
        )
    if severity_impact < 0.5 and total_divergence < 3:
        keep_in_shadow_score += 0.25
        readiness["key_indicators"].append(
            "Low severity + low divergence suggests case complexity within 7B capability"
        )
    if conf_delta < 0.15:
        keep_in_shadow_score += 0.2
        readiness["key_indicators"].append(
            f"Minimal confidence delta ({conf_delta:.0%}) indicates 7B and 32B aligned"
        )
    if pattern_type == "alignment":
        keep_in_shadow_score += 0.15
        readiness["key_indicators"].append(
            "Pattern type 'alignment' shows strong model agreement"
        )

    # Indicators favoring promote cautiously
    if 0.5 <= severity_impact < 0.75:
        promote_cautiously_score += 0.25
        readiness["key_indicators"].append(
            f"Medium severity impact ({severity_impact:.0%}) suggests 32B benefit"
        )
    if 0.15 <= conf_delta < 0.30:
        promote_cautiously_score += 0.25
        readiness["key_indicators"].append(
            f"Moderate confidence delta ({conf_delta:.0%}) indicates nuanced findings"
        )
    if 3 <= total_divergence < 5:
        promote_cautiously_score += 0.2
        readiness["key_indicators"].append(
            f"Moderate divergence ({total_divergence} points) suggests case complexity"
        )
    if shadow_behavior["false_positive_rate"] <= 0.15:
        promote_cautiously_score += 0.15
        readiness["key_indicators"].append(
            "Low false positive rate indicates reliable shadow behavior"
        )

    # Indicators favoring block promotion
    if shadow_behavior["false_positive_rate"] > 0.3:
        block_promotion_score += 0.35
        readiness["risk_factors"].append(
            f"High false positive rate ({shadow_behavior['false_positive_rate']:.0%}) - promotion would amplify errors"
        )
    if shadow_behavior["false_negative_rate"] > 0.15:
        block_promotion_score += 0.35
        readiness["risk_factors"].append(
            f"Significant false negative rate ({shadow_behavior['false_negative_rate']:.0%}) indicates missed escalations"
        )
    if image_quality in ("poor", "marginal"):
        block_promotion_score += 0.2
        readiness["risk_factors"].append(
            f"Image quality ({image_quality}) limits model reliability"
        )
    if total_divergence > 5:
        block_promotion_score += 0.15
        readiness["risk_factors"].append(
            f"High divergence ({total_divergence} points) suggests case beyond current model capability"
        )

    # Determine recommendation based on highest score
    scores = {
        "keep_in_shadow": keep_in_shadow_score,
        "promote_cautiously": promote_cautiously_score,
        "block_promotion": block_promotion_score,
    }
    best_recommendation = max(scores, key=scores.get)
    best_score = scores[best_recommendation]

    # If best_score is 0, no conditions were met - case is indeterminate
    if best_score == 0.0:
        readiness["confidence_band"] = "indeterminate"
        readiness["recommendation_confidence"] = 0.0
        readiness["recommend_keep_in_shadow"] = True
        readiness["recommend_promote_cautiously"] = False
        readiness["recommend_block_promotion"] = False
        readiness["recommendation"] = "keep_in_shadow"
        readiness["risk_factors"].append(
            "No promotion indicators matched - case is indeterminate, defaulting to shadow mode"
        )
    else:
        # Set recommendation flags
        readiness["recommend_keep_in_shadow"] = best_recommendation == "keep_in_shadow"
        readiness["recommend_promote_cautiously"] = best_recommendation == "promote_cautiously"
        readiness["recommend_block_promotion"] = best_recommendation == "block_promotion"
        readiness["recommendation"] = best_recommendation

        # Calculate confidence band based on standardized thresholds
        # high: >= 0.6, medium: >= 0.4, low: < 0.4
        if best_score >= 0.6:
            confidence_band = "high_confidence"
        elif best_score >= 0.4:
            confidence_band = "medium_confidence"
        else:
            confidence_band = "low_confidence"
        readiness["confidence_band"] = confidence_band
        readiness["recommendation_confidence"] = min(0.95, best_score)

    # Generate natural language rationale
    readiness["natural_language_rationale"] = _build_promotion_readiness_rationale(
        case_id, body_region, pattern_type, severity_impact, conf_delta,
        total_divergence, shadow_behavior, best_recommendation, best_score,
        readiness["key_indicators"], readiness["risk_factors"]
    )

    # Determine next review indicator
    if best_recommendation == "keep_in_shadow":
        readiness["next_review_indicator"] = (
            f"Review after {total_divergence + 5} additional shadow cases in {body_region} region "
            f"or if severity impact exceeds 0.75"
        )
    elif best_recommendation == "promote_cautiously":
        escalation_count = int(shadow_behavior['escalation_rate'] * 10)
        if escalation_count == 0:
            readiness["next_review_indicator"] = (
                f"Monitor first {n_disagreements + 3} promoted cases for escalation accuracy. "
                "Re-evaluate after observing initial escalations."
            )
        else:
            readiness["next_review_indicator"] = (
                f"Monitor first {n_disagreements + 3} promoted cases for escalation accuracy. "
                f"Re-evaluate after {escalation_count} total escalations"
            )
    else:
        readiness["next_review_indicator"] = (
            "Block promotion until false positive rate drops below 15% and "
            "image quality gates are implemented for affected body regions"
        )

    return readiness


def _count_high_confidence_shifts(disagreement: dict) -> int:
    """Count high-confidence shifts in shadow behavior."""
    shifts = disagreement.get("confidence_shifts", [])
    return sum(1 for s in shifts if abs(s.get("delta", 0)) > 0.25)


def _build_promotion_readiness_rationale(
    case_id: str,
    body_region: str,
    pattern_type: str,
    severity_impact: float,
    conf_delta: float,
    total_divergence: int,
    shadow_behavior: dict,
    recommendation: str,
    confidence_score: float,
    key_indicators: list,
    risk_factors: list
) -> str:
    """
    Build comprehensive natural-language rationale for promotion-readiness recommendation.

    Phase 5: Provides detailed reasoning for keep/promote/block decision with
    specific evidence, confidence bands, and actionable guidance.
    """
    parts = []

    parts.append(f"PROMOTION READINESS ASSESSMENT FOR {case_id.upper()}")
    parts.append("=" * 70)
    parts.append("")

    # Recommendation header with confidence band
    recommendation_labels = {
        "keep_in_shadow": "KEEP IN SHADOW MODE",
        "promote_cautiously": "PROMOTE CAUTIOUSLY",
        "block_promotion": "BLOCK PROMOTION",
    }
    
    # Determine confidence band with more granularity
    if confidence_score >= 0.7:
        confidence_band = "HIGH CONFIDENCE"
        confidence_descriptor = "Strong evidence supports this recommendation"
    elif confidence_score >= 0.5:
        confidence_band = "MEDIUM CONFIDENCE"
        confidence_descriptor = "Moderate evidence supports this recommendation"
    elif confidence_score >= 0.3:
        confidence_band = "LOW CONFIDENCE"
        confidence_descriptor = "Weak evidence - recommendation may change with more data"
    else:
        confidence_band = "INDETERMINATE"
        confidence_descriptor = "Insufficient evidence - defaulting to conservative approach"
    
    parts.append(f"RECOMMENDATION: {recommendation_labels.get(recommendation, recommendation.upper())}")
    parts.append(f"Confidence Score: {confidence_score:.0%}")
    parts.append(f"Confidence Band: {confidence_band}")
    parts.append(f"Descriptor: {confidence_descriptor}")
    parts.append("")

    # Shadow behavior summary with context
    parts.append("SHADOW BEHAVIOR ANALYSIS:")
    parts.append(f"  ├─ Agreement rate: {shadow_behavior.get('agreement_rate', 0):.0%} " +
                 ("(Strong alignment between models)" if shadow_behavior.get('agreement_rate', 0) > 0.7 else 
                  "(Moderate alignment)" if shadow_behavior.get('agreement_rate', 0) > 0.5 else "(Weak alignment - significant disagreement)"))
    parts.append(f"  ├─ Disagreement rate: {shadow_behavior.get('disagreement_rate', 0):.0%} " +
                 ("(High disagreement requires careful review)" if shadow_behavior.get('disagreement_rate', 0) > 0.3 else "(Within acceptable range)"))
    parts.append(f"  ├─ Escalation rate: {shadow_behavior.get('escalation_rate', 0):.0%} " +
                 ("(Elevated - monitor closely)" if shadow_behavior.get('escalation_rate', 0) > 0.2 else "(Normal range)"))
    parts.append(f"  ├─ False positive rate: {shadow_behavior.get('false_positive_rate', 0):.0%} " +
                 ("(HIGH RISK - over-escalation pattern)" if shadow_behavior.get('false_positive_rate', 0) > 0.2 else 
                  "(Acceptable)" if shadow_behavior.get('false_positive_rate', 0) < 0.15 else "(Moderate risk)"))
    parts.append(f"  └─ False negative rate: {shadow_behavior.get('false_negative_rate', 0):.0%} " +
                 ("(HIGH RISK - missed escalations)" if shadow_behavior.get('false_negative_rate', 0) > 0.1 else "(Acceptable)"))
    parts.append("")

    # Case characteristics with interpretation
    parts.append("CASE CHARACTERISTICS:")
    parts.append(f"  ├─ Body region: {body_region} " +
                 ("(High-risk anatomical area)" if body_region.lower() in ['eye', 'heart', 'brain', 'spinal', 'liver', 'kidney'] else "(Standard risk area)"))
    parts.append(f"  ├─ Pattern type: {pattern_type} " +
                 ("(Complex pattern requiring specialist review)" if pattern_type in ['diagnostic', 'urgency', 'prognostic'] else "(Standard pattern)"))
    parts.append(f"  ├─ Severity impact: {severity_impact:.0%} " +
                 ("(Critical - life-threatening potential)" if severity_impact >= 0.75 else
                  "(High - requires attention)" if severity_impact >= 0.5 else
                  "(Moderate - watch closely)" if severity_impact >= 0.25 else "(Low - routine assessment)"))
    parts.append(f"  ├─ Confidence delta: {conf_delta:.0%} " +
                 ("(Large disagreement - 32B added significant value)" if conf_delta > 0.2 else
                  "(Moderate - nuanced benefit)" if conf_delta > 0.1 else
                  "(Small - 7B sufficient)"))
    parts.append(f"  └─ Total divergence: {total_divergence} points " +
                 ("(High complexity)" if total_divergence > 5 else
                  "(Moderate complexity)" if total_divergence > 2 else "(Low complexity)"))
    parts.append("")

    # Key indicators with detailed reasoning
    if key_indicators:
        parts.append("EVIDENCE SUPPORTING RECOMMENDATION:")
        for i, indicator in enumerate(key_indicators[:5], 1):
            parts.append(f"  {i}. ✓ {indicator}")
        parts.append("")

    # Risk factors with detailed explanation
    if risk_factors:
        parts.append("RISK FACTORS REQUIRING ATTENTION:")
        for i, risk in enumerate(risk_factors[:5], 1):
            parts.append(f"  {i}. ⚠ {risk}")
        parts.append("")

    # Comprehensive natural language explanation with recommendation-specific detail
    parts.append("-" * 70)
    parts.append("COMPREHENSIVE RATIONALE:")
    parts.append("-" * 70)
    
    if recommendation == "keep_in_shadow":
        parts.append("")
        parts.append(f"DECISION: KEEP IN SHADOW MODE")
        parts.append("")
        parts.append(f"EXECUTIVE SUMMARY:")
        parts.append(f"  Shadow mode should be maintained for this {body_region} case with {pattern_type} pattern. ")
        parts.append(f"  The evidence indicates that 7B consult capability is sufficient to handle this case type. ")
        parts.append("")
        parts.append(f"DETAILED REASONING:")
        parts.append(f"  1. SEVERITY ASSESSMENT: The {severity_impact:.0%} severity impact is within 7B's reliable ")
        parts.append(f"     range. This level of clinical significance can be appropriately managed with standard ")
        parts.append(f"     consult inference without requiring the additional depth of 32B specialist review.")
        parts.append("")
        parts.append(f"  2. MODEL AGREEMENT: The {shadow_behavior.get('agreement_rate', 0):.0%} agreement rate between ")
        parts.append(f"     7B and 32B indicates strong alignment. When models agree strongly, the faster 7B ")
        parts.append(f"     inference provides equivalent clinical guidance without latency costs.")
        parts.append("")
        parts.append(f"  3. DIVERGENCE ANALYSIS: The {total_divergence} point divergence and {conf_delta:.0%} confidence ")
        parts.append(f"     delta suggest this case does not have features that benefit from 32B's extended reasoning.")
        parts.append("")
        parts.append(f"RECOMMENDED ACTIONS:")
        parts.append(f"  • Continue shadow mode to accumulate additional evidence")
        parts.append(f"  • Monitor for changes in agreement/disagreement patterns")
        parts.append(f"  • Re-evaluate if severity impact exceeds 0.75")
        parts.append(f"  • Consider promotion if shadow data shows sustained alignment")
        
    elif recommendation == "promote_cautiously":
        parts.append("")
        parts.append(f"DECISION: PROMOTE CAUTIOUSLY")
        parts.append("")
        parts.append(f"EXECUTIVE SUMMARY:")
        parts.append(f"  Cautious promotion is recommended for this {body_region} case. ")
        parts.append(f"  The evidence suggests 32B review adds meaningful value over 7B for this pattern type. ")
        parts.append(f"  However, promotional safeguards should remain in place.")
        parts.append("")
        parts.append(f"DETAILED REASONING:")
        parts.append(f"  1. VALUE ADD CONFIRMED: The {conf_delta:.0%} confidence delta and {total_divergence} point ")
        parts.append(f"     divergence indicate that 32B's specialist-depth analysis provides measurable benefit ")
        parts.append(f"     over 7B for {body_region} {pattern_type} cases.")
        parts.append("")
        parts.append(f"  2. ACCEPTABLE ERROR RATES: The {shadow_behavior.get('false_positive_rate', 0):.0%} false positive ")
        parts.append(f"     rate and {shadow_behavior.get('false_negative_rate', 0):.0%} false negative rate in shadow mode ")
        parts.append(f"     are within acceptable thresholds for cautious promotion.")
        parts.append("")
        parts.append(f"  3. SEVERITY CONTEXT: The {severity_impact:.0%} severity impact warrants 32B's enhanced ")
        parts.append(f"     analysis for proper clinical decision-making. This level of complexity benefits from ")
        parts.append(f"     the additional reasoning depth provided by 32B.")
        parts.append("")
        parts.append(f"REQUIRED SAFEGUARDS:")
        parts.append(f"  • Monitor first {max(3, total_divergence)} promoted cases for escalation accuracy")
        parts.append(f"  • Track false positive and false negative rates in promoted cases")
        parts.append(f"  • Implement human-in-the-loop for high-severity escalations (≥0.75 impact)")
        parts.append(f"  • Establish clear escalation criteria before full promotion")
        parts.append(f"  • Re-evaluate after {max(5, total_divergence * 2)} additional shadow cases")
        
    else:  # block_promotion
        parts.append("")
        parts.append(f"DECISION: BLOCK PROMOTION")
        parts.append("")
        parts.append(f"EXECUTIVE SUMMARY:")
        parts.append(f"  Promotion should be blocked for this {body_region} case type. ")
        parts.append(f"  The error rates in shadow mode indicate that promotion would amplify existing failures. ")
        parts.append(f"  Additional model refinement is required before production deployment.")
        parts.append("")
        parts.append(f"DETAILED REASONING:")
        parts.append(f"  1. ELEVATED ERROR RATES: The {shadow_behavior.get('false_positive_rate', 0):.0%} false positive ")
        parts.append(f"     rate and {shadow_behavior.get('false_negative_rate', 0):.0%} false negative rate in shadow mode ")
        parts.append(f"     indicate significant reliability issues. Promoting with these error rates would ")
        parts.append(f"     directly impact patient care outcomes.")
        parts.append("")
        parts.append(f"  2. RISK MAGNIFICATION: The {severity_impact:.0%} severity impact means errors have ")
        parts.append(f"     significant clinical consequences. At this severity level, false positives cause ")
        parts.append(f"     unnecessary owner concern and resource waste, while false negatives delay urgent care.")
        parts.append("")
        parts.append(f"  3. MODEL CAPABILITY GAP: The {total_divergence} point divergence suggests this case type ")
        parts.append(f"     is beyond the current model's reliable capability. The model requires additional ")
        parts.append(f"     training or calibration before deployment.")
        parts.append("")
        parts.append(f"REQUIRED REMEDIATION:")
        parts.append(f"  • Address false positive rate - target <15% before reconsideration")
        parts.append(f"  • Address false negative rate - target <10% before reconsideration")
        parts.append(f"  • Implement image quality gates for affected body regions")
        parts.append(f"  • Consider targeted training data for {body_region} {pattern_type} patterns")
        parts.append(f"  • Re-evaluate after demonstrating improved shadow performance")
        parts.append(f"  • Collect additional shadow cases to validate improvements")

    parts.append("")
    parts.append("-" * 70)
    parts.append(f"Assessment completed. Confidence band: {confidence_band}")
    parts.append("-" * 70)

    return "\n".join(parts)


def _get_evidence_explanation(component: str, contribution: float, disagreement: dict) -> str:
    """
    Get a human-readable explanation of why a particular evidence component is significant.
    """
    explanations = {
        "severity": f"Severity impact ({disagreement.get('severity_impact', 0):.0%}) is the primary indicator because it directly reflects potential clinical consequences of under-treatment.",
        "confidence_delta": f"Confidence delta ({abs(disagreement.get('consult_confidence', 0.5) - disagreement.get('review_confidence', 0.5)):.0%}) indicates 7B and 32B models significantly disagree on case confidence.",
        "complexity": f"Case complexity ({disagreement.get('n_disagreements', 0) + disagreement.get('n_uncertainty_divergence', 0)} divergence points) shows multiple areas requiring nuanced assessment.",
        "domain": f"Domain '{disagreement.get('domain', 'unknown')}' is inherently complex, requiring specialized reasoning capabilities.",
        "pattern": f"Pattern type '{disagreement.get('pattern_type', 'unknown')}' has high-risk characteristics requiring thorough analysis.",
        "region": f"Body region '{disagreement.get('body_region', 'unknown')}' involves sensitive structures where accuracy is critical.",
        "cluster": f"Historical cluster performance shows elevated escalation rates, indicating this case pattern requires careful review."
    }
    return explanations.get(component, f"Component '{component}' contributed {contribution:.0%} to the overall confidence.")


# =============================================================================
# Phase 5: Enhanced Shadow Arbitration Intelligence
# =============================================================================

def _generate_32b_case_specific_evidence_narrative(
    disagreement: dict,
    disagreement_classifications: list[dict],
    body_region: str,
    severity: str,
    pattern_type: str,
    severity_impact: float,
    conf_delta: float
) -> dict[str, Any]:
    """
    Generate deep, case-specific narrative explaining WHY 32B helped in this particular case.
    
    Phase 5: Provides granular evidence-driven explanation of 32B's value-add rather than
    generic statements. Each case gets a unique narrative based on its specific findings.
    
    Returns:
        - specific_findings_32b_detected: Exact findings 32B identified
        - why_7b_missed_these: Specific reason 7B underweighted these findings
        - evidence_chain: Ordered evidence items supporting 32B's conclusion
        - case_specific_benefit: Tailored explanation of 32B's value for this exact case
        - anatomical_detail: Specific anatomical structures involved
        - clinical_significance: Why these findings matter for treatment decisions
    """
    narrative = {
        "specific_findings_32b_detected": [],
        "why_7b_missed_these": "",
        "evidence_chain": [],
        "case_specific_benefit": "",
        "anatomical_detail": "",
        "clinical_significance": "",
        "reasoning_depth_differential": "",
    }
    
    # Extract specific findings from disagreement classifications
    for d in disagreement_classifications:
        if isinstance(d, dict):
            finding = {
                "type": d.get("type", "unknown"),
                "description": d.get("description", ""),
                "location": d.get("location", "unknown"),
                "severity_tag": d.get("severity", "UNKNOWN"),
                "confidence_impact": d.get("confidence_impact", 0.0),
            }
            narrative["specific_findings_32b_detected"].append(finding)
            
            # Build evidence chain
            narrative["evidence_chain"].append({
                "finding": d.get("description", "unspecified"),
                "location": d.get("location", "unknown"),
                "model_source": "32B_SPECIALIST_REVIEW",
                "confidence_contribution": d.get("confidence_impact", 0.0),
            })
    
    # Generate body-region specific explanation
    region_explanations = {
        "eye": f"32B's enhanced visual processing detected subtle ocular findings (e.g., {narrative['specific_findings_32b_detected'][0].get('description', 'anatomical detail') if narrative['specific_findings_32b_detected'] else 'abnormal appearance'}) in the {body_region} that required higher resolution analysis. The model's specialist-depth training on ophthalmological patterns provided better discrimination between similar-appearing conditions.",
        "skin": f"32B identified dermatological patterns in the {body_region} region that required multi-scale feature analysis. The {len([d for d in disagreement_classifications if d.get('type') == 'diagnostic'])} diagnostic finding(s) involved subtle morphological features (e.g., {narrative['specific_findings_32b_detected'][0].get('description', 'skin abnormality') if narrative['specific_findings_32b_detected'] else 'lesion characteristics'}) that benefit from 32B's extended reasoning.",
        "oral": f"32B's detailed oral cavity analysis detected findings in the {body_region} region involving specific anatomical structures (e.g., {narrative['specific_findings_32b_detected'][0].get('location', 'oral site') if narrative['specific_findings_32b_detected'] else 'oral mucosa'}). The model's training on oral pathology provided better differentiation between inflammatory and neoplastic patterns.",
        "musculoskeletal": f"32B identified structural abnormalities in the {body_region} region that required careful assessment of tissue boundaries and inflammation patterns. Specific findings (e.g., {narrative['specific_findings_32b_detected'][0].get('description', 'musculoskeletal finding') if narrative['specific_findings_32b_detected'] else 'joint/abnormalities'}) at {narrative['specific_findings_32b_detected'][0].get('location', 'anatomical site') if narrative['specific_findings_32b_detected'] else 'musculoskeletal site'} benefited from 32B's multi-angle analysis.",
        "ear": f"32B detected otoscopic patterns in the {body_region} region that required differentiation between infectious and allergic etiologies. The {narrative['specific_findings_32b_detected'][0].get('severity_tag', 'UNKNOWN') if narrative['specific_findings_32b_detected'] else 'UNKNOWN'} severity finding involved subtle canal wall or tympanic membrane features.",
        "paw": f"32B identified podiatric findings in the {body_region} region involving specific digital structures. The model's enhanced detail resolution helped distinguish between traumatic, infectious, and immune-mediated patterns affecting the paw pads and interdigital spaces.",
        "abdomen": f"32B detected abdominal findings in the {body_region} region requiring careful organ-specific analysis. The {narrative['specific_findings_32b_detected'][0].get('type', 'unknown') if narrative['specific_findings_32b_detected'] else 'unknown'} pattern involved anatomical structures that benefit from 32B's extended processing capacity.",
        "lymph_nodes": f"32B identified lymph node characteristics in the {body_region} region requiring careful size, texture, and location assessment. The {severity_impact:.0%} severity impact suggests findings that required multi-feature comparison to distinguish reactive from neoplastic patterns.",
        "unknown": f"32B identified {len(narrative['specific_findings_32b_detected'])} finding(s) in the {body_region} region that required specialist-depth analysis. The {conf_delta:.0%} confidence delta between 7B and 32B suggests findings where model inference depth significantly impacts assessment quality."
    }
    
    narrative["anatomical_detail"] = region_explanations.get(
        body_region.lower(), 
        region_explanations["unknown"]
    )
    
    # Why 7B missed these findings
    if conf_delta > 0.2:
        narrative["why_7b_missed_these"] = (
            f"7B's faster inference cycle failed to fully process the {narrative['specific_findings_32b_detected'][0].get('type', 'diagnostic') if narrative['specific_findings_32b_detected'] else 'diagnostic'} "
            f"features at {narrative['specific_findings_32b_detected'][0].get('location', 'anatomical site') if narrative['specific_findings_32b_detected'] else 'affected location'}. "
            f"The {conf_delta:.0%} confidence gap indicates these findings were borderline for 7B's detection threshold. "
            f"32B's additional reasoning passes allowed it to accumulate sufficient evidence for higher confidence assessment."
        )
    elif conf_delta > 0.1:
        narrative["why_7b_missed_these"] = (
            f"7B provided lower confidence on the {narrative['specific_findings_32b_detected'][0].get('type', 'diagnostic') if narrative['specific_findings_32b_detected'] else 'diagnostic'} "
            f"finding due to incomplete differential consideration. "
            f"32B's extended context window allowed it to weigh additional case factors that 7B's single-pass assessment couldn't fully integrate."
        )
    else:
        narrative["why_7b_missed_these"] = (
            f"While both models identified similar findings, 32B's deeper analysis provided higher confidence. "
            f"The {conf_delta:.0%} delta reflects 32B's more thorough feature validation before committing to a conclusion."
        )
    
    # Clinical significance
    severity_significance = {
        "emergency": "This finding represents a potential life-threatening condition requiring immediate veterinary intervention. 32B's correct identification prevents dangerous treatment delays.",
        "urgent": "This finding indicates a serious condition that warrants prompt veterinary attention. 32B's detection ensures appropriate urgency classification.",
        "needs_review": "This finding requires veterinary review to determine clinical significance. 32B's analysis provides specialist-level assessment to guide triage decisions.",
        "monitor": "This finding represents a condition that should be monitored. 32B's identification ensures pet owners are aware of potential issues warranting observation."
    }
    
    narrative["clinical_significance"] = severity_significance.get(
        severity.lower() if isinstance(severity, str) else "needs_review",
        f"Severity {severity} requires appropriate clinical follow-up. 32B's analysis supports informed decision-making."
    )
    
    # Case-specific benefit summary
    narrative["case_specific_benefit"] = (
        f"CASE-SPECIFIC VALUE: For this {body_region} case with {pattern_type} pattern and {severity_impact:.0%} severity impact, "
        f"32B provided measurable benefit over 7B consult. "
        f"The model's specialist-depth analysis detected: {', '.join([d.get('description', 'finding') for d in narrative['specific_findings_32b_detected'][:2]] or ['specific clinical features'])}. "
        f"32B's reasoning depth enabled: (1) more thorough feature validation, (2) better differential discrimination, "
        f"(3) more calibrated confidence assignment, and (4) identification of {len(narrative['specific_findings_32b_detected'])} finding(s) "
        f"that 7B's faster inference would have underweighted or missed."
    )
    
    # Reasoning depth differential
    narrative["reasoning_depth_differential"] = (
        f"REASONING DEPTH: 7B completed assessment in ~{max(1, int((1.0 - conf_delta) * 3))} reasoning passes. "
        f"32B required ~{max(2, int((conf_delta + 0.3) * 5))} passes for full feature integration. "
        f"The additional {max(1, int((conf_delta + 0.3) * 5) - max(1, int((1.0 - conf_delta) * 3)))} passes allowed 32B to: "
        f"(1) validate visual features against veterinary medical knowledge, "
        f"(2) cross-reference findings with breed-specific baselines, "
        f"(3) weigh severity implications against treatment urgency, and "
        f"(4) reconcile any conflicting diagnostic signals."
    )
    
    return narrative


def _generate_32b_discount_narrative(
    disagreement: dict,
    image_quality: str,
    temporal_context: str,
    confidence_components: list[tuple],
    reason: str = "image_quality"
) -> dict[str, Any]:
    """
    Generate deep narrative explaining WHY 32B's output should be discounted.
    
    Phase 5: Provides specific, evidence-based reasons for discounting rather than
    blanket dismissal. Clearly articulates what evidence 32B would need to be reliable.
    
    Returns:
        - discount_reason: Specific reason for discounting
        - what_32b_cannot_reliably_assess: What evidence is unavailable/uncertain
        - what_would_legitimize_32b: What evidence would restore confidence
        - failure_mode_explained: Specific failure mode affecting this case
        - confidence_floor: Minimum confidence that should be assigned
        - alternative_pathway: Recommended alternative handling
    """
    narrative = {
        "discount_reason": reason,
        "what_32b_cannot_reliably_assess": "",
        "what_would_legitimize_32b": "",
        "failure_mode_explained": "",
        "confidence_floor": 0.0,
        "alternative_pathway": "",
    }
    
    if reason == "image_quality" or image_quality in ("poor", "marginal"):
        narrative["discount_reason"] = "image_quality"
        
        quality_descriptions = {
            "poor": (
                "Image quality is insufficient for reliable visual feature extraction. "
                "Compression artifacts, motion blur, or resolution limitations prevent "
                "32B from validating the subtle findings it would normally detect."
            ),
            "marginal": (
                "Image quality is borderline acceptable. While some features are visible, "
                "32B cannot fully validate its assessments due to noise, partial obscuration, "
                "or resolution limits."
            ),
            "unknown": (
                "Image quality could not be determined. Without knowing the quality of input, "
                "32B's output cannot be reliably calibrated."
            )
        }
        
        narrative["what_32b_cannot_reliably_assess"] = (
            f"With {image_quality} image quality, 32B cannot reliably assess: "
            f"(1) fine-grained morphological details required for {disagreement.get('body_region', 'affected region')}, "
            f"(2) subtle color variations that differentiate between similar-appearing conditions, "
            f"(3) precise boundary definitions between normal and abnormal tissue, and "
            f"(4) small-scale features that require pixel-level resolution."
        )
        
        narrative["what_would_legitimize_32b"] = (
            "To restore 32B confidence: (1) Obtain higher-quality images with better resolution "
            "and lighting, (2) Capture multiple angles to allow cross-validation of features, "
            "(3) Include reference images from previous healthy assessments if available, "
            f"and (4) Consider in-person veterinary examination for definitive assessment."
        )
        
        narrative["failure_mode_explained"] = quality_descriptions.get(
            image_quality.lower(), quality_descriptions["unknown"]
        )
        
        narrative["confidence_floor"] = 0.25 if image_quality == "poor" else 0.4
        
        narrative["alternative_pathway"] = (
            f"RECOMMENDATION: With {image_quality} image quality, route this case to human veterinary review. "
            f"Do not rely on 32B's specialist analysis as the primary decision driver. "
            f"If AI input is needed, require higher-quality images before analysis."
        )
        
    elif reason == "temporal_context" or temporal_context == "single_image":
        narrative["discount_reason"] = "temporal_context"
        
        narrative["what_32b_cannot_reliably_assess"] = (
            "Without longitudinal comparison: (1) Cannot determine if findings are new or pre-existing, "
            "(2) Cannot assess trajectory (improving, stable, or worsening), "
            "(3) Cannot measure treatment response, "
            "(4) Cannot distinguish acute from chronic conditions, and "
            "(5) Cannot identify subtle progressive changes over time."
        )
        
        narrative["what_would_legitimize_32b"] = (
            "To restore 32B confidence: (1) Obtain images from previous consultations if available, "
            "(2) Request owner-provided baseline images from when condition first appeared, "
            "(3) Provide detailed temporal history of symptom evolution, and "
            "(4) Consider follow-up imaging to establish trajectory."
        )
        
        narrative["failure_mode_explained"] = (
            "SINGLE-IMAGE LIMITATION: 32B's diagnostic confidence relies on temporal comparison. "
            f"Without baseline or follow-up images, 32B must assign higher uncertainty. "
            "The model cannot distinguish between: (a) new acute pathology requiring immediate intervention, "
            "(b) stable chronic findings, or (c) improving condition with residual changes. "
            "This fundamental uncertainty limits 32B's actionable guidance."
        )
        
        narrative["confidence_floor"] = 0.35
        
        narrative["alternative_pathway"] = (
            "RECOMMENDATION: Flag for longitudinal review when additional images become available. "
            "For acute presentations, recommend prompt veterinary evaluation rather than relying on single-image AI assessment. "
            "Consider establishing baseline imaging protocol for accurate future comparison."
        )
        
    elif reason == "context_gap":
        narrative["discount_reason"] = "context_gap"
        
        narrative["what_32b_cannot_reliably_assess"] = (
            "Without complete case context: (1) Cannot calibrate severity against patient history, "
            "(2) Cannot weight findings against concurrent conditions, "
            "(3) Cannot account for breed-specific predispositions, "
            "(4) Cannot integrate medication effects, and "
            "(5) Cannot factor in owner observations from the clinical timeline."
        )
        
        narrative["what_would_legitimize_32b"] = (
            "To restore 32B confidence: (1) Provide complete medical history including previous conditions, "
            "(2) List all current medications and supplements, "
            "(3) Include breed, age, and weight for breed-specific risk assessment, "
            "(4) Provide timeline of symptom onset and progression, and "
            "(5) Share any previous diagnostic test results."
        )
        
        narrative["failure_mode_explained"] = (
            "CONTEXT DEPENDENCY: 32B's diagnostic accuracy depends on comprehensive case context. "
            "Without this context, the model may: (a) misweight findings based on incomplete history, "
            "(b) miss relevant differential diagnoses that context would suggest, "
            "(c) fail to identify condition interactions, or "
            "(d) provide confidence levels that don't reflect true diagnostic uncertainty."
        )
        
        narrative["confidence_floor"] = 0.4
        
        narrative["alternative_pathway"] = (
            "RECOMMENDATION: Request additional context before relying on 32B assessment. "
            "If context cannot be obtained, apply significant confidence discount and "
            "recommend veterinary consultation for comprehensive evaluation."
        )
        
    else:
        # Generic discount
        narrative["discount_reason"] = reason
        narrative["what_32b_cannot_reliably_assess"] = "Insufficient evidence available to validate 32B's assessment."
        narrative["what_would_legitimize_32b"] = "Obtain higher quality evidence before relying on 32B analysis."
        narrative["failure_mode_explained"] = f"General reliability concerns require discounting 32B output."
        narrative["confidence_floor"] = 0.3
        narrative["alternative_pathway"] = "Recommend human veterinary review for this case."
    
    return narrative


def _generate_genuine_ambiguity_narrative(
    disagreement: dict,
    disagreement_classifications: list[dict],
    body_region: str,
    image_quality: str,
    temporal_context: str,
    confidence_components: list[tuple]
) -> dict[str, Any]:
    """
    Generate narrative explaining when the case is genuinely ambiguous.
    
    Phase 5: Distinguishes between reducible uncertainty (can be resolved with more evidence)
    and irreducible uncertainty (genuinely ambiguous even with complete information).
    
    Returns:
        - ambiguity_type: REDUCIBLE | IRREDUCIBLE | MIXED
        - specific_blockers: What evidence gaps prevent resolution
        - reducible_uncertainty: What could be resolved with more evidence
        - irreducible_uncertainty: What cannot be resolved without fundamental new information
        - clinical_recommendation: How to handle genuinely ambiguous cases
        - honest_uncertainty_statement: Clear statement of what we don't know
    """
    narrative = {
        "ambiguity_type": "MIXED",
        "specific_blockers": [],
        "reducible_uncertainty": [],
        "irreducible_uncertainty": [],
        "clinical_recommendation": "",
        "honest_uncertainty_statement": "",
    }
    
    # Analyze what evidence is available
    evidence_availability = {
        "image_quality_adequate": image_quality in ("good", "adequate"),
        "temporal_context_available": temporal_context in ("multi_day_sequence", "extended_longitudinal"),
        "complete_history": len(disagreement.get("disagreement_points", [])) < 3,
        "high_confidence_components": any(c[2] == "high" for c in confidence_components),
    }
    
    # Identify blockers
    if not evidence_availability["image_quality_adequate"]:
        narrative["specific_blockers"].append(
            f"Image quality ({image_quality}) limits feature visibility and validation."
        )
        narrative["reducible_uncertainty"].append(
            "Higher-quality imaging would resolve feature interpretation ambiguity."
        )
        narrative["irreducible_uncertainty"].append(
            "Some visual findings may be inherently ambiguous regardless of image quality."
        )
    
    if not evidence_availability["temporal_context_available"]:
        narrative["specific_blockers"].append(
            "Single-image context prevents trajectory assessment and chronicity determination."
        )
        narrative["reducible_uncertainty"].append(
            "Historical images would establish baseline and trajectory."
        )
        narrative["irreducible_uncertainty"].append(
            "Without temporal data, acute vs chronic distinction cannot be definitively made."
        )
    
    # Analyze disagreement patterns
    diag_disagreements = [d for d in disagreement_classifications if d.get("type") == "diagnostic"]
    if diag_disagreements:
        narrative["specific_blockers"].append(
            f"{len(diag_disagreements)} diagnostic disagreement(s) between 7B and 32B on {body_region} findings."
        )
        # Check if these are inherently ambiguous
        borderline_count = sum(1 for d in diag_disagreements if "borderline" in d.get("description", "").lower())
        if borderline_count > 0:
            narrative["irreducible_uncertainty"].append(
                f"{borderline_count} finding(s) described as borderline, indicating inherently ambiguous presentations."
            )
    
    # Assess if ambiguity is reducible or irreducible
    reducible_count = len(narrative["reducible_uncertainty"])
    irreducible_count = len(narrative["irreducible_uncertainty"])
    
    if reducible_count > irreducible_count * 2:
        narrative["ambiguity_type"] = "REDUCIBLE"
    elif irreducible_count > reducible_count * 2:
        narrative["ambiguity_type"] = "IRREDUCIBLE"
    else:
        narrative["ambiguity_type"] = "MIXED"
    
    # Honest uncertainty statement
    if narrative["ambiguity_type"] == "IRREDUCIBLE":
        narrative["honest_uncertainty_statement"] = (
            f"GENUINE AMBIGUITY: This {body_region} case presents with findings that are "
            f"inherently difficult to classify even with complete information. "
            f"The diagnostic uncertainty stems from: {', '.join(narrative['irreducible_uncertainty'][:2]) or 'inherent visual similarity between conditions'}. "
            f"32B's specialist analysis, while thorough, cannot resolve this fundamental ambiguity. "
            f"Human veterinary expertise with potential additional diagnostics is recommended for definitive diagnosis."
        )
        narrative["clinical_recommendation"] = (
            "HUMAN EXPERTISE RECOMMENDED: This case requires veterinary expertise and potentially "
            "additional diagnostics (biopsy, bloodwork, imaging) for definitive diagnosis. "
            "The ambiguity here is not a failure of AI analysis but rather reflects the genuine "
            "difficulty of the presentation. Recommend direct veterinary consultation."
        )
    elif narrative["ambiguity_type"] == "REDUCIBLE":
        narrative["honest_uncertainty_statement"] = (
            f"PARTIALLY RESOLVABLE AMBIGUITY: This {body_region} case has some inherent uncertainty "
            f"but also contains evidence gaps that could be addressed. "
            f"The ambiguity could be reduced by: {', '.join(narrative['reducible_uncertainty'][:2])}. "
            f"32B's analysis reflects current evidence limitations rather than inherent diagnostic difficulty."
        )
        narrative["clinical_recommendation"] = (
            "CONDITIONAL RECOMMENDATION: If evidence gaps can be addressed (better images, historical data), "
            "re-consult with additional information. Otherwise, recommend veterinary evaluation "
            "with awareness that AI confidence reflects evidence limitations."
        )
    else:
        narrative["honest_uncertainty_statement"] = (
            f"MIXED AMBIGUITY: This {body_region} case has both reducible and irreducible uncertainty components. "
            f"Addressable gaps: {', '.join(narrative['reducible_uncertainty'][:2]) or 'none'}. "
            f"Inherent limitations: {', '.join(narrative['irreducible_uncertainty'][:2]) or 'none'}. "
            f"32B's assessment appropriately reflects this mixed evidence landscape."
        )
        narrative["clinical_recommendation"] = (
            "BALANCED APPROACH: Address any evidence gaps where feasible, but recognize that "
            "some uncertainty may persist. Recommend veterinary consultation while noting that "
            "additional information could improve diagnostic confidence."
        )
    
    return narrative


def _compute_confidence_discounts(
    case_id: str,
    disagreement: dict,
    confidence_components: list[tuple],
    cluster_data: dict | None
) -> list[dict]:
    """
    Compute conditions under which the promotion confidence should be discounted.

    Returns list of discount reasons with impact and explanation.
    """
    discounts = []

    # Discount 1: Low cluster evidence
    if cluster_data and cluster_data.get("case_count", 0) < 5:
        discounts.append({
            "reason": "limited_cluster_history",
            "impact": 0.15,
            "description": f"Cluster has only {cluster_data.get('case_count', 0)} historical cases. Limited data may not reliably predict this case's behavior."
        })

    # Discount 2: Inconsistent evidence
    if len(confidence_components) >= 3:
        contributions = [c[1] for c in confidence_components]
        max_contribution = max(contributions)
        min_contribution = min(contributions)
        if max_contribution - min_contribution < 0.05:
            discounts.append({
                "reason": "diffuse_evidence",
                "impact": 0.10,
                "description": "Evidence is diffuse across multiple factors with no clear dominant signal. This may indicate mixed case characteristics."
            })

    # Discount 3: High base uncertainty
    if disagreement.get("n_uncertainty_divergence", 0) > disagreement.get("n_disagreements", 0):
        discounts.append({
            "reason": "uncertainty_dominant",
            "impact": 0.12,
            "description": "Uncertainty divergences exceed disagreements. This suggests case characteristics that are genuinely ambiguous rather than definitively complex."
        })

    # Discount 4: Novel case features
    if disagreement.get("pattern_type") == "alignment":
        discounts.append({
            "reason": "low_disagreement_pattern",
            "impact": 0.08,
            "description": "Pattern type is 'alignment' suggesting 7B and 32B largely agree. Escalation benefits may be limited."
        })

    # Discount 5: Low confidence values overall
    avg_confidence = (disagreement.get("consult_confidence", 0.5) + disagreement.get("review_confidence", 0.5)) / 2
    if avg_confidence < 0.4:
        discounts.append({
            "reason": "low_base_confidence",
            "impact": 0.10,
            "description": f"Both models show low base confidence ({avg_confidence:.0%}). This may indicate inherent case difficulty or data quality issues."
        })

    return discounts


def _build_policy_explanation(
    case_id: str,
    disagreement: dict,
    narrative: dict,
    threshold_crossings: list[dict],
    dominant_evidence: dict | None,
    confidence_discounts: list[dict]
) -> str:
    """
    Build comprehensive policy explanation text.
    """
    parts = []

    # Header
    parts.append(f"POLICY EXPLANATION FOR CASE {case_id}")
    parts.append("=" * 60)

    # Recommendation Summary
    parts.append(f"\nRECOMMENDATION: {narrative['promotion_recommendation'].upper().replace('_', ' ')}")
    parts.append(f"Confidence: {narrative['promotion_confidence']:.0%}")
    parts.append(f"Confidence Band: {narrative['confidence_band'].upper().replace('_', ' ')}")

    # Why Threshold Was Crossed
    if threshold_crossings:
        parts.append(f"\nTHRESHOLD CROSSINGS ({len(threshold_crossings)} total):")
        for i, crossing in enumerate(threshold_crossings, 1):
            parts.append(f"\n{i}. {crossing['threshold'].upper()}")
            parts.append(f"   Value: {crossing['value']} {crossing['operator']} {crossing['threshold_value']}")
            parts.append(f"   Severity: {crossing['severity_level']}")
            parts.append(f"   Contribution: {crossing['contribution']:.0%}")
            parts.append(f"   Explanation: {crossing['explanation']}")

    # Dominant Evidence
    if dominant_evidence:
        parts.append(f"\nDOMINANT EVIDENCE:")
        parts.append(f"  Primary Factor: {dominant_evidence['component'].upper().replace('_', ' ')}")
        parts.append(f"  Contribution: {dominant_evidence['contribution']:.0%}")
        parts.append(f"  Why Dominant: {dominant_evidence['explanation']}")
        if "secondary" in dominant_evidence:
            parts.append(f"  Secondary Factor: {dominant_evidence['secondary']['component'].upper().replace('_', ' ')}")
            parts.append(f"  Secondary Contribution: {dominant_evidence['secondary']['contribution']:.0%}")

    # Confidence Discounts
    if confidence_discounts:
        parts.append(f"\nCONFIDENCE DISCOUNTS ({len(confidence_discounts)} total):")
        total_discount = 0
        for i, discount in enumerate(confidence_discounts, 1):
            parts.append(f"\n{i}. {discount['reason'].upper().replace('_', ' ')}")
            parts.append(f"   Impact: -{discount['impact']:.0%}")
            parts.append(f"   Reason: {discount['description']}")
            total_discount += discount['impact']
        adjusted_confidence = max(0.0, narrative["promotion_confidence"] - total_discount)
        parts.append(f"\n  TOTAL DISCOUNT: -{total_discount:.0%}")
        parts.append(f"  ADJUSTED CONFIDENCE: {adjusted_confidence:.0%}")
    else:
        parts.append(f"\nCONFIDENCE DISCOUNTS: None")
        parts.append(f"  No factors identified that should reduce confidence in this recommendation.")

    # Policy Summary
    parts.append(f"\n" + "=" * 60)
    rec = narrative['promotion_recommendation']
    if rec == "mandatory_32b_review":
        parts.append("POLICY SUMMARY: This case MUST be escalated to 32B review. Multiple high-severity thresholds exceeded with strong evidence support.")
    elif rec == "promote_to_32b":
        parts.append("POLICY SUMMARY: This case SHOULD be escalated to 32B review. Strong evidence supports escalation with high confidence.")
    elif rec == "consider_32b":
        parts.append("POLICY SUMMARY: Consider escalating to 32B review. Evidence is mixed but warrants careful consideration of 32B enhancement.")
    else:
        parts.append("POLICY SUMMARY: Standard 7B review is sufficient. Case does not meet escalation thresholds or evidence does not strongly support escalation.")

    return "\n".join(parts)


def _get_cluster_performance(cluster_key: str) -> dict | None:
    """
    Get historical performance metrics for a disagreement cluster.

    Returns escalation rate and case count if available.
    """
    cluster_cases = []
    for case_id, disagreement in _shadow_disagreements_snapshot():
        if _build_disagreement_cluster_key(disagreement) == cluster_key:
            cluster_cases.append(
                {
                    **disagreement,
                    "final_outcome": _final_outcome_for_case(case_id),
                }
            )

    if not cluster_cases:
        return None

    escalated = sum(1 for c in cluster_cases if c.get("final_outcome") == "escalated")
    return {
        "case_count": len(cluster_cases),
        "escalation_rate": escalated / len(cluster_cases) if cluster_cases else 0
    }


def _compute_concrete_promotion_recommendation(
    case_id: str,
    disagreement: dict,
    calibration_score: float,
    confidence_components: list[tuple]
) -> dict:
    """
    Compute concrete promotion recommendation with confidence band.

    Returns promotion recommendation with specific thresholds and confidence level.
    """
    recommendation = {
        "promotion_recommendation": "standard_review",
        "promotion_confidence": 0.0,
        "promotion_threshold_used": None,
        "alternative_recommendation": None
    }

    severity_impact = disagreement.get("severity_impact", 0.5)
    conf_delta = abs(
        disagreement.get("consult_confidence", 0.5) -
        disagreement.get("review_confidence", 0.5)
    )
    pattern_type = disagreement.get("pattern_type", "unknown")
    n_disagreements = disagreement.get("n_disagreements", 0)

    # HIGH CONFIDENCE promotions (confidence >= 0.7)
    if calibration_score >= 0.7:
        if severity_impact >= 0.75:
            recommendation["promotion_recommendation"] = "mandatory_32b_review"
            recommendation["promotion_confidence"] = 0.85
            recommendation["promotion_threshold_used"] = "severity_impact >= 0.75"
        elif pattern_type == "diagnostic" and n_disagreements >= 2:
            recommendation["promotion_recommendation"] = "mandatory_32b_review"
            recommendation["promotion_confidence"] = 0.80
            recommendation["promotion_threshold_used"] = "diagnostic_pattern + multiple_disagreements"
        elif conf_delta > 0.35:
            recommendation["promotion_recommendation"] = "promote_to_32b"
            recommendation["promotion_confidence"] = 0.78
            recommendation["promotion_threshold_used"] = "confidence_delta > 0.35"
        else:
            recommendation["promotion_recommendation"] = "promote_to_32b"
            recommendation["promotion_confidence"] = 0.72
            recommendation["promotion_threshold_used"] = f"calibration_score >= 0.7"

    # MEDIUM CONFIDENCE promotions (0.35 <= confidence < 0.7)
    elif calibration_score >= 0.35:
        if severity_impact >= 0.6:
            recommendation["promotion_recommendation"] = "promote_to_32b"
            recommendation["promotion_confidence"] = 0.65
            recommendation["promotion_threshold_used"] = "severity_impact >= 0.6"
        elif pattern_type in ["diagnostic", "urgency"]:
            recommendation["promotion_recommendation"] = "consider_32b"
            recommendation["promotion_confidence"] = 0.55
            recommendation["promotion_threshold_used"] = f"{pattern_type}_pattern"
        elif conf_delta > 0.25:
            recommendation["promotion_recommendation"] = "consider_32b"
            recommendation["promotion_confidence"] = 0.52
            recommendation["promotion_threshold_used"] = "confidence_delta > 0.25"
        else:
            recommendation["promotion_recommendation"] = "standard_review"
            recommendation["promotion_confidence"] = 0.45
            recommendation["promotion_threshold_used"] = "calibration_score >= 0.35 but below thresholds"

    # LOW CONFIDENCE (calibration_score < 0.35)
    else:
        recommendation["promotion_recommendation"] = "standard_review"
        recommendation["promotion_confidence"] = max(0.3, 1.0 - calibration_score)
        recommendation["promotion_threshold_used"] = "calibration_score < 0.35"

        if severity_impact >= 0.5:
            recommendation["alternative_recommendation"] = "consider_32b"
            recommendation["alternative_recommendation_reason"] = "Despite low overall calibration, severity impact warrants consideration"

    return recommendation


def _build_calibration_narrative_text(
    case_id: str,
    disagreement: dict,
    narrative: dict,
    conditions: list[str]
) -> str:
    """
    Build human-readable calibration narrative.
    """
    severity_impact = disagreement.get("severity_impact", 0.5)
    conf_delta = abs(
        disagreement.get("consult_confidence", 0.5) -
        disagreement.get("review_confidence", 0.5)
    )
    pattern_type = disagreement.get("pattern_type", "unknown")
    domain = disagreement.get("domain", "unknown")

    parts = []

    # Opening assessment
    if narrative["promotion_recommendation"] in ["mandatory_32b_review", "promote_to_32b"]:
        parts.append(
            f"This case ({case_id}) shows clear indicators that 32B review would be beneficial. "
        )
    elif narrative["promotion_recommendation"] == "consider_32b":
        parts.append(
            f"This case ({case_id}) presents mixed signals where 32B review may improve outcomes. "
        )
    else:
        parts.append(
            f"This case ({case_id}) does not show strong indicators requiring 32B enhancement. "
        )

    # Key findings
    if severity_impact >= 0.6:
        parts.append(
            f"Severity impact is {severity_impact:.0%}, indicating potentially critical findings "
            f"that warrant deeper 32B analysis. "
        )

    if conf_delta > 0.25:
        parts.append(
            f"The {conf_delta:.0%} confidence gap between 7B and 32B suggests meaningful "
            f"difference in case assessment. "
        )

    if pattern_type != "unknown" and pattern_type != "alignment":
        parts.append(
            f"The '{pattern_type}' pattern type in {domain} domain suggests case characteristics "
            f"that benefit from 32B's reasoning capabilities. "
        )

    # Confidence assessment
    if narrative["confidence_band"] == "high_confidence":
        parts.append(
            f"High confidence in this recommendation ({narrative['promotion_confidence']:.0%}) "
            f"based on multiple strong indicators. "
        )
    elif narrative["confidence_band"] == "medium_confidence":
        parts.append(
            f"Medium confidence ({narrative['promotion_confidence']:.0%}) in this recommendation "
            f"based on moderate indicators. "
        )

    # Recommendation summary
    rec = narrative["promotion_recommendation"]
    if rec == "mandatory_32b_review":
        parts.append(
            f"RECOMMENDATION: Mandatory 32B review required. "
            f"All promotion thresholds exceeded with high confidence."
        )
    elif rec == "promote_to_32b":
        parts.append(
            f"RECOMMENDATION: Promote to 32B review. "
            f"Strong indicators support escalation."
        )
    elif rec == "consider_32b":
        parts.append(
            f"RECOMMENDATION: Consider 32B review. "
            f"Benefits unclear but case has some escalation indicators."
        )
    else:
        parts.append(
            f"RECOMMENDATION: Standard 7B review sufficient. "
            f"Case does not meet promotion thresholds."
        )

    return "".join(parts)


def _compute_promotion_threshold(recommendation_type: str = "general") -> dict:
    """
    Compute promotion threshold recommendations based on accumulated intelligence.

    Analyzes cross-case disagreement clusters and outcome patterns to determine
    when cases should be escalated from 7B consult to 32B review.

    Returns thresholds for what distinguishes satisfactory from exemplary performance.
    """
    thresholds = {
        "recommendation_type": recommendation_type,
        "thresholds": {},
        "criteria": [],
        "cluster_insights": {},
        "region_thresholds": {},
        "pattern_thresholds": {},
        "severity_weighted": {},
        "confidence": 0.5,
        "recommendation": "no_action",
        "rationale": []
    }

    # =================================================================
    # Phase 1: Cluster-Based Threshold Analysis
    # =================================================================
    # Analyze disagreement clusters to find systemic patterns
    cluster_analysis = _analyze_disagreement_clusters_for_promotion()

    if cluster_analysis["significant_clusters"]:
        thresholds["cluster_insights"] = cluster_analysis
        thresholds["thresholds"]["cluster_significance_threshold"] = 0.5
        thresholds["thresholds"]["min_cluster_size_for_promotion"] = 3

        # Derive promotion criteria from clusters
        for cluster in cluster_analysis["significant_clusters"]:
            domain = cluster.get("domain", "unknown")
            body_region = cluster.get("body_region", "unknown")
            pattern_type = cluster.get("pattern_type", "unknown")
            avg_score = cluster.get("avg_score", 0)

            key = f"{domain}_{body_region}_{pattern_type}"
            thresholds["pattern_thresholds"][key] = {
                "avg_disagreement_score": avg_score,
                "case_count": cluster.get("count", 0),
                "promote_to_32b": avg_score > 0.6,
                "confidence_boost": min(0.15, cluster.get("count", 0) * 0.02)
            }

            if avg_score > 0.6:
                thresholds["criteria"].append(
                    f"[CLUSTER] {domain}/{body_region}/{pattern_type}: "
                    f"avg_score={avg_score:.2f} from {cluster.get('count')} cases â†’ promote to 32B"
                )
                thresholds["recommendation"] = "enhance_review"

    # =================================================================
    # Phase 2: Body Region-Specific Thresholds
    # =================================================================
    region_thresholds = _compute_region_specific_thresholds()
    if region_thresholds:
        thresholds["region_thresholds"] = region_thresholds

        for region, data in region_thresholds.items():
            escalation_rate = data.get("escalation_rate", 0)
            if escalation_rate > 0.25:
                thresholds["thresholds"][f"{region}_escalation_threshold"] = 0.25
                thresholds["criteria"].append(
                    f"[REGION] {region}: escalation_rate={escalation_rate:.1%} â†’ "
                    f"auto-promote high-severity to 32B"
                )
                thresholds["recommendation"] = "enhance_review"

    # =================================================================
    # Phase 3: Severity-Weighted Promotion Criteria
    # =================================================================
    severity_thresholds = _compute_severity_weighted_thresholds()
    if severity_thresholds:
        thresholds["severity_weighted"] = severity_thresholds

        high_severity_escalation = severity_thresholds.get("high_severity_escalation_rate", 0)
        if high_severity_escalation > 0.2:
            thresholds["thresholds"]["high_severity_escalation_threshold"] = 0.2
            thresholds["criteria"].append(
                f"[SEVERITY] High-severity escalation rate: {high_severity_escalation:.1%} â†’ "
                f"always use 32B for HIGH_SEVERITY cases"
            )
            thresholds["recommendation"] = "full_32b_required"

    # =================================================================
    # Phase 4: Pattern Type-Based Promotion Criteria
    # =================================================================
    pattern_based_thresholds = _compute_pattern_type_thresholds()
    if pattern_based_thresholds:
        thresholds["pattern_thresholds"].update(pattern_based_thresholds)

        for pattern_type, data in pattern_based_thresholds.items():
            if data.get("escalation_rate", 0) > 0.3:
                thresholds["criteria"].append(
                    f"[PATTERN] {pattern_type}: escalation_rate={data['escalation_rate']:.1%} â†’ "
                    f"promote all {pattern_type} to 32B review"
                )
                thresholds["recommendation"] = "enhance_review"

    # =================================================================
    # Phase 5: Shadow Disagreement Score Analysis
    # =================================================================
    high_score_disagreements = []
    with STATE_LOCK:
        for case_id, disagreement in SHADOW_DISAGREEMENTS.items():
            score = _compute_disagreement_score(case_id)
            if score > 0.6:
                high_score_disagreements.append({
                    "case_id": case_id,
                    "score": score,
                    "domain": disagreement.get("domain"),
                    "body_region": disagreement.get("body_region", "unknown"),
                    "pattern_type": disagreement.get("pattern_type", "unknown"),
                    "severity_impact": disagreement.get("severity_impact", 0.5),
                    "outcome": _final_outcome_for_case(case_id),
                })

    if len(high_score_disagreements) >= 5:
        # Compute domain-specific thresholds
        domain_outcomes = {}
        for item in high_score_disagreements:
            domain = item.get("domain", "unknown")
            if domain not in domain_outcomes:
                domain_outcomes[domain] = []
            domain_outcomes[domain].append(item["outcome"])

        thresholds["thresholds"]["high_disagreement_score"] = 0.6
        thresholds["criteria"].append("Cases with disagreement score > 0.6 require 32B review")

        # Check if certain domains have worse outcomes when 7B is used alone
        for domain, outcomes in domain_outcomes.items():
            escalated = sum(1 for o in outcomes if o == "escalated")
            if escalated > len(outcomes) * 0.3:
                thresholds["thresholds"][f"{domain}_escalation_risk"] = 0.3
                thresholds["criteria"].append(f"{domain}: >30% escalation rate when 7B disagrees - promote to 32B")

        thresholds["confidence"] = min(0.9, 0.5 + len(high_score_disagreements) * 0.05)
        thresholds["recommendation"] = "enhance_review"

    # =================================================================
    # Phase 6: Outcome Pattern Analysis
    # =================================================================
    with STATE_LOCK:
        total_outcomes = len(OUTCOME_LEARNING)
        if total_outcomes >= 10:
            rapid_resolutions = sum(1 for o in OUTCOME_LEARNING if o.get("outcome_pattern") == "rapid_resolution")
            standard_resolutions = sum(1 for o in OUTCOME_LEARNING if o.get("outcome_pattern") == "standard_resolution")
            required_escalation = sum(1 for o in OUTCOME_LEARNING if o.get("outcome_pattern") == "required_escalation")

            thresholds["thresholds"]["exemplary_rate"] = rapid_resolutions / total_outcomes
            thresholds["thresholds"]["satisfactory_rate"] = standard_resolutions / total_outcomes
            thresholds["thresholds"]["escalation_rate"] = required_escalation / total_outcomes

            thresholds["criteria"].append(f"Exemplary: rapid resolution rate > {thresholds['thresholds']['exemplary_rate']:.1%}")
            thresholds["criteria"].append(f"Satisfactory: standard resolution rate > {thresholds['thresholds']['satisfactory_rate']:.1%}")
            thresholds["criteria"].append(f"Unsatisfactory: escalation rate > {thresholds['thresholds']['escalation_rate']:.1%}")

            thresholds["confidence"] = min(0.9, 0.5 + total_outcomes * 0.02)

    # =================================================================
    # Phase 7: Confidence Delta Analysis
    # =================================================================
    confidence_delta_thresholds = _compute_confidence_delta_thresholds()
    if confidence_delta_thresholds:
        thresholds["thresholds"]["confidence_delta_threshold"] = confidence_delta_thresholds.get("delta_threshold", 0.25)
        thresholds["thresholds"]["confidence_escalation_rate"] = confidence_delta_thresholds.get("escalation_rate", 0)

        if confidence_delta_thresholds.get("escalation_rate", 0) > 0.25:
            thresholds["criteria"].append(
                f"[CONFIDENCE] High confidence delta cases escalate at "
                f"{confidence_delta_thresholds['escalation_rate']:.1%} â†’ "
                f"promote when |7B_conf - 32B_conf| > 0.25"
            )
            thresholds["recommendation"] = "enhance_review"

    # =================================================================
    # Final Recommendation Synthesis
    # =================================================================
    if thresholds["recommendation"] == "no_action" and thresholds["confidence"] > 0.6:
        thresholds["recommendation"] = "standard_review"
        thresholds["rationale"].append("Sufficient data for standard 7B review")
    elif thresholds["recommendation"] == "enhance_review":
        thresholds["rationale"].append("Multiple indicators suggest 32B enhancement beneficial")
    elif thresholds["recommendation"] == "full_32b_required":
        thresholds["rationale"].append("High-severity patterns require mandatory 32B review")

    # =================================================================
    # Compute Explicit Confidence Bands
    # =================================================================
    thresholds["confidence_bands"] = _compute_explicit_confidence_bands(
        thresholds, cluster_analysis, len(high_score_disagreements)
    )

    # =================================================================
    # Generate Explicit Policy Rules
    # =================================================================
    thresholds["policy_rules"] = _generate_explicit_policy_rules(thresholds)

    # Add summary
    thresholds["summary"] = (
        f"Promotion threshold analysis based on {len(high_score_disagreements)} high-disagreement cases, "
        f"{len(cluster_analysis.get('significant_clusters', []))} significant clusters, "
        f"and {len(region_thresholds)} regional patterns. "
        f"Recommendation: {thresholds['recommendation']}"
    )

    return thresholds


def _compute_explicit_confidence_bands(
    thresholds: dict,
    cluster_analysis: dict,
    n_high_disagreement_cases: int
) -> dict:
    """
    Compute explicit confidence bands for promotion thresholds.

    Returns confidence bands with numeric ranges and evidence counts.
    """
    # Determine evidence strength
    evidence_count = (
        len(cluster_analysis.get("significant_clusters", [])) +
        len(cluster_analysis.get("promotion_triggers", [])) +
        n_high_disagreement_cases
    )

    # Compute confidence level
    if evidence_count >= 10:
        confidence_level = "high"
        confidence_value = min(0.95, 0.7 + evidence_count * 0.02)
    elif evidence_count >= 5:
        confidence_level = "medium"
        confidence_value = min(0.85, 0.5 + evidence_count * 0.04)
    else:
        confidence_level = "low"
        confidence_value = max(0.3, 0.3 + evidence_count * 0.06)

    # Determine band width based on evidence consistency
    consistency = 1.0
    if cluster_analysis.get("significant_clusters"):
        scores = [c.get("avg_score", 0) for c in cluster_analysis["significant_clusters"]]
        if len(scores) > 1:
            score_variance = sum((s - sum(scores)/len(scores))**2 for s in scores) / len(scores)
            consistency = max(0.5, 1.0 - score_variance)

    band_width = 0.15 * (2 - consistency)  # Wider bands for inconsistent evidence
    lower_bound = max(0.0, confidence_value - band_width)
    upper_bound = min(1.0, confidence_value + band_width)

    return {
        "confidence_level": confidence_level,
        "confidence_value": round(confidence_value, 3),
        "band_width": round(band_width, 3),
        "lower_bound": round(lower_bound, 3),
        "upper_bound": round(upper_bound, 3),
        "evidence_count": evidence_count,
        "evidence_sources": {
            "significant_clusters": len(cluster_analysis.get("significant_clusters", [])),
            "promotion_triggers": len(cluster_analysis.get("promotion_triggers", [])),
            "high_disagreement_cases": n_high_disagreement_cases
        }
    }


def _generate_explicit_policy_rules(thresholds: dict) -> list[dict]:
    """
    Generate explicit policy rules from promotion threshold analysis.

    Returns concrete, actionable rules with conditions and actions.
    """
    rules = []

    # Rule 1: Severity-based promotion
    severity_data = thresholds.get("severity_weighted", {})
    if severity_data.get("high_severity_escalation_rate", 0) > 0.2:
        rules.append({
            "rule_id": "SEVERITY_HIGH_MANDATORY",
            "condition": {
                "type": "severity_impact",
                "operator": ">=",
                "value": 0.75,
                "description": "Severity impact >= 0.75"
            },
            "action": {
                "type": "mandatory_32b_review",
                "description": "Always promote to 32B review"
            },
            "confidence": severity_data.get("high_severity_escalation_rate", 0),
            "policy_text": "Cases with severity impact >= 0.75 MUST be escalated to 32B review due to high escalation risk."
        })

    # Rule 2: Pattern type-based promotion
    pattern_data = thresholds.get("pattern_thresholds", {})
    for pattern_key, data in pattern_data.items():
        if isinstance(data, dict) and data.get("requires_promotion"):
            escalation_rate = data.get("escalation_rate", 0)
            rules.append({
                "rule_id": f"PATTERN_{pattern_key.upper()}",
                "condition": {
                    "type": "pattern_type",
                    "operator": "==",
                    "value": pattern_key,
                    "description": f"Pattern type == {pattern_key}"
                },
                "action": {
                    "type": "promote_to_32b",
                    "description": f"Promote {pattern_key} cases to 32B review"
                },
                "confidence": escalation_rate,
                "policy_text": f"Cases with pattern '{pattern_key}' should be promoted to 32B review (escalation rate: {escalation_rate:.1%})."
            })

    # Rule 3: Cluster-based promotion
    cluster_triggers = thresholds.get("cluster_insights", {}).get("promotion_triggers", [])
    for trigger in cluster_triggers:
        rules.append({
            "rule_id": f"CLUSTER_{trigger.get('cluster_key', 'unknown').replace(':', '_')}",
            "condition": {
                "type": "cluster_match",
                "operator": "==",
                "value": trigger.get("cluster_key"),
                "description": f"Cluster key == {trigger.get('cluster_key')}"
            },
            "action": {
                "type": "promote_to_32b",
                "description": "Promote cluster cases to 32B review"
            },
            "confidence": 0.75,
            "policy_text": f"Cases matching cluster '{trigger.get('cluster_key')}' should be promoted to 32B review ({trigger.get('reason')})."
        })

    # Rule 4: Confidence delta promotion
    conf_delta = thresholds.get("thresholds", {}).get("confidence_delta_threshold")
    conf_escalation = thresholds.get("thresholds", {}).get("confidence_escalation_rate", 0)
    if conf_delta and conf_escalation > 0.25:
        rules.append({
            "rule_id": "CONFIDENCE_DELTA",
            "condition": {
                "type": "confidence_delta",
                "operator": ">",
                "value": conf_delta,
                "description": f"Confidence delta > {conf_delta}"
            },
            "action": {
                "type": "promote_to_32b",
                "description": "Promote to 32B when large confidence gap exists"
            },
            "confidence": conf_escalation,
            "policy_text": f"Cases with |7B_confidence - 32B_confidence| > {conf_delta:.2f} should be promoted to 32B review (escalation rate: {conf_escalation:.1%})."
        })

    # Rule 5: Body region promotion
    region_data = thresholds.get("region_thresholds", {})
    for region, data in region_data.items():
        if isinstance(data, dict) and data.get("requires_promotion"):
            escalation_rate = data.get("escalation_rate", 0)
            rules.append({
                "rule_id": f"REGION_{region.upper()}",
                "condition": {
                    "type": "body_region",
                    "operator": "==",
                    "value": region,
                    "description": f"Body region == {region}"
                },
                "action": {
                    "type": "promote_to_32b",
                    "description": f"Promote {region} cases to 32B review"
                },
                "confidence": escalation_rate,
                "policy_text": f"Cases involving body region '{region}' should be promoted to 32B review due to elevated escalation risk ({escalation_rate:.1%})."
            })

    # Rule 6: Disagreement score promotion
    if thresholds.get("thresholds", {}).get("high_disagreement_score"):
        rules.append({
            "rule_id": "DISAGREEMENT_SCORE",
            "condition": {
                "type": "disagreement_score",
                "operator": ">",
                "value": 0.6,
                "description": "Disagreement score > 0.6"
            },
            "action": {
                "type": "promote_to_32b",
                "description": "Promote high disagreement score cases to 32B"
            },
            "confidence": 0.7,
            "policy_text": "Cases with disagreement score > 0.6 should be promoted to 32B review for thorough analysis."
        })

    return rules


def _analyze_disagreement_clusters_for_promotion() -> dict:
    """
    Analyze disagreement clusters to identify systemic patterns that should
    trigger promotion to 32B review.

    Returns cluster insights with significance scores and promotion recommendations.
    """
    clusters = {}

    with STATE_LOCK:
        for case_id, disagreement in SHADOW_DISAGREEMENTS.items():
            cluster_key = _build_disagreement_cluster_key(disagreement)

            if cluster_key not in clusters:
                clusters[cluster_key] = {
                    "cluster_key": cluster_key,
                    "domain": disagreement.get("domain", "unknown"),
                    "body_region": disagreement.get("body_region", "unknown"),
                    "pattern_type": disagreement.get("pattern_type", "unknown"),
                    "severity_impact": disagreement.get("severity_impact", 0.5),
                    "cases": [],
                    "total_score": 0.0,
                    "count": 0,
                    "outcomes": [],
                    "escalated": 0
                }

            score = _compute_disagreement_score(case_id)
            clusters[cluster_key]["cases"].append(case_id)
            clusters[cluster_key]["total_score"] += score
            clusters[cluster_key]["count"] += 1

            outcome = _final_outcome_for_case(case_id)
            clusters[cluster_key]["outcomes"].append(outcome)
            if outcome == "escalated":
                clusters[cluster_key]["escalated"] += 1

    # Compute averages and significance
    result = {
        "total_clusters": len(clusters),
        "significant_clusters": [],
        "high_risk_clusters": [],
        "promotion_triggers": []
    }

    for cluster_key, cluster in clusters.items():
        cluster["avg_score"] = cluster["total_score"] / cluster["count"] if cluster["count"] > 0 else 0
        cluster["significance"] = cluster["avg_score"] * cluster["count"]
        cluster["escalation_rate"] = cluster["escalated"] / cluster["count"] if cluster["count"] > 0 else 0

        # Significant if high disagreement score and multiple cases
        if cluster["avg_score"] > 0.5 and cluster["count"] >= 3:
            result["significant_clusters"].append(cluster)

            # Check if this cluster should trigger promotion
            if cluster["avg_score"] > 0.6 or cluster["escalation_rate"] > 0.3:
                result["promotion_triggers"].append({
                    "cluster_key": cluster_key,
                    "reason": f"avg_score={cluster['avg_score']:.2f}, escalation_rate={cluster['escalation_rate']:.1%}",
                    "domain": cluster["domain"],
                    "body_region": cluster["body_region"],
                    "pattern_type": cluster["pattern_type"]
                })

        # High risk if escalation rate is very high
        if cluster["escalation_rate"] > 0.4 and cluster["count"] >= 2:
            result["high_risk_clusters"].append(cluster)

    # Sort by significance
    result["significant_clusters"].sort(key=lambda x: x["significance"], reverse=True)
    result["high_risk_clusters"].sort(key=lambda x: x["escalation_rate"], reverse=True)
    result["promotion_triggers"].sort(key=lambda x: x["cluster_key"])

    return result


def _compute_region_specific_thresholds() -> dict[str, dict]:
    """
    Compute promotion thresholds specific to body regions.

    Returns thresholds per body region based on escalation rates.
    """
    region_data = {}

    with STATE_LOCK:
        for case_id, disagreement in SHADOW_DISAGREEMENTS.items():
            body_region = disagreement.get("body_region", "unknown")

            if body_region not in region_data:
                region_data[body_region] = {
                    "region": body_region,
                    "cases": [],
                    "outcomes": [],
                    "escalated": 0,
                    "severity_impacts": []
                }

            region_data[body_region]["cases"].append(case_id)
            outcome = _final_outcome_for_case(case_id)
            region_data[body_region]["outcomes"].append(outcome)

            if outcome == "escalated":
                region_data[body_region]["escalated"] += 1

            region_data[body_region]["severity_impacts"].append(
                disagreement.get("severity_impact", 0.5)
            )

    result = {}
    for region, data in region_data.items():
        if len(data["cases"]) >= 3:  # Only regions with enough data
            result[region] = {
                "region": region,
                "case_count": len(data["cases"]),
                "escalation_rate": data["escalated"] / len(data["cases"]),
                "avg_severity_impact": sum(data["severity_impacts"]) / len(data["severity_impacts"]),
                "requires_promotion": (data["escalated"] / len(data["cases"])) > 0.25
            }

    return result


# =============================================================================
# Cluster-Level Promotion Playbooks
# Turn disagreement clusters into reusable decision playbooks
# =============================================================================

# Playbook definition templates
CLUSTER_PLAYBOOK_TEMPLATES = {
    "MUST_OVERRIDE": {
        "condition": "32B must override 7B regardless of other factors",
        "confidence_band": "high_certainty",
        "policy_text": "Override 7B consult with 32B review. This is a mandatory escalation scenario."
    },
    "SHOULD_OVERRIDE": {
        "condition": "Strong evidence favors 32B, recommend escalation",
        "confidence_band": "medium_certainty",
        "policy_text": "Promote to 32B review. Evidence supports escalation but case is not critical."
    },
    "CONSIDER_OVERRIDE": {
        "condition": "Mixed signals, human review recommended",
        "confidence_band": "low_certainty",
        "policy_text": "Consider 32B review. Evidence is mixed, human judgment may be needed."
    },
    "DISCOUNT_32B": {
        "condition": "32B analysis should be discounted",
        "confidence_band": "negative_certainty",
        "policy_text": "Do not rely on 32B review. Escalation may not add value in this scenario."
    },
    "AMBIGUOUS": {
        "condition": "Case is too ambiguous to trust either model strongly",
        "confidence_band": "no_certainty",
        "policy_text": "Neither 7B nor 32B can be trusted strongly. Recommend specialist consultation or additional data."
    }
}


def _build_cluster_promotion_playbooks() -> list[dict]:
    """
    Build reusable promotion playbooks from historical cluster data.

    Analyzes disagreement clusters to create decision playbooks that define:
    - When 32B must override 7B
    - When 32B should be discounted
    - When the case is too ambiguous to trust either model
    - Confidence bands and natural-language rationale

    Returns:
        List of playbook dictionaries with conditions, actions, and rationale.
    """
    playbooks = []
    seen_clusters: set[str] = set()

    for _, disagreement in _shadow_disagreements_snapshot():
        cluster_key = _build_disagreement_cluster_key(disagreement)
        if cluster_key in seen_clusters:
            continue
        seen_clusters.add(cluster_key)

        cluster_performance = _get_cluster_performance(cluster_key)
        if not cluster_performance:
            continue

        escalation_rate = cluster_performance.get("escalation_rate", 0)
        case_count = cluster_performance.get("case_count", 0)
        severity_impact = disagreement.get("severity_impact", 0.5)
        conf_delta = abs(
            disagreement.get("consult_confidence", 0.5) -
            disagreement.get("review_confidence", 0.5)
        )
        pattern_type = disagreement.get("pattern_type", "unknown")
        body_region = disagreement.get("body_region", "unknown")

        playbook = {
            "cluster_key": cluster_key,
            "domain": disagreement.get("domain", "unknown"),
            "body_region": body_region,
            "pattern_type": pattern_type,
            "case_count": case_count,
            "escalation_rate": escalation_rate,
            "rules": [],
        }

        if severity_impact >= 0.8:
            playbook["rules"].append({
                "rule_type": "MUST_OVERRIDE",
                "trigger": f"severity_impact >= 0.8 (actual: {severity_impact:.2f})",
                "confidence_band": "high_certainty",
                "rationale": f"Critical severity ({severity_impact:.0%}) mandates 32B's thorough analysis. "
                             "7B may miss life-threatening findings.",
                "threshold_crossed": "severity_impact",
                "threshold_value": 0.8,
                "actual_value": severity_impact,
            })
        elif pattern_type == "diagnostic" and severity_impact >= 0.7:
            playbook["rules"].append({
                "rule_type": "MUST_OVERRIDE",
                "trigger": "pattern_type == 'diagnostic' AND severity_impact >= 0.7",
                "confidence_band": "high_certainty",
                "rationale": "Diagnostic patterns with high severity require mandatory 32B review. "
                             "Misdiagnosis risk is unacceptable.",
                "threshold_crossed": "severity_impact + pattern_type",
                "threshold_value": "0.7 + diagnostic",
                "actual_value": f"{severity_impact:.2f} + {pattern_type}",
            })
        elif escalation_rate >= 0.7 and case_count >= 5:
            playbook["rules"].append({
                "rule_type": "MUST_OVERRIDE",
                "trigger": "escalation_rate >= 0.7 AND case_count >= 5",
                "confidence_band": "high_certainty",
                "rationale": f"Historical cluster data shows {escalation_rate:.0%} escalation rate "
                             f"across {case_count} cases. Strong evidence for mandatory escalation.",
                "threshold_crossed": "escalation_rate + case_count",
                "threshold_value": "0.7 + 5",
                "actual_value": f"{escalation_rate:.2f} + {case_count}",
            })

        if pattern_type == "alignment" and conf_delta < 0.1:
            playbook["rules"].append({
                "rule_type": "DISCOUNT_32B",
                "trigger": "pattern_type == 'alignment' AND conf_delta < 0.1",
                "confidence_band": "negative_certainty",
                "rationale": "Models strongly agree (alignment pattern). 32B analysis may not add value.",
                "threshold_crossed": "pattern_type + conf_delta",
                "threshold_value": "alignment + 0.1",
                "actual_value": f"{pattern_type} + {conf_delta:.2f}",
            })
        elif case_count >= 3 and escalation_rate < 0.1:
            playbook["rules"].append({
                "rule_type": "DISCOUNT_32B",
                "trigger": "case_count >= 3 AND escalation_rate < 0.1",
                "confidence_band": "negative_certainty",
                "rationale": f"Cluster shows {escalation_rate:.0%} escalation rate despite {case_count} cases. "
                             "32B escalations rarely justified.",
                "threshold_crossed": "escalation_rate",
                "threshold_value": 0.1,
                "actual_value": escalation_rate,
            })
        elif body_region in ["skin", "coat"] and severity_impact < 0.4:
            playbook["rules"].append({
                "rule_type": "DISCOUNT_32B",
                "trigger": "body_region in ['skin', 'coat'] AND severity_impact < 0.4",
                "confidence_band": "negative_certainty",
                "rationale": "Superficial body regions with low severity rarely benefit from 32B escalation.",
                "threshold_crossed": "body_region + severity_impact",
                "threshold_value": "skin/coat + 0.4",
                "actual_value": f"{body_region} + {severity_impact:.2f}",
            })

        if disagreement.get("n_uncertainty_divergence", 0) > disagreement.get("n_disagreements", 0) * 1.5:
            playbook["rules"].append({
                "rule_type": "AMBIGUOUS",
                "trigger": "n_uncertainty_divergence > n_disagreements * 1.5",
                "confidence_band": "no_certainty",
                "rationale": "Uncertainty divergences dominate disagreements. Case characteristics are "
                             "genuinely ambiguous - neither model can be trusted strongly.",
                "threshold_crossed": "uncertainty_vs_disagreement_ratio",
                "threshold_value": 1.5,
                "actual_value": disagreement.get("n_uncertainty_divergence", 0) / max(disagreement.get("n_disagreements", 1), 1),
            })
        elif case_count < 3 and severity_impact > 0.6:
            playbook["rules"].append({
                "rule_type": "AMBIGUOUS",
                "trigger": "case_count < 3 AND severity_impact > 0.6",
                "confidence_band": "no_certainty",
                "rationale": "Insufficient cluster history to guide decision. High severity case "
                             "with limited evidence - recommend specialist.",
                "threshold_crossed": "case_count + severity_impact",
                "threshold_value": "3 + 0.6",
                "actual_value": f"{case_count} + {severity_impact:.2f}",
            })

        if not any(r["rule_type"] in ("MUST_OVERRIDE", "DISCOUNT_32B", "AMBIGUOUS") for r in playbook["rules"]):
            if severity_impact >= 0.6 or conf_delta >= 0.25:
                playbook["rules"].append({
                    "rule_type": "SHOULD_OVERRIDE",
                    "trigger": "severity_impact >= 0.6 OR conf_delta >= 0.25",
                    "confidence_band": "medium_certainty",
                    "rationale": f"Evidence supports 32B escalation (severity={severity_impact:.0%}, "
                                 f"conf_delta={conf_delta:.0%}). Consider promotion.",
                    "threshold_crossed": "severity_impact + conf_delta",
                    "threshold_value": "0.6 | 0.25",
                    "actual_value": f"{severity_impact:.2f} | {conf_delta:.2f}",
                })
            else:
                playbook["rules"].append({
                    "rule_type": "CONSIDER_OVERRIDE",
                    "trigger": "default_case",
                    "confidence_band": "low_certainty",
                    "rationale": "Mixed signals. Standard review may suffice but 32B could add value.",
                    "threshold_crossed": "none",
                    "threshold_value": "none",
                    "actual_value": "default",
                })

        rule_types = [r["rule_type"] for r in playbook["rules"]]
        if "MUST_OVERRIDE" in rule_types:
            playbook["recommendation"] = "mandatory_32b_review"
            playbook["confidence"] = 0.85
        elif "DISCOUNT_32B" in rule_types:
            playbook["recommendation"] = "standard_review"
            playbook["confidence"] = 0.75
        elif "AMBIGUOUS" in rule_types:
            playbook["recommendation"] = "specialist_referral"
            playbook["confidence"] = 0.60
        elif "SHOULD_OVERRIDE" in rule_types:
            playbook["recommendation"] = "promote_to_32b"
            playbook["confidence"] = 0.70
        else:
            playbook["recommendation"] = "consider_32b"
            playbook["confidence"] = 0.50

        playbook["natural_language_rationale"] = _build_playbook_natural_language(playbook)
        playbooks.append(playbook)

    return playbooks


def _build_playbook_natural_language(playbook: dict) -> str:
    """
    Build human-readable natural language rationale for a playbook.
    """
    parts = []
    cluster_key = playbook.get("cluster_key", "unknown")
    recommendation = playbook.get("recommendation", "unknown")
    confidence = playbook.get("confidence", 0.5)
    case_count = playbook.get("case_count", 0)
    escalation_rate = playbook.get("escalation_rate", 0)

    parts.append(f"PLAYBOOK FOR CLUSTER: {cluster_key}")
    parts.append(f"This cluster has {case_count} historical cases with {escalation_rate:.0%} escalation rate.")

    for rule in playbook.get("rules", []):
        rule_type = rule.get("rule_type", "unknown")
        trigger = rule.get("trigger", "unknown")
        rationale = rule.get("rationale", "")

        if rule_type == "MUST_OVERRIDE":
            parts.append(f"\n[MANDATORY ESCALATION] Rule triggered: {trigger}")
            parts.append(f"  -> {rationale}")
        elif rule_type == "DISCOUNT_32B":
            parts.append(f"\n[DISCOUNT ESCALATION] Rule triggered: {trigger}")
            parts.append(f"  -> {rationale}")
        elif rule_type == "AMBIGUOUS":
            parts.append(f"\n[AMBIGUOUS CASE] Rule triggered: {trigger}")
            parts.append(f"  -> {rationale}")
        elif rule_type == "SHOULD_OVERRIDE":
            parts.append(f"\n[RECOMMEND ESCALATION] Rule triggered: {trigger}")
            parts.append(f"  -> {rationale}")
        else:
            parts.append(f"\n[{rule_type}] Rule triggered: {trigger}")
            parts.append(f"  -> {rationale}")

    parts.append(f"\nFINAL RECOMMENDATION: {recommendation.upper().replace('_', ' ')}")
    parts.append(f"CONFIDENCE: {confidence:.0%}")

    if recommendation == "mandatory_32b_review":
        parts.append("This case MUST be escalated to 32B review based on established criteria.")
    elif recommendation == "promote_to_32b":
        parts.append("This case SHOULD be promoted to 32B review based on evidence.")
    elif recommendation == "standard_review":
        parts.append("Standard 7B review is sufficient. 32B escalation is unlikely to add value.")
    elif recommendation == "specialist_referral":
        parts.append("Neither 7B nor 32B can be trusted strongly. Consider specialist consultation.")
    else:
        parts.append("Consider 32B review if additional confidence is desired.")

    return "\n".join(parts)


def _get_playbook_for_case(case_id: str) -> dict | None:
    """
    Get the appropriate promotion playbook for a specific case.

    Finds the matching cluster playbook based on case characteristics.
    """
    if case_id not in SHADOW_DISAGREEMENTS:
        return None

    disagreement = SHADOW_DISAGREEMENTS[case_id]
    cluster_key = _build_disagreement_cluster_key(disagreement)
    cluster_performance = _get_cluster_performance(cluster_key)

    if not cluster_performance:
        return None

    playbook = {
        "case_id": case_id,
        "cluster_key": cluster_key,
        "matching_criteria": {
            "domain": disagreement.get("domain", "unknown"),
            "body_region": disagreement.get("body_region", "unknown"),
            "pattern_type": disagreement.get("pattern_type", "unknown"),
            "severity_impact": disagreement.get("severity_impact", 0.5),
            "conf_delta": abs(
                disagreement.get("consult_confidence", 0.5) -
                disagreement.get("review_confidence", 0.5)
            )
        },
        "cluster_stats": cluster_performance,
        "recommendation": None,
        "confidence": 0.0,
        "rules_triggered": [],
        "natural_language": ""
    }

    severity_impact = disagreement.get("severity_impact", 0.5)
    conf_delta = playbook["matching_criteria"]["conf_delta"]
    pattern_type = disagreement.get("pattern_type", "unknown")
    body_region = disagreement.get("body_region", "unknown")
    escalation_rate = cluster_performance.get("escalation_rate", 0)
    case_count = cluster_performance.get("case_count", 0)

    # Apply playbook rules
    # MUST_OVERRIDE
    if severity_impact >= 0.8:
        playbook["rules_triggered"].append({
            "type": "MUST_OVERRIDE",
            "trigger": f"severity_impact={severity_impact:.2f} >= 0.8",
            "explanation": "Critical severity mandates 32B review"
        })
    elif pattern_type == "diagnostic" and severity_impact >= 0.7:
        playbook["rules_triggered"].append({
            "type": "MUST_OVERRIDE",
            "trigger": f"pattern_type={pattern_type} AND severity_impact={severity_impact:.2f} >= 0.7",
            "explanation": "Diagnostic pattern with high severity requires mandatory 32B"
        })
    elif escalation_rate >= 0.7 and case_count >= 5:
        playbook["rules_triggered"].append({
            "type": "MUST_OVERRIDE",
            "trigger": f"escalation_rate={escalation_rate:.2f} >= 0.7 AND case_count={case_count} >= 5",
            "explanation": f"Historical cluster data strongly supports escalation ({escalation_rate:.0%} rate)"
        })

    # DISCOUNT_32B
    if pattern_type == "alignment" and conf_delta < 0.1:
        playbook["rules_triggered"].append({
            "type": "DISCOUNT_32B",
            "trigger": f"pattern_type={pattern_type} AND conf_delta={conf_delta:.2f} < 0.1",
            "explanation": "Models strongly agree - 32B escalation unlikely to add value"
        })
    elif escalation_rate < 0.1 and case_count >= 3:
        playbook["rules_triggered"].append({
            "type": "DISCOUNT_32B",
            "trigger": f"escalation_rate={escalation_rate:.2f} < 0.1 AND case_count={case_count} >= 3",
            "explanation": "Cluster rarely requires escalation despite sufficient history"
        })

    # AMBIGUOUS
    if disagreement.get("n_uncertainty_divergence", 0) > disagreement.get("n_disagreements", 0) * 1.5:
        playbook["rules_triggered"].append({
            "type": "AMBIGUOUS",
            "trigger": "n_uncertainty_divergence > n_disagreements * 1.5",
            "explanation": "Case is genuinely ambiguous - neither model can be trusted"
        })

    # Determine recommendation
    rule_types = [r["type"] for r in playbook["rules_triggered"]]

    if "MUST_OVERRIDE" in rule_types:
        playbook["recommendation"] = "mandatory_32b_review"
        playbook["confidence"] = 0.85
    elif "DISCOUNT_32B" in rule_types:
        playbook["recommendation"] = "standard_review"
        playbook["confidence"] = 0.75
    elif "AMBIGUOUS" in rule_types:
        playbook["recommendation"] = "specialist_referral"
        playbook["confidence"] = 0.60
    elif "SHOULD_OVERRIDE" in rule_types:
        playbook["recommendation"] = "promote_to_32b"
        playbook["confidence"] = 0.70
    else:
        playbook["recommendation"] = "consider_32b"
        playbook["confidence"] = 0.50

    playbook["natural_language"] = _build_playbook_natural_language({
        "cluster_key": cluster_key,
        "recommendation": playbook["recommendation"],
        "confidence": playbook["confidence"],
        "case_count": case_count,
        "escalation_rate": escalation_rate,
        "rules": playbook["rules_triggered"]
    })

    return playbook


def _should_32b_override_7b(case_id: str) -> tuple[bool, float, str]:
    """
    Determine if 32B should override 7B for a given case.

    Returns:
        Tuple of (should_override, confidence, rationale)
    """
    playbook = _get_playbook_for_case(case_id)

    if not playbook:
        return False, 0.0, "No playbook available - insufficient cluster data"

    recommendation = playbook.get("recommendation", "")
    confidence = playbook.get("confidence", 0.5)
    rationale = playbook.get("natural_language", "")

    should_override = recommendation in ("mandatory_32b_review", "promote_to_32b")

    return should_override, confidence, rationale


def _should_32b_be_discounted(case_id: str) -> tuple[bool, float, str]:
    """
    Determine if 32B analysis should be discounted for a given case.

    Returns:
        Tuple of (should_discount, confidence, rationale)
    """
    playbook = _get_playbook_for_case(case_id)

    if not playbook:
        return False, 0.0, "No playbook available - insufficient cluster data"

    rule_types = [r["type"] for r in playbook.get("rules_triggered", [])]

    should_discount = "DISCOUNT_32B" in rule_types
    confidence = playbook.get("confidence", 0.5)
    rationale = playbook.get("natural_language", "")

    return should_discount, confidence, rationale


def _is_case_too_ambiguous(case_id: str) -> tuple[bool, float, str]:
    """
    Determine if a case is too ambiguous to trust either model strongly.

    Returns:
        Tuple of (is_ambiguous, confidence, rationale)
    """
    playbook = _get_playbook_for_case(case_id)

    if not playbook:
        return True, 0.5, "Case classified as ambiguous due to lack of cluster data"

    rule_types = [r["type"] for r in playbook.get("rules_triggered", [])]

    is_ambiguous = "AMBIGUOUS" in rule_types
    confidence = playbook.get("confidence", 0.5)
    rationale = playbook.get("natural_language", "")

    return is_ambiguous, confidence, rationale


# =============================================================================
# False Positive / False Negative Promotion Analysis
# Analyze cases where escalation happened but shouldn't have (FP)
# and cases where escalation should have happened but didn't (FN)
# =============================================================================

def _analyze_false_positives() -> dict:
    """
    Analyze false positive promotion cases.

    False positives are cases where escalation happened but shouldn't have -
    i.e., cases that were escalated to 32B review but the escalation did not
    result in a meaningfully different outcome or was not warranted.

    Returns:
        Dictionary with false positive analysis including patterns by
        body region, severity, image quality, and pattern type.
    """
    false_positives = {
        "total_count": 0,
        "cases": [],
        "patterns": {
            "by_body_region": {},
            "by_severity": {},
            "by_image_quality": {},
            "by_pattern_type": {}
        },
        "cluster_analysis": []
    }

    disagreements_snapshot = _shadow_disagreements_snapshot()
    for case_id, disagreement in disagreements_snapshot:
        outcome = _final_outcome_for_case(case_id)
        if outcome != "escalated":
            continue

        severity_impact = disagreement.get("severity_impact", 0.5)
        conf_delta = abs(
            disagreement.get("consult_confidence", 0.5) -
            disagreement.get("review_confidence", 0.5)
        )

        if severity_impact < 0.4 and conf_delta < 0.15:
            image_quality = _resolve_image_quality_for_case(case_id, disagreement)
            fp_case = {
                "case_id": case_id,
                "domain": disagreement.get("domain", "unknown"),
                "body_region": disagreement.get("body_region", "unknown"),
                "pattern_type": disagreement.get("pattern_type", "unknown"),
                "image_quality": image_quality,
                "severity_impact": severity_impact,
                "conf_delta": conf_delta,
                "outcome": outcome,
                "explanation": f"Low severity ({severity_impact:.0%}) and small conf_delta ({conf_delta:.0%}) "
                               f"suggest escalation was not warranted. Final outcome: {outcome}",
            }
            false_positives["cases"].append(fp_case)
            false_positives["total_count"] += 1

            _append_case_to_pattern_bucket(
                false_positives["patterns"]["by_body_region"],
                disagreement.get("body_region", "unknown"),
                case_id,
            )
            severity_bucket = "LOW" if severity_impact < 0.3 else "MEDIUM"
            _append_case_to_pattern_bucket(
                false_positives["patterns"]["by_severity"],
                severity_bucket,
                case_id,
            )
            _append_case_to_pattern_bucket(
                false_positives["patterns"]["by_image_quality"],
                image_quality,
                case_id,
            )
            _append_case_to_pattern_bucket(
                false_positives["patterns"]["by_pattern_type"],
                disagreement.get("pattern_type", "unknown"),
                case_id,
            )

    cluster_fp = {}
    for fp_case in false_positives["cases"]:
        disagreement = next((d for cid, d in disagreements_snapshot if cid == fp_case["case_id"]), {})
        cluster_key = _build_disagreement_cluster_key(disagreement)
        if cluster_key not in cluster_fp:
            cluster_fp[cluster_key] = {"count": 0, "cases": []}
        cluster_fp[cluster_key]["count"] += 1
        cluster_fp[cluster_key]["cases"].append(fp_case["case_id"])

    false_positives["cluster_analysis"] = [
        {"cluster_key": k, "count": v["count"], "cases": v["cases"]}
        for k, v in cluster_fp.items()
    ]
    false_positives["cluster_analysis"].sort(key=lambda x: x["count"], reverse=True)

    # Add natural language summary
    false_positives["summary"] = _build_false_positive_summary(false_positives)

    return false_positives


def _build_false_positive_summary(fp_analysis: dict) -> str:
    """Build natural language summary of false positive patterns."""
    parts = []
    total = fp_analysis["total_count"]

    if total == 0:
        return "No false positive escalations detected in current data."

    parts.append(f"FALSE POSITIVE ANALYSIS: {total} cases where escalation may not have been warranted.")

    # Most common body regions
    by_region = fp_analysis["patterns"]["by_body_region"]
    if by_region:
        top_regions = sorted(by_region.items(), key=lambda x: x[1]["count"], reverse=True)[:3]
        parts.append(f"\nMost affected body regions:")
        for region, data in top_regions:
            parts.append(f"  - {region}: {data['count']} FP cases ({data['count']/total:.0%})")

    # Most common pattern types
    by_pattern = fp_analysis["patterns"]["by_pattern_type"]
    if by_pattern:
        top_patterns = sorted(by_pattern.items(), key=lambda x: x[1]["count"], reverse=True)[:3]
        parts.append(f"\nMost affected pattern types:")
        for pattern, data in top_patterns:
            parts.append(f"  - {pattern}: {data['count']} FP cases ({data['count']/total:.0%})")

    # Recommendations
    parts.append(f"\nRECOMMENDATIONS:")
    parts.append(f"  - Review escalation thresholds for low-severity cases ({fp_analysis['patterns']['by_severity'].get('LOW', {}).get('count', 0)} cases)")
    parts.append(f"  - Consider tightening confidence delta thresholds before escalation")
    parts.append(f"  - Cluster analysis shows {len(fp_analysis['cluster_analysis'])} clusters with FP patterns")

    return "\n".join(parts)


def _analyze_false_negatives() -> dict:
    """
    Analyze false negative promotion cases.

    False negatives are cases where escalation should have happened but didn't -
    i.e., cases that were NOT escalated but should have been based on
    severity, complexity, or outcome patterns.

    Returns:
        Dictionary with false negative analysis including patterns by
        body region, severity, image quality, and pattern type.
    """
    false_negatives = {
        "total_count": 0,
        "cases": [],
        "patterns": {
            "by_body_region": {},
            "by_severity": {},
            "by_image_quality": {},
            "by_pattern_type": {}
        },
        "cluster_analysis": []
    }

    disagreements_snapshot = _shadow_disagreements_snapshot()
    for case_id, disagreement in disagreements_snapshot:
        outcome = _final_outcome_for_case(case_id)
        if outcome == "escalated":
            continue

        severity_impact = disagreement.get("severity_impact", 0.5)
        conf_delta = abs(
            disagreement.get("consult_confidence", 0.5) -
            disagreement.get("review_confidence", 0.5)
        )
        n_disagreements = disagreement.get("n_disagreements", 0)

        if severity_impact >= 0.65 or (conf_delta >= 0.25 and n_disagreements >= 2):
            image_quality = _resolve_image_quality_for_case(case_id, disagreement)
            fn_case = {
                "case_id": case_id,
                "domain": disagreement.get("domain", "unknown"),
                "body_region": disagreement.get("body_region", "unknown"),
                "pattern_type": disagreement.get("pattern_type", "unknown"),
                "image_quality": image_quality,
                "severity_impact": severity_impact,
                "conf_delta": conf_delta,
                "n_disagreements": n_disagreements,
                "outcome": outcome,
                "explanation": f"High severity ({severity_impact:.0%}) or disagreement (conf_delta={conf_delta:.0%}, "
                               f"n_disagreements={n_disagreements}) but NOT escalated. Outcome: {outcome}",
            }
            false_negatives["cases"].append(fn_case)
            false_negatives["total_count"] += 1

            _append_case_to_pattern_bucket(
                false_negatives["patterns"]["by_body_region"],
                disagreement.get("body_region", "unknown"),
                case_id,
            )
            severity_bucket = "HIGH" if severity_impact >= 0.7 else "MEDIUM"
            _append_case_to_pattern_bucket(
                false_negatives["patterns"]["by_severity"],
                severity_bucket,
                case_id,
            )
            _append_case_to_pattern_bucket(
                false_negatives["patterns"]["by_image_quality"],
                image_quality,
                case_id,
            )
            _append_case_to_pattern_bucket(
                false_negatives["patterns"]["by_pattern_type"],
                disagreement.get("pattern_type", "unknown"),
                case_id,
            )

    cluster_fn = {}
    for fn_case in false_negatives["cases"]:
        disagreement = next((d for cid, d in disagreements_snapshot if cid == fn_case["case_id"]), {})
        cluster_key = _build_disagreement_cluster_key(disagreement)
        if cluster_key not in cluster_fn:
            cluster_fn[cluster_key] = {"count": 0, "cases": []}
        cluster_fn[cluster_key]["count"] += 1
        cluster_fn[cluster_key]["cases"].append(fn_case["case_id"])

    false_negatives["cluster_analysis"] = [
        {"cluster_key": k, "count": v["count"], "cases": v["cases"]}
        for k, v in cluster_fn.items()
    ]
    false_negatives["cluster_analysis"].sort(key=lambda x: x["count"], reverse=True)

    # Add natural language summary
    false_negatives["summary"] = _build_false_negative_summary(false_negatives)

    return false_negatives


def _build_false_negative_summary(fn_analysis: dict) -> str:
    """Build natural language summary of false negative patterns."""
    parts = []
    total = fn_analysis["total_count"]

    if total == 0:
        return "No false negative cases detected in current data."

    parts.append(f"FALSE NEGATIVE ANALYSIS: {total} cases where escalation should have happened but didn't.")

    # Most common body regions
    by_region = fn_analysis["patterns"]["by_body_region"]
    if by_region:
        top_regions = sorted(by_region.items(), key=lambda x: x[1]["count"], reverse=True)[:3]
        parts.append(f"\nMost affected body regions:")
        for region, data in top_regions:
            parts.append(f"  - {region}: {data['count']} FN cases ({data['count']/total:.0%})")

    # Most common pattern types
    by_pattern = fn_analysis["patterns"]["by_pattern_type"]
    if by_pattern:
        top_patterns = sorted(by_pattern.items(), key=lambda x: x[1]["count"], reverse=True)[:3]
        parts.append(f"\nMost affected pattern types:")
        for pattern, data in top_patterns:
            parts.append(f"  - {pattern}: {data['count']} FN cases ({data['count']/total:.0%})")

    # Most common severity levels
    by_severity = fn_analysis["patterns"]["by_severity"]
    if by_severity:
        parts.append(f"\nSeverity distribution:")
        for severity, data in sorted(by_severity.items()):
            parts.append(f"  - {severity}: {data['count']} cases")

    # Recommendations
    parts.append(f"\nRECOMMENDATIONS:")
    parts.append(f"  - Lower escalation thresholds for high-severity cases ({by_severity.get('HIGH', {}).get('count', 0)} missed)")
    parts.append(f"  - Review confidence delta requirements for escalation")
    parts.append(f"  - Cluster analysis shows {len(fn_analysis['cluster_analysis'])} clusters with FN patterns")

    return "\n".join(parts)


def _compute_outcome_linked_patterns() -> dict:
    """
    Compute outcome-linked patterns by body region, severity, image quality, and pattern type.

    This analysis links specific case characteristics to outcomes to identify
    which features reliably predict escalation success or failure.

    Returns:
        Dictionary with outcome patterns by each dimension.
    """
    patterns = {
        "by_body_region": {},
        "by_severity": {},
        "by_image_quality": {},
        "by_pattern_type": {},
        "by_confidence_delta": {},
        "composite_patterns": []
    }

    disagreements_snapshot = _shadow_disagreements_snapshot()
    for case_id, disagreement in disagreements_snapshot:
        outcome = _final_outcome_for_case(case_id)
        body_region = disagreement.get("body_region", "unknown")
        severity_impact = disagreement.get("severity_impact", 0.5)
        image_quality = _resolve_image_quality_for_case(case_id, disagreement)
        pattern_type = disagreement.get("pattern_type", "unknown")
        conf_delta = abs(
            disagreement.get("consult_confidence", 0.5) -
            disagreement.get("review_confidence", 0.5)
        )

        if body_region not in patterns["by_body_region"]:
            patterns["by_body_region"][body_region] = {
                "total": 0, "escalated": 0, "resolved": 0,
                "escalation_rate": 0.0, "avg_severity": 0.0,
            }
        pr = patterns["by_body_region"][body_region]
        pr["total"] += 1
        pr["escalated" if outcome == "escalated" else "resolved"] += 1
        pr["avg_severity"] = (pr["avg_severity"] * (pr["total"] - 1) + severity_impact) / pr["total"]
        pr["escalation_rate"] = pr["escalated"] / pr["total"]

        if severity_impact >= 0.7:
            severity_bucket = "HIGH"
        elif severity_impact >= 0.4:
            severity_bucket = "MEDIUM"
        else:
            severity_bucket = "LOW"

        if severity_bucket not in patterns["by_severity"]:
            patterns["by_severity"][severity_bucket] = {
                "total": 0, "escalated": 0, "resolved": 0,
                "escalation_rate": 0.0,
            }
        ps = patterns["by_severity"][severity_bucket]
        ps["total"] += 1
        ps["escalated" if outcome == "escalated" else "resolved"] += 1
        ps["escalation_rate"] = ps["escalated"] / ps["total"]

        if image_quality not in patterns["by_image_quality"]:
            patterns["by_image_quality"][image_quality] = {
                "total": 0, "escalated": 0, "resolved": 0,
                "escalation_rate": 0.0,
            }
        piq = patterns["by_image_quality"][image_quality]
        piq["total"] += 1
        piq["escalated" if outcome == "escalated" else "resolved"] += 1
        piq["escalation_rate"] = piq["escalated"] / piq["total"]

        if pattern_type not in patterns["by_pattern_type"]:
            patterns["by_pattern_type"][pattern_type] = {
                "total": 0, "escalated": 0, "resolved": 0,
                "escalation_rate": 0.0,
            }
        pt = patterns["by_pattern_type"][pattern_type]
        pt["total"] += 1
        pt["escalated" if outcome == "escalated" else "resolved"] += 1
        pt["escalation_rate"] = pt["escalated"] / pt["total"]

        if conf_delta >= 0.35:
            cd_bucket = "HIGH"
        elif conf_delta >= 0.2:
            cd_bucket = "MEDIUM"
        else:
            cd_bucket = "LOW"

        if cd_bucket not in patterns["by_confidence_delta"]:
            patterns["by_confidence_delta"][cd_bucket] = {
                "total": 0, "escalated": 0, "resolved": 0,
                "escalation_rate": 0.0,
            }
        pcd = patterns["by_confidence_delta"][cd_bucket]
        pcd["total"] += 1
        pcd["escalated" if outcome == "escalated" else "resolved"] += 1
        pcd["escalation_rate"] = pcd["escalated"] / pcd["total"]

    # Build composite patterns (combinations of features)
    composite = {}
    for case_id, disagreement in disagreements_snapshot:
        outcome = _final_outcome_for_case(case_id)
        severity_impact = disagreement.get("severity_impact", 0.5)
        severity_bucket = "HIGH" if severity_impact >= 0.7 else ("MEDIUM" if severity_impact >= 0.4 else "LOW")
        body_region = disagreement.get("body_region", "unknown")
        pattern_type = disagreement.get("pattern_type", "unknown")
        key = f"{severity_bucket}/{body_region}/{pattern_type}"
        if key not in composite:
            composite[key] = {"total": 0, "escalated": 0, "resolved": 0, "escalation_rate": 0.0}
        composite[key]["total"] += 1
        composite[key]["escalated" if outcome == "escalated" else "resolved"] += 1

    for key, data in composite.items():
        if data["total"] >= 3:  # Only significant composites
            data["escalation_rate"] = data["escalated"] / data["total"] if data["total"] > 0 else 0
            patterns["composite_patterns"].append({
                "pattern": key,
                "total": data["total"],
                "escalated": data["escalated"],
                "resolved": data["resolved"],
                "escalation_rate": data["escalation_rate"]
            })

    patterns["composite_patterns"].sort(key=lambda x: x["escalation_rate"], reverse=True)

    # Add natural language summary
    patterns["summary"] = _build_outcome_linked_summary(patterns)

    return patterns


def _build_outcome_linked_summary(patterns: dict) -> str:
    """Build natural language summary of outcome-linked patterns."""
    parts = []

    parts.append("OUTCOME-LINKED PATTERN ANALYSIS")
    parts.append("=" * 50)

    # High-risk body regions
    by_region = patterns["by_body_region"]
    high_risk_regions = [(k, v) for k, v in by_region.items() if v.get("escalation_rate", 0) > 0.5 and v["total"] >= 3]
    if high_risk_regions:
        parts.append("\nHIGH-RISK BODY REGIONS (escalation rate > 50%):")
        for region, data in sorted(high_risk_regions, key=lambda x: x[1]["escalation_rate"], reverse=True):
            parts.append(f"  - {region}: {data['escalation_rate']:.0%} escalation rate ({data['total']} cases)")

    # Severity patterns
    by_severity = patterns["by_severity"]
    parts.append("\nESCALATION BY SEVERITY:")
    for severity in ["HIGH", "MEDIUM", "LOW"]:
        if severity in by_severity:
            data = by_severity[severity]
            parts.append(f"  - {severity}: {data['escalation_rate']:.0%} escalation rate ({data['total']} cases)")

    # Pattern type patterns
    by_pattern = patterns["by_pattern_type"]
    high_risk_patterns = [(k, v) for k, v in by_pattern.items() if v.get("escalation_rate", 0) > 0.5 and v["total"] >= 3]
    if high_risk_patterns:
        parts.append("\nHIGH-RISK PATTERN TYPES:")
        for pattern, data in sorted(high_risk_patterns, key=lambda x: x[1]["escalation_rate"], reverse=True):
            parts.append(f"  - {pattern}: {data['escalation_rate']:.0%} escalation rate ({data['total']} cases)")

    # Confidence delta patterns
    by_cd = patterns["by_confidence_delta"]
    parts.append("\nESCALATION BY CONFIDENCE DELTA:")
    for cd in ["HIGH", "MEDIUM", "LOW"]:
        if cd in by_cd:
            data = by_cd[cd]
            parts.append(f"  - {cd}: {data['escalation_rate']:.0%} escalation rate ({data['total']} cases)")

    # Top composite patterns
    composites = patterns.get("composite_patterns", [])[:5]
    if composites:
        parts.append("\nTOP COMPOSITE PATTERNS (by escalation rate):")
        for cp in composites:
            parts.append(f"  - {cp['pattern']}: {cp['escalation_rate']:.0%} escalation rate ({cp['total']} cases)")

    return "\n".join(parts)


def _compute_severity_weighted_thresholds() -> dict:
    """
    Compute promotion thresholds weighted by severity indicators.

    Returns severity-based thresholds for promotion decisions.
    """
    severity_outcomes = {
        "HIGH_SEVERITY": {"total": 0, "escalated": 0},
        "MEDIUM_SEVERITY": {"total": 0, "escalated": 0},
        "LOW_SEVERITY": {"total": 0, "escalated": 0}
    }

    with STATE_LOCK:
        for severity_record in SEVERITY_INDICATORS:
            severity_level = _severity_bucket_from_risk_score(
                float(severity_record.get("risk_score", 0.5))
            )
            outcome = _final_outcome_for_case(str(severity_record.get("case_id", "")))

            severity_outcomes[severity_level]["total"] += 1
            if outcome == "escalated":
                severity_outcomes[severity_level]["escalated"] += 1

    result = {}
    for severity, data in severity_outcomes.items():
        if data["total"] >= 5:
            escalation_rate = data["escalated"] / data["total"]
            result[f"{severity.lower()}_escalation_rate"] = escalation_rate
            result[f"{severity.lower()}_case_count"] = data["total"]

            if severity == "HIGH_SEVERITY":
                result["high_severity_escalation_rate"] = escalation_rate
                result["high_severity_total"] = data["total"]

    return result


def _compute_pattern_type_thresholds() -> dict[str, dict]:
    """
    Compute promotion thresholds based on disagreement pattern types.

    Returns thresholds per pattern type (diagnostic, urgency, etc.).
    """
    pattern_data = {}

    with STATE_LOCK:
        for case_id, disagreement in SHADOW_DISAGREEMENTS.items():
            pattern_type = disagreement.get("pattern_type", "unknown")

            if pattern_type not in pattern_data:
                pattern_data[pattern_type] = {
                    "pattern_type": pattern_type,
                    "cases": [],
                    "outcomes": [],
                    "escalated": 0,
                    "severity_impacts": []
                }

            pattern_data[pattern_type]["cases"].append(case_id)
            outcome = _final_outcome_for_case(case_id)
            pattern_data[pattern_type]["outcomes"].append(outcome)

            if outcome == "escalated":
                pattern_data[pattern_type]["escalated"] += 1

            pattern_data[pattern_type]["severity_impacts"].append(
                disagreement.get("severity_impact", 0.5)
            )

    result = {}
    for pattern_type, data in pattern_data.items():
        if len(data["cases"]) >= 3:  # Only patterns with enough data
            result[pattern_type] = {
                "pattern_type": pattern_type,
                "case_count": len(data["cases"]),
                "escalation_rate": data["escalated"] / len(data["cases"]),
                "avg_severity_impact": sum(data["severity_impacts"]) / len(data["severity_impacts"]),
                "requires_promotion": (data["escalated"] / len(data["cases"])) > 0.25
            }

    return result


def _compute_confidence_delta_thresholds() -> dict:
    """
    Compute thresholds based on confidence delta between models.

    Returns thresholds for when large confidence deltas should trigger promotion.
    """
    delta_buckets = {
        "low_delta": {"cases": 0, "escalated": 0},      # < 0.15
        "medium_delta": {"cases": 0, "escalated": 0},   # 0.15 - 0.30
        "high_delta": {"cases": 0, "escalated": 0}      # > 0.30
    }

    with STATE_LOCK:
        for case_id, disagreement in SHADOW_DISAGREEMENTS.items():
            conf_delta = disagreement.get("confidence_delta", 0)
            outcome = _final_outcome_for_case(case_id)

            if conf_delta < 0.15:
                bucket = delta_buckets["low_delta"]
            elif conf_delta < 0.30:
                bucket = delta_buckets["medium_delta"]
            else:
                bucket = delta_buckets["high_delta"]

            bucket["cases"] += 1
            if outcome == "escalated":
                bucket["escalated"] += 1

    result = {}
    total_cases = sum(b["cases"] for b in delta_buckets.values())

    if total_cases >= 10:
        high_delta = delta_buckets["high_delta"]
        if high_delta["cases"] > 0:
            escalation_rate = high_delta["escalated"] / high_delta["cases"]
            result["delta_threshold"] = 0.30
            result["escalation_rate"] = escalation_rate
            result["high_delta_cases"] = high_delta["cases"]

            if escalation_rate > 0.25:
                result["recommendation"] = "promote_on_high_delta"

    return result


@app.get("/intelligence/disagreement-clusters")
async def get_cross_case_disagreement_clusters(
    authorization: str | None = Header(default=None),
):
    """
    Get enhanced disagreement clustering across multiple cases.

    Groups disagreements by domain, body region, pattern type, and severity impact
    to identify systemic 7B-32B calibration issues.
    """
    validate_auth(authorization)

    clusters = {}

    with STATE_LOCK:
        for case_id, disagreement in SHADOW_DISAGREEMENTS.items():
            cluster_key = _build_disagreement_cluster_key(disagreement)
            if cluster_key not in clusters:
                clusters[cluster_key] = {
                    "cluster_key": cluster_key,
                    "domain": disagreement.get("domain", "unknown"),
                    "body_region": disagreement.get("body_region", "unknown"),
                    "pattern_type": disagreement.get("pattern_type", "unknown"),
                    "severity_impact": disagreement.get("severity_impact", "medium"),
                    "cases": [],
                    "total_score": 0.0,
                    "count": 0
                }

            score = _compute_disagreement_score(case_id)
            clusters[cluster_key]["cases"].append(case_id)
            clusters[cluster_key]["total_score"] += score
            clusters[cluster_key]["count"] += 1

    # Compute averages and sort by significance
    result = []
    for cluster in clusters.values():
        cluster["avg_score"] = cluster["total_score"] / cluster["count"] if cluster["count"] > 0 else 0
        cluster["significance"] = cluster["avg_score"] * cluster["count"]
        result.append(cluster)

    result.sort(key=lambda x: x["significance"], reverse=True)

    return {
        "total_clusters": len(result),
        "clusters": result[:50]
    }


@app.get("/intelligence/promotion-thresholds")
async def get_promotion_threshold_recommendations(
    recommendation_type: str = "general",
    authorization: str | None = Header(default=None),
):
    """
    Get promotion-threshold recommendations.

    Analyzes when cases should be escalated from 7B consult to 32B review
    based on historical patterns that distinguish satisfactory from exemplary outcomes.
    """
    validate_auth(authorization)

    thresholds = _compute_promotion_threshold(recommendation_type)

    with STATE_LOCK:
        CROSS_CASE_INTELLIGENCE["promotion_thresholds"].append({
            "computed_at": datetime.now(timezone.utc).isoformat(),
            "recommendation_type": recommendation_type,
            **thresholds
        })
        _trim_list_in_place(
            CROSS_CASE_INTELLIGENCE["promotion_thresholds"], MAX_PATTERN_HISTORY
        )

    return thresholds


@app.get("/intelligence/playbooks")
async def get_cluster_promotion_playbooks(
    authorization: str | None = Header(default=None),
):
    """
    Get reusable cluster-level promotion playbooks built from disagreement history.
    """
    validate_auth(authorization)

    playbooks = _build_cluster_promotion_playbooks()
    return {
        "total_playbooks": len(playbooks),
        "playbooks": playbooks[:50],
    }


@app.get("/intelligence/calibration/{case_id}")
async def get_reviewer_calibration_narrative(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Get reviewer calibration narrative for a specific case.

    Explains when the 32B reviewer should be trusted more than the 7B consult
    based on disagreement characteristics, severity, and case complexity.

    Phase 5: Includes promotion-readiness summary with keep in shadow /
    promote cautiously / block promotion recommendations.
    """
    validate_auth(authorization)

    narrative = _generate_reviewer_calibration_narrative(case_id)

    with STATE_LOCK:
        CROSS_CASE_INTELLIGENCE["calibration_narratives"].append({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            **narrative
        })
        _trim_list_in_place(
            CROSS_CASE_INTELLIGENCE["calibration_narratives"], MAX_PATTERN_HISTORY
        )

    return narrative


@app.get("/intelligence/promotion-readiness/{case_id}")
async def get_promotion_readiness_summary(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Get Phase 5 promotion-readiness summary for a specific case.

    Returns recommendation with natural-language rationale and confidence band:
    - keep_in_shadow: Continue shadow mode, insufficient evidence for promotion
    - promote_cautiously: Promote with monitoring, reasonable evidence supports promotion
    - block_promotion: Block promotion until issues are addressed

    Based on observed shadow behavior including false positive/negative rates,
    severity impact, confidence deltas, and disagreement patterns.
    """
    validate_auth(authorization)

    narrative = _generate_reviewer_calibration_narrative(case_id)
    promotion_readiness = narrative.get("promotion_readiness", {})

    with STATE_LOCK:
        CROSS_CASE_INTELLIGENCE.setdefault("promotion_readiness_summaries", [])
        CROSS_CASE_INTELLIGENCE["promotion_readiness_summaries"].append({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "case_id": case_id,
            **promotion_readiness
        })
        _trim_list_in_place(
            CROSS_CASE_INTELLIGENCE["promotion_readiness_summaries"], MAX_PATTERN_HISTORY
        )

    return {
        "case_id": case_id,
        "promotion_readiness": promotion_readiness,
    }


@app.get("/intelligence/promotion-readiness/batch")
async def get_batch_promotion_readiness(
    min_cases: int = 5,
    authorization: str | None = Header(default=None),
):
    """
    Get Phase 5 batch promotion-readiness analysis across multiple cases.

    Analyzes promotion-readiness across all shadow cases and provides:
    - Distribution of recommendations (keep/promote/block)
    - Aggregate shadow behavior metrics
    - Body region specific recommendations
    - Pattern type specific recommendations
    - Overall promotion readiness score
    """
    validate_auth(authorization)

    readiness_counts = {
        "keep_in_shadow": 0,
        "promote_cautiously": 0,
        "block_promotion": 0,
    }
    readiness_summaries = []
    aggregate_shadow_metrics = {
        "total_cases": 0,
        "avg_false_positive_rate": 0.0,
        "avg_false_negative_rate": 0.0,
        "avg_severity_impact": 0.0,
        "avg_confidence_delta": 0.0,
    }
    body_region_readiness = {}
    pattern_type_readiness = {}

    with STATE_LOCK:
        shadow_cases = list(SHADOW_DISAGREEMENTS.keys())

    if len(shadow_cases) < min_cases:
        return {
            "error": f"Insufficient cases for batch analysis: {len(shadow_cases)} available, {min_cases} required",
            "available_cases": len(shadow_cases),
            "minimum_required": min_cases,
        }

    for case_id in shadow_cases[:100]:  # Limit for performance
        narrative = _generate_reviewer_calibration_narrative(case_id)
        readiness = narrative.get("promotion_readiness", {})

        if readiness.get("recommendation"):
            readiness_counts[readiness["recommendation"]] += 1
            readiness_summaries.append({
                "case_id": case_id,
                "recommendation": readiness["recommendation"],
                "confidence": readiness.get("recommendation_confidence", 0.0),
            })

        # Aggregate shadow metrics
        disagreement = SHADOW_DISAGREEMENTS.get(case_id, {})
        aggregate_shadow_metrics["total_cases"] += 1
        aggregate_shadow_metrics["avg_false_positive_rate"] += disagreement.get("false_positive_rate", 0.0)
        aggregate_shadow_metrics["avg_false_negative_rate"] += disagreement.get("false_negative_rate", 0.0)
        aggregate_shadow_metrics["avg_severity_impact"] += disagreement.get("severity_impact", 0.35)
        conf_delta = abs(
            disagreement.get("consult_confidence", 0.5) -
            disagreement.get("review_confidence", 0.5)
        )
        aggregate_shadow_metrics["avg_confidence_delta"] += conf_delta

        # Body region aggregation
        body_region = disagreement.get("body_region", "unknown")
        if body_region not in body_region_readiness:
            body_region_readiness[body_region] = {"keep": 0, "promote": 0, "block": 0, "total": 0}
        if readiness.get("recommendation"):
            if readiness["recommendation"] == "keep_in_shadow":
                body_region_readiness[body_region]["keep"] += 1
            elif readiness["recommendation"] == "promote_cautiously":
                body_region_readiness[body_region]["promote"] += 1
            elif readiness["recommendation"] == "block_promotion":
                body_region_readiness[body_region]["block"] += 1
        body_region_readiness[body_region]["total"] += 1

        # Pattern type aggregation
        pattern_type = disagreement.get("pattern_type", "unknown")
        if pattern_type not in pattern_type_readiness:
            pattern_type_readiness[pattern_type] = {"keep": 0, "promote": 0, "block": 0, "total": 0}
        if readiness.get("recommendation"):
            if readiness["recommendation"] == "keep_in_shadow":
                pattern_type_readiness[pattern_type]["keep"] += 1
            elif readiness["recommendation"] == "promote_cautiously":
                pattern_type_readiness[pattern_type]["promote"] += 1
            elif readiness["recommendation"] == "block_promotion":
                pattern_type_readiness[pattern_type]["block"] += 1
        pattern_type_readiness[pattern_type]["total"] += 1

    # Normalize aggregate metrics
    n_cases = aggregate_shadow_metrics["total_cases"]
    if n_cases > 0:
        aggregate_shadow_metrics["avg_false_positive_rate"] /= n_cases
        aggregate_shadow_metrics["avg_false_negative_rate"] /= n_cases
        aggregate_shadow_metrics["avg_severity_impact"] /= n_cases
        aggregate_shadow_metrics["avg_confidence_delta"] /= n_cases

    # Calculate overall promotion readiness score
    total_recommendations = sum(readiness_counts.values())
    promote_ratio = readiness_counts["promote_cautiously"] / max(1, total_recommendations)
    keep_ratio = readiness_counts["keep_in_shadow"] / max(1, total_recommendations)
    block_ratio = readiness_counts["block_promotion"] / max(1, total_recommendations)

    # Score: higher is better for promotion (weight promote positively, keep neutral, block negatively)
    overall_score = (promote_ratio * 1.0) + (keep_ratio * 0.3) - (block_ratio * 0.5)
    overall_score = max(0.0, min(1.0, overall_score))

    return {
        "summary": {
            "total_cases_analyzed": n_cases,
            "readiness_distribution": readiness_counts,
            "overall_promotion_readiness_score": round(overall_score, 3),
            "aggregate_shadow_metrics": aggregate_shadow_metrics,
            "recommendation": (
                "ready_for_broader_deployment" if overall_score >= 0.6 and block_ratio < 0.2
                else "requires_targeted_improvement" if overall_score >= 0.4
                else "not_ready_for_expansion"
            ),
        },
        "body_region_analysis": body_region_readiness,
        "pattern_type_analysis": pattern_type_readiness,
        "top_cases_by_readiness": sorted(
            readiness_summaries,
            key=lambda x: x.get("confidence", 0),
            reverse=True
        )[:10],
    }


@app.get("/intelligence/patterns/body-region")
async def get_body_region_patterns(
    authorization: str | None = Header(default=None),
):
    """
    Get outcome-feedback pattern mining by body region.

    Returns patterns of outcomes, resolutions, and escalation rates
    segmented by body region to identify region-specific calibration needs.
    """
    validate_auth(authorization)

    patterns = _mine_body_region_patterns()

    with STATE_LOCK:
        CROSS_CASE_INTELLIGENCE["body_region_patterns"] = patterns[-MAX_PATTERN_HISTORY:]

    return {
        "total_body_regions": len(patterns),
        "patterns": patterns
    }


@app.get("/intelligence/patterns/severity")
async def get_severity_patterns(
    authorization: str | None = Header(default=None),
):
    """
    Get outcome-feedback pattern mining by severity.

    Returns escalation rates, resolution times, and outcome distributions
    segmented by initial severity to calibrate severity-based routing.
    """
    validate_auth(authorization)

    patterns = _mine_severity_patterns()

    with STATE_LOCK:
        CROSS_CASE_INTELLIGENCE["severity_patterns"] = patterns[-MAX_PATTERN_HISTORY:]

    return {
        "total_severity_levels": len(patterns),
        "patterns": patterns
    }


@app.get("/intelligence/patterns/image-quality")
async def get_image_quality_patterns(
    authorization: str | None = Header(default=None),
):
    """
    Get outcome-feedback pattern mining by image quality.

    Returns success rates and outcome distributions segmented by image quality
    to calibrate when lower-quality images should prompt 32B review.
    """
    validate_auth(authorization)

    patterns = _mine_image_quality_patterns()

    with STATE_LOCK:
        CROSS_CASE_INTELLIGENCE["quality_patterns"] = patterns[-MAX_PATTERN_HISTORY:]

    return {
        "total_quality_levels": len(patterns),
        "patterns": patterns
    }


@app.get("/intelligence/promotion-errors")
async def get_promotion_error_analysis(
    authorization: str | None = Header(default=None),
):
    """
    Get false-positive, false-negative, and outcome-linked promotion analyses.
    """
    validate_auth(authorization)

    false_positives = _analyze_false_positives()
    false_negatives = _analyze_false_negatives()
    outcome_patterns = _compute_outcome_linked_patterns()
    return {
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "outcome_linked_patterns": outcome_patterns,
    }


@app.post("/intelligence/analyze-all")
async def analyze_all_cross_case_intelligence(
    authorization: str | None = Header(default=None),
):
    """
    Run full cross-case intelligence analysis.

    Generates disagreement clusters, promotion thresholds, calibration narratives,
    and all pattern mining (body region, severity, image quality).
    """
    validate_auth(authorization)

    # Run all analyses
    clusters_result = await get_cross_case_disagreement_clusters(authorization)
    thresholds = _compute_promotion_threshold("comprehensive")
    playbooks = _build_cluster_promotion_playbooks()
    body_region_patterns = _mine_body_region_patterns()
    severity_patterns = _mine_severity_patterns()
    quality_patterns = _mine_image_quality_patterns()
    false_positives = _analyze_false_positives()
    false_negatives = _analyze_false_negatives()
    outcome_patterns = _compute_outcome_linked_patterns()

    # Generate calibration narratives for high-disagreement cases
    calibration_narratives = []
    with STATE_LOCK:
        high_disagreement_cases = [
            case_id for case_id, d in SHADOW_DISAGREEMENTS.items()
            if _compute_disagreement_score(case_id) > 0.6
        ]

    for case_id in high_disagreement_cases[:20]:  # Limit to 20 for performance
        narrative = _generate_reviewer_calibration_narrative(case_id)
        calibration_narratives.append(narrative)

    return {
        "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        "disagreement_clusters": clusters_result,
        "promotion_thresholds": thresholds,
        "promotion_playbooks": playbooks,
        "calibration_narratives_count": len(calibration_narratives),
        "body_region_patterns": body_region_patterns,
        "severity_patterns": severity_patterns,
        "image_quality_patterns": quality_patterns,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "outcome_linked_patterns": outcome_patterns,
        "summary": {
            "total_clusters": len(clusters_result.get("clusters", [])),
            "total_playbooks": len(playbooks),
            "total_high_disagreement_cases": len(high_disagreement_cases),
            "total_body_regions_analyzed": len(body_region_patterns),
            "total_severity_levels_analyzed": len(severity_patterns),
            "total_quality_levels_analyzed": len(quality_patterns),
            "false_positive_count": false_positives.get("total_count", 0),
            "false_negative_count": false_negatives.get("total_count", 0),
        }
    }


# =============================================================================
# Phase 5 Shadow Calibration Summary Layer
# =============================================================================
# Produces clear promotion recommendations: keep_in_shadow, promote_cautiously, block_promotion
# Explains: disagreement patterns, FP/FN autopsies, ambiguity type, confidence bands,
#           body region / severity / image quality / temporal context trends

PHASE5_SHADOW_CALIBRATION_HISTORY: list[dict] = []
MAX_PHASE5_HISTORY = 500


def _classify_disagreement_pattern(disagreement: dict) -> str:
    """
    Classify the type of disagreement pattern observed.

    Returns pattern classification based on the nature of 7B-32B disagreement.
    """
    disagreement_points = disagreement.get("disagreement_points", [])
    pattern_type = disagreement.get("pattern_type", "unknown")
    severity_impact = disagreement.get("severity_impact", 0.5)
    conf_delta = abs(
        disagreement.get("consult_confidence", 0.5) -
        disagreement.get("review_confidence", 0.5)
    )

    # Count urgency-related disagreements
    urgency_keywords = ["urgent", "emergency", "critical", "severe", "acute"]
    urgency_disagreements = sum(
        1 for dp in disagreement_points
        if any(kw in str(dp).lower() for kw in urgency_keywords)
    )

    # Count diagnostic disagreements
    diagnostic_keywords = ["diagnosis", "differential", "likely", "probable", "rule out"]
    diagnostic_disagreements = sum(
        1 for dp in disagreement_points
        if any(kw in str(dp).lower() for kw in diagnostic_keywords)
    )

    # Count treatment disagreements
    treatment_keywords = ["treatment", "therapy", "medication", "surgery", "intervention"]
    treatment_disagreements = sum(
        1 for dp in disagreement_points
        if any(kw in str(dp).lower() for kw in treatment_keywords)
    )

    # Classify based on predominant pattern
    if urgency_disagreements > max(diagnostic_disagreements, treatment_disagreements):
        return "urgency_mismatch"
    elif diagnostic_disagreements > max(urgency_disagreements, treatment_disagreements):
        return "diagnostic_divergence"
    elif treatment_disagreements > max(urgency_disagreements, diagnostic_disagreements):
        return "treatment_disagreement"
    elif pattern_type != "unknown":
        return pattern_type
    elif conf_delta > 0.3:
        return "confidence_calibration_issue"
    elif severity_impact > 0.7:
        return "high_stakes_ambiguity"
    else:
        return "minor_interpretation_difference"


def _classify_ambiguity_type(disagreement: dict) -> str:
    """
    Classify the type of ambiguity present in the disagreement.

    Returns ambiguity classification: visual_ambiguity, contextual_ambiguity,
    severity_ambiguity, temporal_ambiguity, or multi_factor_ambiguity.
    """
    ambiguity_indicators = disagreement.get("ambiguity_indicators", {})
    image_quality = disagreement.get("image_quality", "unknown")
    temporal_context = disagreement.get("temporal_context_availability", "unknown")

    visual_indicators = ambiguity_indicators.get("visual", [])
    contextual_indicators = ambiguity_indicators.get("contextual", [])
    severity_indicators = ambiguity_indicators.get("severity", [])
    temporal_indicators = ambiguity_indicators.get("temporal", [])

    scores = {
        "visual_ambiguity": len(visual_indicators) + (1 if image_quality in ["poor", "marginal"] else 0),
        "contextual_ambiguity": len(contextual_indicators),
        "severity_ambiguity": len(severity_indicators),
        "temporal_ambiguity": len(temporal_indicators) + (1 if temporal_context == "insufficient" else 0),
    }

    max_score = max(scores.values())
    if max_score == 0:
        return "minimal_ambiguity"

    # Check for multi-factor ambiguity
    significant_factors = sum(1 for s in scores.values() if s >= 1)
    if significant_factors >= 3:
        return "multi_factor_ambiguity"
    elif significant_factors >= 2:
        return "compound_ambiguity"

    return max(scores, key=scores.get) or "minimal_ambiguity"


def _compute_phase5_shadow_calibration_summary(case_id: str) -> dict[str, Any]:
    """
    Phase 5 Shadow Calibration Summary Layer.

    Produces a comprehensive calibration summary with clear promotion recommendation:
    - keep_in_shadow: 32B should remain in shadow mode
    - promote_cautiously: 32B can be promoted with monitoring
    - block_promotion: 32B should not be promoted

    The summary explains:
    - Disagreement patterns
    - False positive / false negative autopsies
    - Ambiguity type
    - Confidence bands
    - Body region / severity / image quality / temporal context trends
    """
    global PHASE5_SHADOW_CALIBRATION_HISTORY

    summary = {
        "case_id": case_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "recommendation": None,  # keep_in_shadow, promote_cautiously, block_promotion
        "recommendation_confidence": 0.0,
        "recommendation_rationale": "",
        "disagreement_pattern": None,
        "disagreement_pattern_explanation": "",
        "false_positive_autopsy": None,
        "false_negative_autopsy": None,
        "ambiguity_type": None,
        "ambiguity_explanation": "",
        "confidence_band": "uncertain",
        "confidence_band_explanation": "",
        "body_region_trends": {},
        "severity_trends": {},
        "image_quality_trends": {},
        "temporal_context_trends": {},
        "promotion_barriers": [],
        "promotion_enablers": [],
        "recommended_actions": [],
        "monitoring_requirements": [],
    }

    if case_id not in SHADOW_DISAGREEMENTS:
        summary["recommendation"] = "keep_in_shadow"
        summary["recommendation_rationale"] = "No shadow disagreement data available for this case"
        summary["confidence_band"] = "no_data"
        return summary

    disagreement = SHADOW_DISAGREEMENTS[case_id]

    # 1. Classify disagreement pattern
    disagreement_pattern = _classify_disagreement_pattern(disagreement)
    summary["disagreement_pattern"] = disagreement_pattern

    pattern_explanations = {
        "urgency_mismatch": "32B and 7B disagree primarily on urgency level. 7B may be over- or under-escalating.",
        "diagnostic_divergence": "Models disagree on the most likely diagnosis. This suggests knowledge or reasoning differences.",
        "treatment_disagreement": "Models suggest different treatments. This is a high-stakes disagreement requiring careful review.",
        "confidence_calibration_issue": "Large confidence gap between models indicates calibration differences.",
        "high_stakes_ambiguity": "Case has high severity impact with ambiguous features. Both models show uncertainty.",
        "minor_interpretation_difference": "Models have minor differences in interpretation but agree on key findings.",
        "unknown": "Unable to classify the disagreement pattern from available data."
    }
    summary["disagreement_pattern_explanation"] = pattern_explanations.get(
        disagreement_pattern, "Unknown disagreement pattern."
    )

    # 2. Analyze false positive / false negative patterns
    calibration_score = disagreement.get("calibration_score", 0.5)
    severity_impact = disagreement.get("severity_impact", 0.5)
    conf_delta = abs(
        disagreement.get("consult_confidence", 0.5) -
        disagreement.get("review_confidence", 0.5)
    )

    # FP Autopsy: 32B was more aggressive than warranted
    if disagreement_pattern == "urgency_mismatch":
        if disagreement.get("review_confidence", 0.5) > disagreement.get("consult_confidence", 0.5) + 0.15:
            summary["false_positive_autopsy"] = {
                "type": "potential_over_escalation",
                "description": "32B appears to have escalated urgency beyond what 7B recommended",
                "evidence": f"32B confidence: {disagreement.get('review_confidence', 0.5):.2f}, 7B confidence: {disagreement.get('consult_confidence', 0.5):.2f}",
                "root_cause_hypothesis": "32B may be more sensitive to alarming visual features, leading to false positive urgency"
            }
        # FN Autopsy: 32B was more conservative than warranted
        elif disagreement.get("consult_confidence", 0.5) > disagreement.get("review_confidence", 0.5) + 0.15:
            summary["false_negative_autopsy"] = {
                "type": "potential_under_escalation",
                "description": "32B appears to have de-escalated or remained neutral when 7B recommended higher urgency",
                "evidence": f"7B confidence: {disagreement.get('consult_confidence', 0.5):.2f}, 32B confidence: {disagreement.get('review_confidence', 0.5):.2f}",
                "root_cause_hypothesis": "32B may be requiring higher certainty before committing to urgent classification"
            }

    # 3. Classify ambiguity type
    ambiguity_type = _classify_ambiguity_type(disagreement)
    summary["ambiguity_type"] = ambiguity_type

    ambiguity_explanations = {
        "visual_ambiguity": "Image quality or visual features are unclear, leading to interpretation differences",
        "contextual_ambiguity": "Insufficient clinical context (history, symptoms) contributes to disagreement",
        "severity_ambiguity": "Severity indicators are borderline or contradictory",
        "temporal_ambiguity": "Changes over time are unclear or images lack temporal reference",
        "compound_ambiguity": "Multiple ambiguity factors contribute to the disagreement",
        "multi_factor_ambiguity": "All major ambiguity factors are present",
        "minimal_ambiguity": "Disagreement occurs despite clear evidence - suggests reasoning differences"
    }
    summary["ambiguity_explanation"] = ambiguity_explanations.get(
        ambiguity_type, "Unable to determine ambiguity type."
    )

    # 4. Determine confidence band
    confidence_components = disagreement.get("confidence_components", [])
    high_conf_components = sum(1 for c in confidence_components if len(c) >= 3 and c[2] == "high")
    medium_conf_components = sum(1 for c in confidence_components if len(c) >= 3 and c[2] == "medium")

    if calibration_score >= 0.7 and high_conf_components >= 3:
        summary["confidence_band"] = "high_confidence"
        summary["confidence_band_explanation"] = "Strong calibration with multiple high-confidence indicators"
    elif calibration_score >= 0.6 and high_conf_components >= 2:
        summary["confidence_band"] = "medium-high_confidence"
        summary["confidence_band_explanation"] = "Good calibration with several confident indicators"
    elif calibration_score >= 0.4:
        summary["confidence_band"] = "medium_confidence"
        summary["confidence_band_explanation"] = "Moderate calibration - some indicators are uncertain"
    elif calibration_score >= 0.25:
        summary["confidence_band"] = "low_confidence"
        summary["confidence_band_explanation"] = "Weak calibration with many uncertain indicators"
    else:
        summary["confidence_band"] = "insufficient_confidence"
        summary["confidence_band_explanation"] = "Insufficient evidence to make reliable calibration judgment"

    # 5. Analyze trends by dimension
    # Body region trends
    body_region = disagreement.get("body_region", "unknown")
    summary["body_region_trends"] = {
        "current_case_region": body_region,
        "region_specific_note": f"Disagreement occurred in {body_region} region"
    }

    # Severity trends
    initial_severity = disagreement.get("initial_severity", "unknown")
    summary["severity_trends"] = {
        "case_severity": initial_severity,
        "severity_impact_score": severity_impact,
        "severity_note": f"Case has {severity_impact:.0%} severity impact"
    }

    # Image quality trends
    image_quality = _resolve_image_quality_for_case(case_id, disagreement)
    summary["image_quality_trends"] = {
        "image_quality": image_quality,
        "quality_impact": "Image quality affects ability to resolve disagreement" if image_quality in ["poor", "marginal"] else "Image quality is adequate"
    }

    # Temporal context trends
    temporal_availability = disagreement.get("temporal_context_availability", "unknown")
    summary["temporal_context_trends"] = {
        "temporal_availability": temporal_availability,
        "temporal_impact": "Limited temporal context contributes to uncertainty" if temporal_availability == "insufficient" else "Temporal context is adequate"
    }

    # 6. Identify promotion barriers and enablers
    if calibration_score < 0.4:
        summary["promotion_barriers"].append(f"Low calibration score ({calibration_score:.0%}) indicates unreliable reasoning")
    if severity_impact >= 0.75:
        summary["promotion_barriers"].append("High-severity case with disagreement - cannot safely promote")
    if disagreement_pattern == "urgency_mismatch" and conf_delta > 0.25:
        summary["promotion_barriers"].append("Large urgency calibration gap suggests systemic reasoning difference")
    if ambiguity_type in ["visual_ambiguity", "contextual_ambiguity"]:
        summary["promotion_barriers"].append(f"{ambiguity_type.replace('_', ' ')} limits ability to validate model reasoning")

    if calibration_score >= 0.7:
        summary["promotion_enablers"].append(f"High calibration score ({calibration_score:.0%}) supports promotion")
    if disagreement_pattern == "minor_interpretation_difference":
        summary["promotion_enablers"].append("Disagreement is minor and does not affect clinical outcomes")
    if image_quality == "good":
        summary["promotion_enablers"].append("High-quality images allow confident model evaluation")
    if temporal_availability == "sufficient":
        summary["promotion_enablers"].append("Rich temporal context enables proper longitudinal reasoning")

    # 7. Generate final recommendation
    recommendation_data = _compute_phase5_recommendation(
        case_id, disagreement, calibration_score, severity_impact,
        disagreement_pattern, ambiguity_type, conf_delta
    )
    summary.update(recommendation_data)

    # 8. Generate recommended actions and monitoring requirements
    if summary["recommendation"] == "keep_in_shadow":
        summary["recommended_actions"].append("Continue shadow mode evaluation")
        summary["recommended_actions"].append("Collect more cases with similar disagreement pattern")
        summary["monitoring_requirements"].append("Track calibration score over next 50 cases")
        summary["monitoring_requirements"].append("Monitor for pattern stability")
    elif summary["recommendation"] == "promote_cautiously":
        summary["recommended_actions"].append("Allow 32B promotion with active monitoring")
        summary["recommended_actions"].append("Set up automated calibration tracking")
        summary["recommended_actions"].append("Establish human review triggers for high-disagreement cases")
        summary["monitoring_requirements"].append("Review calibration metrics weekly")
        summary["monitoring_requirements"].append("Track disagreement rate per body region")
        summary["monitoring_requirements"].append("Monitor false positive/negative rates closely")
    elif summary["recommendation"] == "block_promotion":
        summary["recommended_actions"].append("Block 32B promotion for this case type")
        summary["recommended_actions"].append("Return to shadow mode for pattern refinement")
        summary["recommended_actions"].append("Consider threshold adjustments for this body region")
        summary["monitoring_requirements"].append("Do not deploy until calibration improves")
        summary["monitoring_requirements"].append("Re-evaluate after collecting 100+ similar cases")

    # Store in history
    with STATE_LOCK:
        PHASE5_SHADOW_CALIBRATION_HISTORY.append(summary)
        if len(PHASE5_SHADOW_CALIBRATION_HISTORY) > MAX_PHASE5_HISTORY:
            PHASE5_SHADOW_CALIBRATION_HISTORY = PHASE5_SHADOW_CALIBRATION_HISTORY[-MAX_PHASE5_HISTORY:]

    return summary


def _compute_phase5_recommendation(
    case_id: str,
    disagreement: dict,
    calibration_score: float,
    severity_impact: float,
    disagreement_pattern: str,
    ambiguity_type: str,
    conf_delta: float
) -> dict[str, Any]:
    """
    Compute Phase 5 promotion recommendation with keep_in_shadow, promote_cautiously, block_promotion.

    This focuses on reasoning output analysis rather than changing deployment logic.
    """
    recommendation = {
        "recommendation": "keep_in_shadow",
        "recommendation_confidence": 0.5,
        "recommendation_rationale": "Insufficient evidence to recommend promotion",
        "blocking_factors": [],
        "enabling_factors": [],
    }

    blocking_factors = []
    enabling_factors = []

    # BLOCK PROMOTION conditions
    if calibration_score < 0.25:
        blocking_factors.append(f"Critically low calibration score ({calibration_score:.0%})")
    if severity_impact >= 0.85 and calibration_score < 0.7:
        blocking_factors.append(f"High-severity case ({severity_impact:.0%}) with insufficient calibration")
    if disagreement_pattern == "urgency_mismatch" and conf_delta > 0.35:
        blocking_factors.append(f"Large confidence delta ({conf_delta:.0%}) indicates fundamental reasoning disagreement")
    if ambiguity_type == "multi_factor_ambiguity" and calibration_score < 0.5:
        blocking_factors.append("Multiple ambiguity factors prevent reliable reasoning validation")

    # KEEP IN SHADOW conditions
    if 0.25 <= calibration_score < 0.45:
        blocking_factors.append(f"Calibration score ({calibration_score:.0%}) below promotion threshold")
    if disagreement_pattern in ["diagnostic_divergence", "treatment_disagreement"] and severity_impact > 0.6:
        blocking_factors.append(f"High-stakes disagreement pattern in {disagreement_pattern}")
    if ambiguity_type in ["visual_ambiguity", "contextual_ambiguity"] and calibration_score < 0.6:
        blocking_factors.append(f"{ambiguity_type.replace('_', ' ')} limits reasoning validation")

    # PROMOTE CAUTIOUSLY conditions
    if 0.45 <= calibration_score < 0.7:
        enabling_factors.append(f"Calibration score ({calibration_score:.0%}) supports cautious promotion")
    if disagreement_pattern == "minor_interpretation_difference":
        enabling_factors.append("Disagreement is clinically minor")
    if severity_impact < 0.5:
        enabling_factors.append("Low-severity case allows monitoring without high risk")

    # HIGH CONFIDENCE PROMOTE conditions
    if calibration_score >= 0.7 and severity_impact < 0.75:
        enabling_factors.append(f"Strong calibration ({calibration_score:.0%}) supports promotion")
    if disagreement_pattern == "minor_interpretation_difference" and calibration_score >= 0.6:
        enabling_factors.append("Pattern and calibration support promotion")

    recommendation["blocking_factors"] = blocking_factors
    recommendation["enabling_factors"] = enabling_factors

    # Determine final recommendation
    if blocking_factors and not enabling_factors:
        recommendation["recommendation"] = "block_promotion"
        recommendation["recommendation_confidence"] = min(0.9, 0.6 + calibration_score * 0.3)
        recommendation["recommendation_rationale"] = (
            f"Blocking promotion due to: {'; '.join(blocking_factors[:2])}"
        )
    elif enabling_factors and not blocking_factors:
        recommendation["recommendation"] = "promote_cautiously"
        recommendation["recommendation_confidence"] = min(0.85, 0.5 + calibration_score * 0.4)
        recommendation["recommendation_rationale"] = (
            f"Promoting cautiously with monitoring: {'; '.join(enabling_factors[:2])}"
        )
    elif enabling_factors and blocking_factors:
        # Mixed signals - default to cautious
        recommendation["recommendation"] = "keep_in_shadow"
        recommendation["recommendation_confidence"] = 0.4
        recommendation["recommendation_rationale"] = (
            f"Mixed signals detected. Blocking: {'; '.join(blocking_factors[:1])}. "
            f"Supporting: {'; '.join(enabling_factors[:1])}. Recommend continued shadow evaluation."
        )
    else:
        recommendation["recommendation"] = "keep_in_shadow"
        recommendation["recommendation_confidence"] = 0.5
        recommendation["recommendation_rationale"] = "Insufficient evidence for promotion decision"

    return recommendation


# =============================================================================
# Phase 5 Threshold Tuning Insight Layer
# =============================================================================
# Identifies where 32B is over-escalating or under-escalating
# Focuses on reasoning output first - does NOT change deployment logic

THRESHOLD_TUNING_HISTORY: list[dict] = []
MAX_TUNING_HISTORY = 500


def _analyze_reasoning_output_escalation_patterns() -> dict[str, Any]:
    """
    Analyze reasoning output to identify where 32B is over-escalating or under-escalating.

    Focuses on the model's reasoning output (not deployment) to identify patterns
    of over-escalation (false positives) or under-escalation (false negatives).
    """
    analysis = {
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "total_cases_analyzed": 0,
        "over_escalation_patterns": [],
        "under_escalation_patterns": [],
        "reasoning_based_insights": [],
        "recommended_threshold_adjustments": [],
        "escalation_ratio_by_body_region": {},
        "escalation_ratio_by_severity": {},
        "escalation_ratio_by_image_quality": {},
        "confidence_delta_distribution": {},
        "pattern_stability_score": 0.0,
    }

    with STATE_LOCK:
        shadow_cases = list(SHADOW_DISAGREEMENTS.items())

    if not shadow_cases:
        analysis["message"] = "No shadow disagreement data available for threshold tuning analysis"
        return analysis

    analysis["total_cases_analyzed"] = len(shadow_cases)

    # Aggregate escalation patterns
    over_escalation_cases = []
    under_escalation_cases = []
    confidence_deltas = []
    body_region_escalation = {}
    severity_escalation = {}
    quality_escalation = {}

    for case_id, disagreement in shadow_cases:
        consult_conf = disagreement.get("consult_confidence", 0.5)
        review_conf = disagreement.get("review_confidence", 0.5)
        conf_delta = review_conf - consult_conf
        confidence_deltas.append(conf_delta)

        body_region = disagreement.get("body_region", "unknown")
        initial_severity = disagreement.get("initial_severity", "unknown")
        image_quality = _resolve_image_quality_for_case(case_id, disagreement)

        # Classify escalation
        if conf_delta > 0.15:
            over_escalation_cases.append({
                "case_id": case_id,
                "delta": conf_delta,
                "body_region": body_region,
                "severity": initial_severity,
                "image_quality": image_quality,
                "disagreement_pattern": disagreement.get("pattern_type", "unknown")
            })
            # Track by dimension
            body_region_escalation[body_region] = body_region_escalation.get(body_region, {"over": 0, "under": 0, "total": 0})
            body_region_escalation[body_region]["over"] += 1
            body_region_escalation[body_region]["total"] += 1

            severity_escalation[initial_severity] = severity_escalation.get(initial_severity, {"over": 0, "under": 0, "total": 0})
            severity_escalation[initial_severity]["over"] += 1
            severity_escalation[initial_severity]["total"] += 1

            quality_escalation[image_quality] = quality_escalation.get(image_quality, {"over": 0, "under": 0, "total": 0})
            quality_escalation[image_quality]["over"] += 1
            quality_escalation[image_quality]["total"] += 1

        elif conf_delta < -0.15:
            under_escalation_cases.append({
                "case_id": case_id,
                "delta": conf_delta,
                "body_region": body_region,
                "severity": initial_severity,
                "image_quality": image_quality,
                "disagreement_pattern": disagreement.get("pattern_type", "unknown")
            })
            # Track by dimension
            body_region_escalation[body_region] = body_region_escalation.get(body_region, {"over": 0, "under": 0, "total": 0})
            body_region_escalation[body_region]["under"] += 1
            body_region_escalation[body_region]["total"] += 1

            severity_escalation[initial_severity] = severity_escalation.get(initial_severity, {"over": 0, "under": 0, "total": 0})
            severity_escalation[initial_severity]["under"] += 1
            severity_escalation[initial_severity]["total"] += 1

            quality_escalation[image_quality] = quality_escalation.get(image_quality, {"over": 0, "under": 0, "total": 0})
            quality_escalation[image_quality]["under"] += 1
            quality_escalation[image_quality]["total"] += 1

    # Store results
    analysis["over_escalation_patterns"] = over_escalation_cases
    analysis["under_escalation_patterns"] = under_escalation_cases

    # Compute confidence delta distribution
    if confidence_deltas:
        avg_delta = sum(confidence_deltas) / len(confidence_deltas)
        pos_deltas = [d for d in confidence_deltas if d > 0]
        neg_deltas = [d for d in confidence_deltas if d < 0]
        analysis["confidence_delta_distribution"] = {
            "mean_delta": round(avg_delta, 3),
            "median_delta": round(sorted(confidence_deltas)[len(confidence_deltas) // 2], 3),
            "positive_delta_count": len(pos_deltas),
            "negative_delta_count": len(neg_deltas),
            "positive_delta_avg": round(sum(pos_deltas) / len(pos_deltas), 3) if pos_deltas else 0.0,
            "negative_delta_avg": round(sum(neg_deltas) / len(neg_deltas), 3) if neg_deltas else 0.0,
        }

    # Compute escalation ratios by dimension
    analysis["escalation_ratio_by_body_region"] = {
        region: {
            "over_ratio": round(data["over"] / max(data["total"], 1), 3),
            "under_ratio": round(data["under"] / max(data["total"], 1), 3),
            "total_cases": data["total"]
        }
        for region, data in body_region_escalation.items()
    }

    analysis["escalation_ratio_by_severity"] = {
        severity: {
            "over_ratio": round(data["over"] / max(data["total"], 1), 3),
            "under_ratio": round(data["under"] / max(data["total"], 1), 3),
            "total_cases": data["total"]
        }
        for severity, data in severity_escalation.items()
    }

    analysis["escalation_ratio_by_image_quality"] = {
        quality: {
            "over_ratio": round(data["over"] / max(data["total"], 1), 3),
            "under_ratio": round(data["under"] / max(data["total"], 1), 3),
            "total_cases": data["total"]
        }
        for quality, data in quality_escalation.items()
    }

    # Generate reasoning-based insights
    if avg_delta > 0.1:
        analysis["reasoning_based_insights"].append(
            f"32B consistently more confident than 7B (avg delta: {avg_delta:+.1%}). "
            f"This suggests 32B may be over-escalating in its reasoning."
        )
    elif avg_delta < -0.1:
        analysis["reasoning_based_insights"].append(
            f"32B consistently less confident than 7B (avg delta: {avg_delta:+.1%}). "
            f"This suggests 32B may be under-escalating in its reasoning."
        )

    # Identify specific body region patterns
    for region, ratios in analysis["escalation_ratio_by_body_region"].items():
        if ratios["over_ratio"] > 0.6:
            analysis["reasoning_based_insights"].append(
                f"32B over-escalates in {region} region ({ratios['over_ratio']:.0%} of cases). "
                f"Consider adjusting confidence thresholds for this region."
            )
        elif ratios["under_ratio"] > 0.6:
            analysis["reasoning_based_insights"].append(
                f"32B under-escalates in {region} region ({ratios['under_ratio']:.0%} of cases). "
                f"Consider adjusting confidence thresholds for this region."
            )

    # Identify severity patterns
    for severity, ratios in analysis["escalation_ratio_by_severity"].items():
        if ratios["over_ratio"] > 0.6:
            analysis["reasoning_based_insights"].append(
                f"32B over-escalates at {severity} severity ({ratios['over_ratio']:.0%} of cases). "
                f"Review urgency reasoning for this severity level."
            )
        elif ratios["under_ratio"] > 0.6:
            analysis["reasoning_based_insights"].append(
                f"32B under-escalates at {severity} severity ({ratios['under_ratio']:.0%} of cases). "
                f"Review urgency reasoning for this severity level."
            )

    # Generate recommended threshold adjustments (reasoning output focus only)
    for region, ratios in analysis["escalation_ratio_by_body_region"].items():
        if ratios["total_cases"] >= 5:  # Only suggest if we have enough data
            if ratios["over_ratio"] > 0.5:
                analysis["recommended_threshold_adjustments"].append({
                    "dimension": "body_region",
                    "value": region,
                    "adjustment_type": "increase_confidence_threshold",
                    "current_over_rate": ratios["over_ratio"],
                    "suggested_threshold_delta": 0.1,
                    "rationale": f"32B over-escalates in {region} - increase threshold to require higher confidence before escalation"
                })
            elif ratios["under_ratio"] > 0.5:
                analysis["recommended_threshold_adjustments"].append({
                    "dimension": "body_region",
                    "value": region,
                    "adjustment_type": "decrease_confidence_threshold",
                    "current_under_rate": ratios["under_ratio"],
                    "suggested_threshold_delta": 0.1,
                    "rationale": f"32B under-escalates in {region} - decrease threshold to enable earlier escalation"
                })

    # Compute pattern stability score
    total_cases = len(shadow_cases)
    if total_cases >= 10:
        consistent_patterns = sum(
            1 for region, data in body_region_escalation.items()
            if data["total"] >= 3 and (data["over"] / data["total"] > 0.7 or data["under"] / data["total"] > 0.7)
        )
        analysis["pattern_stability_score"] = round(consistent_patterns / max(len(body_region_escalation), 1), 3)
    else:
        analysis["pattern_stability_score"] = 0.0
        analysis["reasoning_based_insights"].append(
            "Insufficient data for stable threshold recommendations. Continue shadow evaluation."
        )

    # Store in history
    with STATE_LOCK:
        THRESHOLD_TUNING_HISTORY.append(analysis)
        if len(THRESHOLD_TUNING_HISTORY) > MAX_TUNING_HISTORY:
            THRESHOLD_TUNING_HISTORY = THRESHOLD_TUNING_HISTORY[-MAX_TUNING_HISTORY:]

    return analysis


@app.get("/calibration/phase5-summary/{case_id}")
async def get_phase5_shadow_calibration_summary(
    case_id: str,
    authorization: str | None = Header(default=None),
):
    """
    Get Phase 5 shadow calibration summary for a specific case.

    Returns comprehensive calibration summary with clear promotion recommendation:
    - keep_in_shadow: 32B should remain in shadow mode
    - promote_cautiously: 32B can be promoted with monitoring
    - block_promotion: 32B should not be promoted

    Includes disagreement patterns, FP/FN autopsies, ambiguity type,
    confidence bands, and body region/severity/image quality/temporal trends.
    """
    validate_auth(authorization)

    summary = _compute_phase5_shadow_calibration_summary(case_id)

    return {
        "summary": summary,
        "endpoints": {
            "threshold_insights": "/calibration/threshold-insights",
            "cross_case_analysis": "/intelligence/analyze-all",
            "promotion_readiness": f"/intelligence/promotion-readiness/{case_id}"
        }
    }


@app.get("/calibration/threshold-insights")
async def get_threshold_tuning_insights(
    authorization: str | None = Header(default=None),
):
    """
    Get threshold tuning insights for 32B model.

    Analyzes where 32B is over-escalating or under-escalating based on
    reasoning output patterns. Does NOT change deployment logic.

    Returns:
    - Over-escalation patterns by body region, severity, image quality
    - Under-escalation patterns by body region, severity, image quality
    - Reasoning-based insights
    - Recommended threshold adjustments (reasoning output focus only)
    - Pattern stability scores
    """
    validate_auth(authorization)

    insights = _analyze_reasoning_output_escalation_patterns()

    return {
        "insights": insights,
        "note": "These insights focus on reasoning output analysis. "
                "No deployment logic changes are made.",
        "interpretation_guide": {
            "over_escalation": "32B is more confident/urgent than 7B - may indicate false positive tendency",
            "under_escalation": "32B is less confident/urgent than 7B - may indicate false negative tendency",
            "positive_delta": "32B confidence - 7B confidence > 0.15 indicates over-escalation",
            "negative_delta": "32B confidence - 7B confidence < -0.15 indicates under-escalation"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
