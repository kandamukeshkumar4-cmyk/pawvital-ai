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
    
    Returns comprehensive calibration assessment with reasoning, confidence bands, concrete recommendations,
    and policy explanations detailing why thresholds were crossed, what evidence dominated, and when
    confidence should be discounted.
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
        "policy_explanation": ""
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
    
    return narrative


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
                    f"avg_score={avg_score:.2f} from {cluster.get('count')} cases → promote to 32B"
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
                    f"[REGION] {region}: escalation_rate={escalation_rate:.1%} → "
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
                f"[SEVERITY] High-severity escalation rate: {high_severity_escalation:.1%} → "
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
                    f"[PATTERN] {pattern_type}: escalation_rate={data['escalation_rate']:.1%} → "
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
                f"{confidence_delta_thresholds['escalation_rate']:.1%} → "
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
