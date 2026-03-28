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
from threading import Lock
from typing import Any, Optional
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Header, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from PIL import Image
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
from qwen_vl_utils import process_vision_info


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
PROCESSING_QUEUE: list[str] = []
STATE_LOCK = Lock()

MAX_CALLBACK_RETRIES = int(os.environ.get("MAX_CALLBACK_RETRIES", "3"))
CALLBACK_RETRY_DELAY_SECONDS = float(os.environ.get("CALLBACK_RETRY_DELAY_SECONDS", "5.0"))

# Shadow disagreement tracking (for comparing 7B consult vs 32B review)
SHADOW_DISAGREEMENTS: dict[str, dict] = {}
MAX_SHADOW_HISTORY = int(os.environ.get("MAX_SHADOW_HISTORY", "1000"))

# Outcome feedback storage (for learning/improvement)
OUTCOME_FEEDBACK: list[dict] = []
MAX_FEEDBACK_HISTORY = 1000


# =============================================================================
# Global model instances (lazy loaded)
# =============================================================================

MODEL_NAME = "Qwen/Qwen2.5-VL-32B-Instruct"
MODEL = None
PROCESSOR = None
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
STUB_MODE = os.environ.get("STUB_MODE", "false").strip().lower() == "true"
EXPECTED_API_KEY = os.environ.get("SIDECAR_API_KEY", "").strip()
logger = logging.getLogger("async-review-service")


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
    try:
        result = await generate_review(request, case_id)
        with STATE_LOCK:
            REVIEW_RESULTS[case_id] = result
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
            await _robust_callback(case_id, request.callback_url, result)
                
    except Exception as e:
        logger.error("Processing error for case %s", case_id, exc_info=e)
        with STATE_LOCK:
            if case_id in PROCESSING_QUEUE:
                PROCESSING_QUEUE.remove(case_id)


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
                    logger.warning(
                        "Callback returned %d for case %s, attempt %d/%d",
                        response.status_code, case_id, attempt + 1, MAX_CALLBACK_RETRIES
                    )
        except httpx.TimeoutException:
            logger.warning(
                "Callback timeout for case %s, attempt %d/%d",
                case_id, attempt + 1, MAX_CALLBACK_RETRIES
            )
        except httpx.ConnectError as e:
            logger.warning(
                "Callback connection error for case %s: %s, attempt %d/%d",
                case_id, e, attempt + 1, MAX_CALLBACK_RETRIES
            )
        except Exception as e:
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
        "consult_confidence": consult_opinion.get("confidence", 0.5),
        "review_confidence": review_result.confidence,
        "agreement_overlap": [],
        "disagreement_points": [],
        "uncertainty_divergence": [],
        "confidence_delta": abs(
            consult_opinion.get("confidence", 0.5) - review_result.confidence
        ),
        "semantic_matches": [],  # Enhanced: track semantic similarity matches
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
        if len(OUTCOME_FEEDBACK) > MAX_FEEDBACK_HISTORY:
            OUTCOME_FEEDBACK = OUTCOME_FEEDBACK[-MAX_FEEDBACK_HISTORY:]
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
        if len(OUTCOME_FEEDBACK) > MAX_FEEDBACK_HISTORY:
            OUTCOME_FEEDBACK = OUTCOME_FEEDBACK[-MAX_FEEDBACK_HISTORY:]
        total_feedback_entries = len(OUTCOME_FEEDBACK)
    
    logger.info("Recorded manual outcome feedback for case %s", feedback_data["case_id"])
    
    return JSONResponse({
        "ok": True,
        "case_id": feedback_data["case_id"],
        "total_feedback_entries": total_feedback_entries,
    })


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


@app.delete("/reviews/{case_id}")
async def delete_review(case_id: str):
    """Delete a stored review result."""
    with STATE_LOCK:
        if case_id in REVIEW_RESULTS:
            del REVIEW_RESULTS[case_id]
            SHADOW_DISAGREEMENTS.pop(case_id, None)
            return {"ok": True, "message": f"Review {case_id} deleted"}

        if case_id in PROCESSING_QUEUE:
            PROCESSING_QUEUE.remove(case_id)
            return {"ok": True, "message": f"Queued review {case_id} cancelled"}
    
    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
