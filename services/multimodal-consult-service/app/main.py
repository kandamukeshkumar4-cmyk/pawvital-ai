"""
Multimodal Consult Service - Qwen2.5-VL-7B-Instruct Implementation

This service provides synchronous specialist consult opinions for veterinary image cases.
It NEVER overrides the clinical matrix authority - it only provides additive second opinions.

Architecture:
- Input: image + owner text + preprocess results + severity + contradictions + deterministic facts
- Output: ConsultOpinion with agreements, disagreements, uncertainties, and confidence
"""

import os
import io
import base64
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Header
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
# Pydantic Models
# =============================================================================

class ConsultRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded image or URL")
    owner_text: str = Field(default="", description="Owner's description of the pet's condition")
    mode: str = Field(default="sync", description="sync or async mode")
    preprocess: dict = Field(..., description="Vision preprocess results")
    vision_summary: str = Field(default="", description="Summary from vision preprocessing")
    severity: str = Field(default="needs_review", description="Severity classification")
    contradictions: list[str] = Field(default_factory=list, description="Reported contradictions")
    deterministic_facts: dict = Field(default_factory=dict, description="Verified clinical facts")
    # Enhanced rubric: Additional assessment dimensions
    case_context: dict = Field(default_factory=dict, description="Historical case context for long-context comparison")
    assessment_dimensions: dict = Field(default_factory=dict, description="Additional clinical assessment dimensions")
    previous_findings: list[dict] = Field(default_factory=list, description="Previous related findings for temporal comparison")


class ConsultResponse(BaseModel):
    model: str
    summary: str
    agreements: list[str]
    disagreements: list[str]
    uncertainties: list[str]
    confidence: float
    mode: str = "sync"
    # Enhanced rubric: Nuanced clinical indicators
    morphological_indicators: dict = Field(default_factory=dict, description="Detailed morphological assessment")
    temporal_patterns: dict = Field(default_factory=dict, description="Temporal pattern analysis for chronicity")
    risk_stratifiers: list[str] = Field(default_factory=list, description="Risk stratification factors")
    recommended_next_steps: list[str] = Field(default_factory=list, description="Suggested follow-up actions")
    comparison_to_baseline: dict = Field(default_factory=dict, description="Comparison with similar case patterns")


# =============================================================================
# Global model instances (lazy loaded)
# =============================================================================

MODEL_NAME = "Qwen/Qwen2.5-VL-7B-Instruct"
MODEL = None
PROCESSOR = None
DEVICE = "cuda" if (_TORCH_AVAILABLE and torch.cuda.is_available()) else "cpu"
STUB_MODE = os.environ.get("STUB_MODE", "false").strip().lower() == "true"
EXPECTED_API_KEY = os.environ.get("SIDECAR_API_KEY", "").strip()
logger = logging.getLogger("multimodal-consult-service")


def validate_auth(authorization: str | None) -> None:
    if not EXPECTED_API_KEY:
        return

    expected_header = f"Bearer {EXPECTED_API_KEY}"
    if authorization != expected_header:
        raise HTTPException(status_code=401, detail="Invalid API key")


def load_model():
    """Load Qwen2.5-VL-7B-Instruct model and processor."""
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


# =============================================================================
# Prompt Engineering for Veterinary Consult
# =============================================================================

def build_consult_prompt(request: ConsultRequest) -> str:
    """
    Build a structured prompt for veterinary image consult with strict output discipline.
    
    Enhanced rubric incorporates additional assessment dimensions:
    1. Preprocess results (detected regions, domain, body region, quality)
    2. Owner description
    3. Severity from clinical matrix
    4. Known contradictions
    5. Deterministic facts
    6. Case context (historical data for long-context comparison)
    7. Assessment dimensions (additional clinical indicators)
    8. Previous findings (temporal comparison)
    
    The model must respond with structured analysis that:
    - AGREE: points where specialist view confirms the clinical matrix assessment
    - DISAGREE: points where specialist view diverges (flagged as uncertainty)
    - UNCERTAINTIES: areas where specialist cannot provide confident opinion
    - MORPHOLOGICAL_INDICATORS: detailed tissue/abnormality characterization
    - TEMPORAL_PATTERNS: chronicity and progression indicators
    - RISK_STRATIFIERS: risk categorization factors
    - COMPARISON_TO_BASELINE: comparison with similar case patterns
    
    Output is validated against strict schema - malformed responses are reconstructed
    or replaced with minimal fallback.
    """
    
    preprocess = request.preprocess
    domain = preprocess.get("domain", "unknown")
    body_region = preprocess.get("bodyRegion") or preprocess.get("body_region", "unknown")
    detected_regions = preprocess.get("detectedRegions", [])
    image_quality = preprocess.get("imageQuality", "unknown")
    
    regions_str = ""
    if detected_regions:
        region_items = []
        for r in detected_regions[:5]:
            label = r.get("label", "unknown")
            confidence = r.get("confidence", 0.5)
            region_items.append(f"  - {label} (confidence: {confidence:.2f})")
        regions_str = "\n".join(region_items)
    
    contradictions_str = "\n".join([f"  - {c}" for c in request.contradictions]) if request.contradictions else "None"
    
    facts_str = "\n".join([f"  - {k}: {v}" for k, v in request.deterministic_facts.items()]) if request.deterministic_facts else "None"
    
    # Enhanced rubric: Case context for long-context comparison
    case_context = request.case_context or {}
    context_str = ""
    if case_context:
        context_items = []
        for key, value in case_context.items():
            context_items.append(f"  - {key}: {value}")
        context_str = "\n".join(context_items)
    
    # Enhanced rubric: Assessment dimensions
    assessment_dims = request.assessment_dimensions or {}
    dims_str = ""
    if assessment_dims:
        dim_items = []
        for dim_name, dim_value in assessment_dims.items():
            dim_items.append(f"  - {dim_name}: {dim_value}")
        dims_str = "\n".join(dim_items)
    
    # Enhanced rubric: Previous findings for temporal comparison
    prev_findings_str = "No previous findings available."
    if request.previous_findings:
        finding_items = []
        for pf in request.previous_findings[:5]:
            date = pf.get("date", "unknown date")
            finding = pf.get("finding", "unknown finding")
            finding_items.append(f"  - [{date}] {finding}")
        prev_findings_str = "\n".join(finding_items) if finding_items else "No previous findings available."
    
    prompt = f"""You are a veterinary specialist providing an additive second opinion on a clinical image case.

IMPORTANT CONSTRAINTS - FOLLOW STRICTLY:
1. You are NOT the authority. The clinical matrix makes final triage decisions.
2. Your role is additive only - inform, never override.
3. Respond ONLY with valid JSON matching the exact schema below.
4. Do NOT include markdown code fences, explanations, or text outside the JSON.
5. All array fields must be actual JSON arrays of strings, not single strings.
6. Do NOT leave any array empty if you have genuine observations.

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

=== ENHANCED ASSESSMENT DIMENSIONS ===

Case Context (for long-context comparison):
{context_str or "No historical case context available."}

Clinical Assessment Dimensions:
{dims_str or "No additional assessment dimensions provided."}

Previous Findings (for temporal pattern analysis):
{prev_findings_str}

=== REQUIRED OUTPUT SCHEMA ===

Respond ONLY with this exact JSON structure (no markdown, no text outside):

{{
  "summary": "string: 2-3 sentence specialist assessment of image findings",
  "agreements": ["string: point where your view confirms clinical matrix", ...],
  "disagreements": ["string: point where your view diverges (advisory only)", ...],
  "uncertainties": ["string: area where you lack confident opinion", ...],
  "confidence": 0.0-1.0,
  "morphological_indicators": {{
    "tissue_characterization": "string: detailed tissue/abnormality description",
    "border_characteristics": "string: border definition (well-defined, irregular, etc.)",
    "echogenicity_pattern": "string: echogenicity if ultrasound (anechoic, hypoechoic, etc.)",
    "vascularization": "string: vascularization pattern if doppler available",
    "compression_behavior": "string: compressibility if applicable"
  }},
  "temporal_patterns": {{
    "chronicity_assessment": "string: acute, subacute, chronic, or indeterminate",
    "progression_indicator": "string: improving, stable, progressing, or regressing",
    "change_since_previous": "string: description of change from previous findings if available"
  }},
  "risk_stratifiers": ["string: risk factor 1", "string: risk factor 2", ...],
  "recommended_next_steps": ["string: suggested follow-up action 1", ...],
  "comparison_to_baseline": {{
    "similar_cases_pattern": "string: pattern observed in similar cases",
    "deviation_from_expected": "string: how this case deviates from typical pattern",
    "complexity_assessment": "string: normal, elevated, or high complexity"
  }}
}}

OUTPUT QUALITY DISCIPLINE:
- summary: MUST be 50-500 characters, descriptive, specific to THIS case. Avoid generic phrases like "The image shows..." - instead cite specific findings.
- agreements: Each item MUST cite a specific image finding that confirms the clinical matrix. Minimum 1 item if image quality allows assessment.
- disagreements: Only genuine specialist concerns with severity implications. Minor variations in interpretation do not qualify. Maximum 3 items.
- uncertainties: Explicitly state what image quality or information gaps limit your confidence. Include at minimum image_quality assessment if quality is not "good".
- confidence: Calibrate honestly. 0.7-0.9 is typical for good quality images. Lower if image quality limits assessment.
- morphological_indicators: Provide detailed tissue characterization when image quality permits assessment.
- temporal_patterns: Compare with previous findings when available to assess disease trajectory.
- risk_stratifiers: Identify modifiable and non-modifiable risk factors visible in the case.
- recommended_next_steps: Suggest specific diagnostic or monitoring actions based on findings.
- comparison_to_baseline: Compare against known patterns for similar case presentations.

Respond with JSON only:
"""
    
    return prompt


def parse_model_response(content: str) -> dict:
    """
    Parse the model's JSON response with strict schema enforcement.
    
    Validates output structure and ensures type safety for downstream consumers.
    """
    if not content or not content.strip():
        return _minimal_fallback("Empty response from model")

    # Track parsing issues for reporting
    parse_issues: list[str] = []

    # Step 1: Try direct JSON parse
    try:
        result = json.loads(content)
        _validate_response_schema(result, parse_issues)
        if not parse_issues:
            return result
    except json.JSONDecodeError as e:
        parse_issues.append(f"JSON decode error: {e}")

    # Step 2: Try to extract JSON from content with improved regex
    import re
    # Match balanced braces more robustly
    json_match = re.search(r'\{[\s\S]*\}', content, re.DOTALL)
    if json_match:
        try:
            result = json.loads(json_match.group())
            _validate_response_schema(result, parse_issues)
            if not parse_issues:
                return result
        except json.JSONDecodeError as e:
            parse_issues.append(f"Extracted JSON parse error: {e}")

    # Step 3: Try JSON with markdown code fences stripped
    cleaned = re.sub(r'^```(?:json)?\s*', '', content.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```$', '', cleaned)
    if cleaned != content:
        try:
            result = json.loads(cleaned)
            _validate_response_schema(result, parse_issues)
            if not parse_issues:
                return result
        except json.JSONDecodeError:
            parse_issues.append("Markdown-stripped JSON also failed")

    # Step 4: Partial recovery - extract what we can
    partial = _extract_partial_fields(content)
    if partial:
        remaining_issues = [p for p in parse_issues if p not in partial.get("_parse_notes", [])]
        if remaining_issues:
            partial.setdefault("uncertainties", []).extend(remaining_issues)
        return partial

    # Final fallback
    return _minimal_fallback("; ".join(parse_issues) if parse_issues else "Unknown parse failure")


def _validate_response_schema(result: dict, issues: list[str]) -> None:
    """
    Validate response has required fields with correct types.
    
    Issues are appended to `issues` list for reporting in uncertainties.
    Enhanced validation now enforces content quality minimums.
    """
    required_fields = {
        "summary": (str,),
        "agreements": (list,),
        "disagreements": (list,),
        "uncertainties": (list,),
        "confidence": (int, float),
    }
    optional_list_fields = ("risk_stratifiers", "recommended_next_steps")
    optional_dict_fields = (
        "morphological_indicators",
        "temporal_patterns",
        "comparison_to_baseline",
    )

    for field, expected_types in required_fields.items():
        if field not in result:
            issues.append(f"Missing required field: {field}")
            continue
        if not isinstance(result[field], expected_types):
            issues.append(
                f"Field '{field}' has wrong type: expected {expected_types[0].__name__}, "
                f"got {type(result[field]).__name__}"
            )
            # Coerce type if possible
            if expected_types[0] in (int, float) and isinstance(result[field], (int, float)):
                result[field] = expected_types[0](result[field])
            elif expected_types[0] == list and not isinstance(result[field], list):
                result[field] = [result[field]]

    # Validate confidence range
    if "confidence" in result:
        conf = result["confidence"]
        if isinstance(conf, (int, float)):
            if conf < 0.0 or conf > 1.0:
                issues.append(f"Confidence {conf} outside valid range [0.0, 1.0], clamping")
                result["confidence"] = max(0.0, min(1.0, conf))

    # Ensure arrays are actually arrays with string elements
    for array_field in ("agreements", "disagreements", "uncertainties"):
        if array_field in result:
            if not isinstance(result[array_field], list):
                result[array_field] = [str(result[array_field])] if result[array_field] else []
            else:
                # Ensure all elements are strings
                result[array_field] = [
                    str(item) if not isinstance(item, str) else item
                    for item in result[array_field]
                ]

    for array_field in optional_list_fields:
        if array_field not in result:
            result[array_field] = []
        elif not isinstance(result[array_field], list):
            result[array_field] = [str(result[array_field])] if result[array_field] else []
        else:
            result[array_field] = [
                str(item) if not isinstance(item, str) else item
                for item in result[array_field]
            ]

    for object_field in optional_dict_fields:
        if object_field not in result or not isinstance(result[object_field], dict):
            result[object_field] = {}

    # Content quality validation
    if "summary" in result and isinstance(result["summary"], str):
        summary_len = len(result["summary"])
        if summary_len < 30:
            issues.append(f"Summary too short ({summary_len} chars), likely too generic")
        elif summary_len > 600:
            issues.append(f"Summary too long ({summary_len} chars), may lack focus")

    # Agreements should have substantive content
    if "agreements" in result and isinstance(result["agreements"], list):
        if len(result["agreements"]) == 0:
            issues.append("No agreements provided - was image quality too poor to assess?")
        else:
            # Check each agreement has minimum meaningful length
            for i, agr in enumerate(result["agreements"]):
                if len(agr) < 20:
                    issues.append(f"Agreement {i+1} too short ({len(agr)} chars), lacks specificity")

    # Disagreements should be limited and substantive
    if "disagreements" in result and isinstance(result["disagreements"], list):
        if len(result["disagreements"]) > 3:
            issues.append(f"Too many disagreements ({len(result['disagreements'])}), maximum is 3")
        for i, dis in enumerate(result["disagreements"]):
            if len(dis) < 20:
                issues.append(f"Disagreement {i+1} too short ({len(dis)} chars), lacks detail")


def _extract_partial_fields(content: str) -> dict | None:
    """Try to extract valid partial fields from malformed content."""
    import re

    partial: dict[str, Any] = {"_parse_notes": []}

    # Try to extract summary
    summary_match = re.search(r'"summary"\s*:\s*"([^"]*)"', content)
    if summary_match:
        partial["summary"] = summary_match.group(1)
    else:
        # Try unquoted
        summary_match = re.search(r'"summary"\s*:\s*([^\s,}]+)', content)
        if summary_match:
            partial["summary"] = summary_match.group(1)[:200]

    # Try to extract confidence
    conf_match = re.search(r'"confidence"\s*:\s*([0-9.]+)', content)
    if conf_match:
        try:
            partial["confidence"] = float(conf_match.group(1))
        except ValueError:
            pass

    # Only return if we got at least summary
    if "summary" in partial:
        partial.setdefault("agreements", [])
        partial.setdefault("disagreements", [])
        partial.setdefault("uncertainties", ["Partial parse - some fields missing"])
        partial.setdefault("confidence", partial.get("confidence", 0.3))
        partial.setdefault("morphological_indicators", {})
        partial.setdefault("temporal_patterns", {})
        partial.setdefault("risk_stratifiers", [])
        partial.setdefault("recommended_next_steps", [])
        partial.setdefault("comparison_to_baseline", {})
        partial.setdefault("uncertainty_calibration", {})
        return partial

    return None


def _minimal_fallback(reason: str) -> dict:
    """Return minimal valid fallback response with failure reason."""
    return {
        "summary": f"Consult generation failed: {reason}. Clinical matrix remains authority.",
        "agreements": [],
        "disagreements": [],
        "uncertainties": [f"Consult parse failure: {reason}"],
        "confidence": 0.1,
        "morphological_indicators": {},
        "temporal_patterns": {},
        "risk_stratifiers": [],
        "recommended_next_steps": [],
        "comparison_to_baseline": {},
        "uncertainty_calibration": {},
    }


async def generate_consult(request: ConsultRequest) -> ConsultResponse:
    """Generate consult opinion using Qwen2.5-VL-7B."""
    if STUB_MODE:
        return ConsultResponse(
            model=f"{MODEL_NAME} (stub)",
            summary=(
                "Stub consult mode is active. The clinical matrix remains the authority "
                "and no external multimodal specialist opinion was generated."
            ),
            agreements=[],
            disagreements=[],
            uncertainties=[
                "Multimodal consult service is running in stub mode.",
                "Use this only for contract and integration verification.",
            ],
            confidence=0.25,
            mode="sync",
        )
    
    model, processor = load_model()
    
    # Decode image
    try:
        if request.image.startswith("http"):
            # URL-based image
            from urllib.request import urlopen
            image = Image.open(urlopen(request.image)).convert("RGB")
        else:
            # Base64 image
            image = decode_image(request.image)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode image: {str(e)}")
    
    # Build prompt
    prompt = build_consult_prompt(request)
    
    # Prepare messages for Qwen2.5-VL
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
    
    # Generate
    with torch.no_grad():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
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
    
    return ConsultResponse(
        model=MODEL_NAME,
        summary=parsed.get("summary", "No summary generated."),
        agreements=parsed.get("agreements", []),
        disagreements=parsed.get("disagreements", []),
        uncertainties=parsed.get("uncertainties", []),
        confidence=float(parsed.get("confidence", 0.5)),
        mode="sync",
        morphological_indicators=parsed.get("morphological_indicators", {}),
        temporal_patterns=parsed.get("temporal_patterns", {}),
        risk_stratifiers=parsed.get("risk_stratifiers", []),
        recommended_next_steps=parsed.get("recommended_next_steps", []),
        comparison_to_baseline=parsed.get("comparison_to_baseline", {}),
        uncertainty_calibration=parsed.get("uncertainty_calibration", {}),
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
    title="multimodal-consult-service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/healthz")
def healthz():
    """Health check endpoint."""
    return {
        "ok": True,
        "service": "multimodal-consult-service",
        "mode": "stub" if STUB_MODE else "production",
        "model": MODEL_NAME,
        "device": DEVICE,
    }


@app.post("/consult", response_model=ConsultResponse)
async def consult(
    payload: ConsultRequest,
    authorization: str | None = Header(default=None),
):
    """
    Generate a specialist consult opinion for a veterinary image case.
    
    This endpoint provides additive second opinions - it never overrides
    the clinical matrix authority.
    """
    
    validate_auth(authorization)
    
    try:
        result = await generate_consult(payload)
        return result
    except torch.cuda.OutOfMemoryError:
        raise HTTPException(
            status_code=503,
            detail="GPU memory exhausted. Consider reducing image resolution.",
        )
    except Exception as e:
        logger.error("Consult generation failed", exc_info=e)
        raise HTTPException(
            status_code=500,
            detail="Consult generation failed. Falling back to clinical matrix authority.",
        )


# =============================================================================
# Long-Context Case Comparison Endpoint
# =============================================================================


class CaseComparisonRequest(BaseModel):
    """Request model for long-context case comparison."""
    current_case: dict = Field(..., description="Current case data including image and findings")
    historical_cases: list[dict] = Field(..., description="Historical cases for comparison")
    comparison_mode: str = Field(default="temporal", description="Comparison mode: temporal, cross-sectional, or pattern")


class CaseComparisonResponse(BaseModel):
    """Response model for long-context case comparison."""
    current_case_id: str
    comparison_summary: str
    pattern_matches: list[dict]
    anomalies_detected: list[str]
    progression_indicators: dict
    risk_trajectory: str
    confidence: float


@app.post("/compare-cases", response_model=CaseComparisonResponse)
async def compare_cases(
    payload: CaseComparisonRequest,
    authorization: str | None = Header(default=None),
):
    """
    Compare current case against historical cases spanning extended time periods.
    
    This endpoint enables:
    - Temporal comparison: Track disease progression/regression over time
    - Cross-sectional comparison: Compare with similar cases at same stage
    - Pattern recognition: Identify common patterns across multiple cases
    
    Returns structured comparison analysis with pattern matching and anomaly detection.
    """
    validate_auth(authorization)
    
    try:
        current_case = payload.current_case
        historical_cases = payload.historical_cases
        comparison_mode = payload.comparison_mode
        
        current_case_id = current_case.get("case_id", "unknown")
        
        # Pattern matching across historical cases
        pattern_matches = []
        anomalies_detected = []
        progression_indicators = {
            "direction": "stable",
            "magnitude": 0.0,
            "confidence": 0.5
        }
        
        # Analyze temporal patterns if historical data exists
        if len(historical_cases) >= 2 and comparison_mode == "temporal":
            sorted_cases = sorted(historical_cases, key=lambda x: x.get("date", ""), reverse=True)
            
            # Compare current with most recent historical
            most_recent = sorted_cases[0]
            severity_current = current_case.get("severity", "")
            severity_recent = most_recent.get("severity", "")
            
            if severity_current != severity_recent:
                anomalies_detected.append(f"Severity change detected: {severity_recent} -> {severity_current}")
            
            # Track progression across multiple time points
            severity_timeline = [c.get("severity", "unknown") for c in sorted_cases]
            progression_indicators = {
                "direction": _infer_progression_direction(severity_timeline),
                "magnitude": len(set(severity_timeline)),
                "timeline_points": len(severity_timeline),
                "confidence": 0.8 if len(severity_timeline) >= 3 else 0.5
            }
        
        # Cross-sectional pattern matching
        if comparison_mode in ["cross-sectional", "pattern"]:
            same_domain_cases = [c for c in historical_cases if c.get("domain") == current_case.get("domain")]
            same_severity_cases = [c for c in historical_cases if c.get("severity") == current_case.get("severity")]
            
            if same_domain_cases:
                pattern_matches.append({
                    "pattern_type": "domain_association",
                    "match_count": len(same_domain_cases),
                    "description": f"{len(same_domain_cases)} cases with same domain"
                })
            
            if same_severity_cases:
                pattern_matches.append({
                    "pattern_type": "severity_cluster",
                    "match_count": len(same_severity_cases),
                    "description": f"{len(same_severity_cases)} cases with same severity"
                })
        
        # Risk trajectory assessment
        risk_trajectory = _assess_risk_trajectory(current_case, historical_cases)
        
        # Calculate confidence based on data availability
        confidence = min(0.9, 0.5 + (len(historical_cases) * 0.1))
        
        return CaseComparisonResponse(
            current_case_id=current_case_id,
            comparison_summary=f"Compared current case against {len(historical_cases)} historical cases using {comparison_mode} analysis.",
            pattern_matches=pattern_matches,
            anomalies_detected=anomalies_detected,
            progression_indicators=progression_indicators,
            risk_trajectory=risk_trajectory,
            confidence=confidence
        )
        
    except Exception as e:
        logger.error("Case comparison failed", exc_info=e)
        raise HTTPException(status_code=500, detail="Case comparison analysis failed")


def _infer_progression_direction(severity_timeline: list[str]) -> str:
    """Infer disease progression direction from severity timeline."""
    if len(severity_timeline) < 2:
        return "indeterminate"
    
    severity_order = {"low": 0, "medium": 1, "high": 2, "critical": 3, "unknown": 1}
    numeric_timeline = [severity_order.get(s.lower(), 1) for s in severity_timeline]
    
    if numeric_timeline[0] > numeric_timeline[-1]:
        return "improving"
    elif numeric_timeline[0] < numeric_timeline[-1]:
        return "progressing"
    else:
        return "stable"


def _assess_risk_trajectory(current_case: dict, historical_cases: list[dict]) -> str:
    """Assess overall risk trajectory based on current and historical patterns."""
    current_severity = current_case.get("severity", "unknown").lower()
    
    if not historical_cases:
        return "insufficient_data"
    
    # Calculate average severity of historical cases
    severity_scores = []
    severity_map = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    for case in historical_cases:
        sev = case.get("severity", "unknown").lower()
        if sev in severity_map:
            severity_scores.append(severity_map[sev])
    
    if not severity_scores:
        return "insufficient_data"
    
    avg_historical = sum(severity_scores) / len(severity_scores)
    current_score = severity_map.get(current_severity, 2)
    
    if current_score > avg_historical + 0.5:
        return "elevated_risk"
    elif current_score < avg_historical - 0.5:
        return "reduced_risk"
    else:
        return "stable_risk"


# =============================================================================
# Enhanced Uncertainty Discipline
# =============================================================================
# Strengthened uncertainty quantification and discipline for consult quality.


class UncertaintyMetrics(BaseModel):
    """Enhanced metrics for quantifying and qualifying uncertainty in consults with longitudinal reasoning."""
    # Core uncertainty components
    knowledge_uncertainty: float = Field(..., description="0-1 score for gaps in domain knowledge")
    image_quality_uncertainty: float = Field(..., description="0-1 score for image quality limitations")
    temporal_uncertainty: float = Field(..., description="0-1 score for insufficient historical context")
    sequence_uncertainty: float = Field(default=0.0, description="0-1 score for multi-image sequence position")
    follow_up_uncertainty: float = Field(default=0.0, description="0-1 score for multi-turn follow-up trajectory")
    confidence_calibration: float = Field(..., description="How well confidence matches actual accuracy")
    uncertainty_disciplined: bool = Field(..., description="Whether uncertainty was properly communicated")
    
    # Longitudinal multi-image reasoning fields
    sequence_position_confidence_delta: float = Field(
        default=0.0,
        description="Confidence adjustment based on image position in sequence (-0.2 to +0.2)"
    )
    image_contribution_narrative: list[str] = Field(
        default=[],
        description="Human-readable explanation of each image's contribution to the diagnosis"
    )
    cross_image_agreement_score: float = Field(
        default=1.0,
        description="0-1 score measuring agreement across images in sequence"
    )
    body_region_coverage_completeness: float = Field(
        default=1.0,
        description="0-1 score for how completely the image sequence covers relevant body regions"
    )
    
    # Longitudinal multi-turn follow-up fields
    trajectory_clarity_score: float = Field(
        default=0.5,
        description="0-1 score for how clearly the follow-up trajectory is established"
    )
    change_point_indicators: list[dict] = Field(
        default=[],
        description="Identified change points in the follow-up sequence with evidence"
    )
    treatment_response_signals: list[str] = Field(
        default=[],
        description="Detected signals of response or non-response to treatment"
    )
    chronological_reasoning_quality: float = Field(
        default=0.5,
        description="0-1 score for quality of chronological disease progression reasoning"
    )
    
    # Uncertainty narration fields
    primary_uncertainty_drivers: list[str] = Field(
        default=[],
        description="Ranked list of factors contributing most to uncertainty"
    )
    uncertainty_narrative: str = Field(
        default="",
        description="Comprehensive human-readable explanation of overall uncertainty"
    )
    recommended_clarification_questions: list[str] = Field(
        default=[],
        description="Questions that would most reduce uncertainty if answered"
    )


def _compute_uncertainty_metrics(
    case_context: dict,
    image_quality: str,
    previous_findings: list[dict],
    uncertainties: list[str],
    confidence: float,
    image_sequence_position: int = 0,
    total_images_in_sequence: int = 1,
    case_temporal_context: dict | None = None
) -> UncertaintyMetrics:
    """
    Compute disciplined uncertainty metrics for a consult with deep longitudinal reasoning.
    
    Quantifies and qualifies different sources of uncertainty to ensure
    proper calibration and communication. Enhanced for multi-image sequences
    and multi-turn follow-up cases with comprehensive narration.
    
    Args:
        case_context: Full case context including history and presentation
        image_quality: Quality rating of current image
        previous_findings: Findings from previous images/turns in sequence
        uncertainties: List of explicitly stated uncertainties
        confidence: Reported confidence level (0-1)
        image_sequence_position: Position of current image in sequence (0-indexed)
        total_images_in_sequence: Total number of images in the sequence
        case_temporal_context: Optional temporal context with dates, time deltas, etc.
    """
    # ==========================================================================
    # KNOWLEDGE UNCERTAINTY - Gaps in domain knowledge
    # ==========================================================================
    knowledge_uncertainty = 0.0
    knowledge_drivers = []
    
    if "unknown" in str(case_context).lower():
        knowledge_uncertainty += 0.2
        knowledge_drivers.append("Generic 'unknown' detected in case context")
    
    if len(uncertainties) > 3:
        added_uncertainty = min(0.3, (len(uncertainties) - 3) * 0.1)
        knowledge_uncertainty += added_uncertainty
        knowledge_drivers.append(f"Multiple explicit uncertainties ({len(uncertainties)}) indicate knowledge gaps")
    
    # Check for specific knowledge gaps in differential diagnosis
    case_str = str(case_context).lower()
    if "differential" in case_str and "unclear" in case_str:
        knowledge_uncertainty += 0.15
        knowledge_drivers.append("Differential diagnosis marked as unclear")
    
    # ==========================================================================
    # IMAGE QUALITY UNCERTAINTY
    # ==========================================================================
    image_quality_uncertainty = 0.0
    quality_map = {"good": 0.0, "adequate": 0.2, "poor": 0.5, "marginal": 0.4, "unknown": 0.3}
    image_quality_uncertainty = quality_map.get(image_quality.lower(), 0.3)
    
    # ==========================================================================
    # TEMPORAL UNCERTAINTY - Insufficient historical context
    # ==========================================================================
    temporal_uncertainty = 0.0
    temporal_drivers = []
    
    if not previous_findings:
        temporal_uncertainty = 0.4
        temporal_drivers.append("No previous findings - first consult in sequence")
    elif len(previous_findings) < 2:
        temporal_uncertainty = 0.2
        temporal_drivers.append("Limited history (1 previous finding)")
    elif len(previous_findings) >= 5:
        temporal_uncertainty = 0.05  # Rich history reduces temporal uncertainty
        temporal_drivers.append("Rich longitudinal history available")
    else:
        temporal_drivers.append(f"Moderate history ({len(previous_findings)} previous findings)")
    
    # Check temporal context for date gaps or inconsistencies
    if case_temporal_context:
        time_delta_days = case_temporal_context.get("time_delta_days", 0)
        if time_delta_days > 90:
            temporal_uncertainty += 0.1
            temporal_drivers.append(f"Large temporal gap ({time_delta_days} days) since last consult")
        elif time_delta_days < 0:
            temporal_uncertainty += 0.15
            temporal_drivers.append("Temporal inconsistency detected (negative time delta)")
    
    # ==========================================================================
    # MULTI-IMAGE SEQUENCE UNCERTAINTY - Deep longitudinal reasoning
    # ==========================================================================
    sequence_uncertainty = 0.0
    sequence_confidence_delta = 0.0
    image_contribution_narrative = []
    cross_image_agreement = 1.0
    body_region_coverage = 1.0
    
    if total_images_in_sequence > 1:
        # Position-based confidence adjustment
        if image_sequence_position == 0:
            sequence_uncertainty = 0.25
            sequence_confidence_delta = -0.15
            image_contribution_narrative.append(
                f"Image 1/{total_images_in_sequence}: Establishing baseline - highest uncertainty, "
                "no prior images for comparison."
            )
        elif image_sequence_position < total_images_in_sequence - 1:
            sequence_uncertainty = 0.15
            sequence_confidence_delta = 0.0
            image_contribution_narrative.append(
                f"Image {image_sequence_position + 1}/{total_images_in_sequence}: "
                "Middle sequence position - can compare with prior, awaiting subsequent images."
            )
        else:
            sequence_uncertainty = 0.08
            sequence_confidence_delta = 0.12
            image_contribution_narrative.append(
                f"Image {image_sequence_position + 1}/{total_images_in_sequence}: "
                "Final position - can confirm or contradict earlier findings."
            )
        
        # Cross-image agreement analysis
        if previous_findings and len(previous_findings) >= 2:
            consistency = _compute_sequence_consistency(previous_findings)
            cross_image_agreement = consistency
            
            if consistency < 0.4:
                sequence_uncertainty += 0.20
                cross_image_agreement = consistency
                image_contribution_narrative.append(
                    f"WARNING: Low cross-image agreement ({consistency:.0%}) - findings conflict "
                    "across sequence. Further clarification needed."
                )
            elif consistency < 0.6:
                sequence_uncertainty += 0.10
                image_contribution_narrative.append(
                    f"MODERATE: Cross-image agreement ({consistency:.0%}) shows partial consistency."
                )
            else:
                image_contribution_narrative.append(
                    f"STRONG: Cross-image agreement ({consistency:.0%}) supports consistent findings."
                )
        
        # Body region coverage assessment
        body_regions_covered = set()
        for finding in previous_findings:
            region = finding.get("body_region", "unknown")
            body_regions_covered.add(region)
        
        # If we're covering multiple body regions, coverage is more complete
        if len(body_regions_covered) >= 2:
            body_region_coverage = min(1.0, 0.7 + (len(body_regions_covered) * 0.1))
            image_contribution_narrative.append(
                f"Body region coverage: {len(body_regions_covered)} regions "
                f"({', '.join(body_regions_covered)}) - {'comprehensive' if len(body_regions_covered) >= 3 else 'moderate'} coverage."
            )
    else:
        image_contribution_narrative.append(
            "Single image consult - no sequence comparison possible."
        )
    
    # ==========================================================================
    # MULTI-TURN FOLLOW-UP UNCERTAINTY - Trajectory and change point analysis
    # ==========================================================================
    follow_up_uncertainty = 0.0
    trajectory_clarity = 0.5
    change_points = []
    treatment_signals = []
    chronological_quality = 0.5
    
    if len(previous_findings) >= 3:
        # Extract trajectory indicators from last 3-5 findings
        trajectory_indicators = [pf.get("progression_indicator", "unknown") for pf in previous_findings[-5:]]
        
        # Assess trajectory clarity
        unique_trajectories = set(trajectory_indicators)
        if len(unique_trajectories) > 2:
            follow_up_uncertainty = 0.20
            trajectory_clarity = 0.3
            change_points = _detect_change_points(previous_findings)
        elif all(t == "unknown" for t in trajectory_indicators):
            follow_up_uncertainty = 0.15
            trajectory_clarity = 0.35
        elif len(unique_trajectories) == 1:
            follow_up_uncertainty = 0.05
            trajectory_clarity = 0.85
        else:
            trajectory_clarity = 0.6
        
        # Detect treatment response signals
        treatment_signals = _extract_treatment_response_signals(previous_findings)
        
        # Assess chronological reasoning quality
        chronological_quality = _assess_chronological_reasoning_quality(
            previous_findings, case_temporal_context
        )
        
        # Apply chronological quality to follow-up uncertainty
        if chronological_quality < 0.4:
            follow_up_uncertainty += 0.10
    
    # ==========================================================================
    # CONFIDENCE CALIBRATION
    # ==========================================================================
    uncertainty_weight_sum = (
        knowledge_uncertainty * 0.25 +
        image_quality_uncertainty * 0.30 +
        temporal_uncertainty * 0.20 +
        sequence_uncertainty * 0.15 +
        follow_up_uncertainty * 0.10
    )
    expected_confidence = 1.0 - uncertainty_weight_sum
    confidence_calibration = 1.0 - abs(confidence - expected_confidence)
    
    # ==========================================================================
    # UNCERTAINTY DISCIPLINE ASSESSMENT
    # ==========================================================================
    uncertainty_disciplined = (
        len(uncertainties) >= 1 and
        knowledge_uncertainty < 0.5 and
        image_quality_uncertainty < 0.6
    )
    
    # ==========================================================================
    # PRIMARY UNCERTAINTY DRIVERS AND NARRATIVE
    # ==========================================================================
    all_drivers = []
    
    # Rank uncertainty drivers by contribution
    if knowledge_uncertainty > 0.15:
        all_drivers.append(("knowledge_gaps", knowledge_uncertainty, knowledge_drivers))
    if image_quality_uncertainty > 0.2:
        all_drivers.append(("image_quality", image_quality_uncertainty, 
            [f"Image quality rated as '{image_quality}'"]))
    if temporal_uncertainty > 0.15:
        all_drivers.append(("temporal_context", temporal_uncertainty, temporal_drivers))
    if sequence_uncertainty > 0.12:
        all_drivers.append(("sequence_position", sequence_uncertainty, 
            [f"Image {image_sequence_position + 1} of {total_images_in_sequence} in sequence"]))
    if follow_up_uncertainty > 0.12:
        all_drivers.append(("follow_up_trajectory", follow_up_uncertainty,
            [f"Trajectory clarity: {trajectory_clarity:.0%}", f"Change points detected: {len(change_points)}"]))
    
    # Sort by uncertainty contribution
    all_drivers.sort(key=lambda x: x[1], reverse=True)
    primary_drivers = [d[0] for d in all_drivers[:3]]
    
    # Generate comprehensive uncertainty narrative
    uncertainty_narrative = _generate_uncertainty_narrative(
        knowledge_uncertainty=knowledge_uncertainty,
        image_quality_uncertainty=image_quality_uncertainty,
        temporal_uncertainty=temporal_uncertainty,
        sequence_uncertainty=sequence_uncertainty,
        follow_up_uncertainty=follow_up_uncertainty,
        trajectory_clarity=trajectory_clarity,
        cross_image_agreement=cross_image_agreement,
        chronological_quality=chronological_quality,
        confidence_calibration=confidence_calibration,
        primary_drivers=primary_drivers
    )
    
    # Generate recommended clarification questions
    clarification_questions = _generate_clarification_questions(
        knowledge_uncertainty=knowledge_uncertainty,
        image_quality_uncertainty=image_quality_uncertainty,
        temporal_uncertainty=temporal_uncertainty,
        sequence_uncertainty=sequence_uncertainty,
        follow_up_uncertainty=follow_up_uncertainty,
        cross_image_agreement=cross_image_agreement,
        total_images_in_sequence=total_images_in_sequence,
        previous_findings=previous_findings
    )
    
    return UncertaintyMetrics(
        knowledge_uncertainty=round(knowledge_uncertainty, 3),
        image_quality_uncertainty=round(image_quality_uncertainty, 3),
        temporal_uncertainty=round(temporal_uncertainty, 3),
        sequence_uncertainty=round(sequence_uncertainty, 3),
        follow_up_uncertainty=round(follow_up_uncertainty, 3),
        confidence_calibration=round(max(0.0, confidence_calibration), 3),
        uncertainty_disciplined=uncertainty_disciplined,
        sequence_position_confidence_delta=round(sequence_confidence_delta, 3),
        image_contribution_narrative=image_contribution_narrative,
        cross_image_agreement_score=round(cross_image_agreement, 3),
        body_region_coverage_completeness=round(body_region_coverage, 3),
        trajectory_clarity_score=round(trajectory_clarity, 3),
        change_point_indicators=change_points,
        treatment_response_signals=treatment_signals,
        chronological_reasoning_quality=round(chronological_quality, 3),
        primary_uncertainty_drivers=primary_drivers,
        uncertainty_narrative=uncertainty_narrative,
        recommended_clarification_questions=clarification_questions
    )


def _compute_sequence_consistency(previous_findings: list[dict]) -> float:
    """
    Compute consistency score across findings in a multi-image sequence.
    
    Returns a score between 0.0 (completely inconsistent) and 1.0 (fully consistent).
    """
    if len(previous_findings) < 2:
        return 0.5  # Insufficient data
    
    # Extract key indicators for comparison
    key_indicators = []
    for finding in previous_findings:
        # Extract key assessment dimensions if available
        assessment = finding.get("assessment", finding.get("temporal_patterns", {}))
        if isinstance(assessment, dict):
            indicator = assessment.get("progression_indicator", "unknown")
            chronicity = assessment.get("chronicity_assessment", "unknown")
            key_indicators.append(f"{chronicity}_{indicator}")
        else:
            key_indicators.append("unknown")
    
    # Count matching indicators
    if not key_indicators:
        return 0.5
    
    unique_indicators = set(key_indicators)
    consistency = 1.0 - (len(unique_indicators) - 1) / len(key_indicators)
    
    return max(0.0, min(1.0, consistency))


def _detect_change_points(previous_findings: list[dict]) -> list[dict]:
    """
    Detect significant change points in a follow-up sequence.
    
    Identifies points where findings substantively change direction,
    suggesting disease progression, treatment response, or new pathology.
    
    Returns:
        List of change point indicators with evidence and significance.
    """
    if len(previous_findings) < 3:
        return []
    
    change_points = []
    
    for i in range(1, len(previous_findings)):
        prev_finding = previous_findings[i - 1]
        curr_finding = previous_findings[i]
        
        # Extract key metrics for comparison
        prev_severity = prev_finding.get("severity_score", prev_finding.get("chronicity_score", 0.5))
        curr_severity = curr_finding.get("severity_score", curr_finding.get("chronicity_score", 0.5))
        
        prev_trajectory = prev_finding.get("progression_indicator", "unknown")
        curr_trajectory = curr_finding.get("progression_indicator", "unknown")
        
        # Detect significant severity changes
        severity_delta = abs(curr_severity - prev_severity)
        if severity_delta > 0.3:
            direction = "worsening" if curr_severity > prev_severity else "improving"
            change_points.append({
                "position": i,
                "type": "severity_change",
                "direction": direction,
                "magnitude": round(severity_delta, 3),
                "evidence": f"Severity shifted from {prev_severity:.2f} to {curr_severity:.2f}",
                "significance": "high" if severity_delta > 0.5 else "moderate"
            })
        
        # Detect trajectory reversals
        if prev_trajectory != "unknown" and curr_trajectory != "unknown":
            trajectory_pairs = {
                ("improving", "worsening"): "reversal",
                ("worsening", "improving"): "recovery_signal",
                ("stable", "improving"): "positive_transition",
                ("stable", "worsening"): "negative_transition",
            }
            reversal_type = trajectory_pairs.get((prev_trajectory, curr_trajectory))
            if reversal_type:
                change_points.append({
                    "position": i,
                    "type": "trajectory_reversal",
                    "direction": reversal_type,
                    "evidence": f"Trajectory changed from {prev_trajectory} to {curr_trajectory}",
                    "significance": "high" if reversal_type in ("reversal", "recovery_signal") else "moderate"
                })
    
    return change_points


def _extract_treatment_response_signals(previous_findings: list[dict]) -> list[str]:
    """
    Extract signals indicating response or non-response to treatment.
    
    Analyzes findings for patterns suggesting treatment efficacy or lack thereof.
    
    Returns:
        List of treatment response signals detected in the sequence.
    """
    signals = []
    
    if len(previous_findings) < 2:
        return signals
    
    # Look for improvement patterns after treatment indicators
    for i, finding in enumerate(previous_findings):
        treatment_mentioned = finding.get("treatment_given", "") or finding.get("intervention", "")
        
        if treatment_mentioned and i < len(previous_findings) - 1:
            next_finding = previous_findings[i + 1]
            next_trajectory = next_finding.get("progression_indicator", "unknown")
            next_severity = next_finding.get("severity_score", 0.5)
            curr_severity = finding.get("severity_score", 0.5)
            
            if next_trajectory == "improving" or next_severity < curr_severity:
                signals.append(
                    f"POSITIVE_RESPONSE: Treatment '{treatment_mentioned}' at position {i} "
                    f"followed by improvement trajectory"
                )
            elif next_trajectory == "worsening" or next_severity > curr_severity:
                signals.append(
                    f"NEGATIVE_RESPONSE: Treatment '{treatment_mentioned}' at position {i} "
                    f"followed by worsening trajectory - consider alternative approach"
                )
    
    # Check for medication/treatment compliance indicators
    compliance_keywords = ["compliant", "adherent", "following", "tolerated"]
    for finding in previous_findings:
        notes = str(finding.get("notes", "")).lower()
        if any(kw in notes for kw in compliance_keywords):
            if "improving" in notes or "responding" in notes:
                signals.append("COMPLIANCE_POSITIVE: Patient following treatment protocol with positive response")
            elif "not" in notes or "failed" in notes:
                signals.append("COMPLIANCE_CONCERN: Potential issues with treatment compliance")
    
    return signals


def _assess_chronological_reasoning_quality(
    previous_findings: list[dict],
    case_temporal_context: dict | None
) -> float:
    """
    Assess the quality of chronological reasoning in the follow-up sequence.
    
    Evaluates whether findings are properly interpreted in temporal context
    and whether disease progression/regression is logically reasoned.
    
    Returns:
        Quality score from 0.0 (poor) to 1.0 (excellent).
    """
    quality_score = 0.5  # Default moderate quality
    
    # Positive indicators
    positive_indicators = 0
    total_indicators = 0
    
    # Check 1: Temporal markers present
    for finding in previous_findings:
        temporal_markers = [
            finding.get("time_since_presentation"),
            finding.get("days_since_start"),
            finding.get("temporal_marker"),
            finding.get("consult_date")
        ]
        if any(tm is not None for tm in temporal_markers):
            positive_indicators += 1
        total_indicators += 1
    
    # Check 2: Proper temporal sequencing in findings
    timestamps = []
    for i, finding in enumerate(previous_findings):
        ts = finding.get("consult_timestamp") or finding.get("finding_timestamp") or i
        timestamps.append(ts)
    
    if timestamps == sorted(timestamps):
        positive_indicators += 1
    total_indicators += 1
    
    # Check 3: Temporal context provided
    if case_temporal_context:
        if case_temporal_context.get("onset_date") and case_temporal_context.get("presentation_date"):
            positive_indicators += 1
        total_indicators += 1
    
    # Check 4: Duration-appropriate reasoning
    if len(previous_findings) >= 2:
        first_severity = previous_findings[0].get("severity_score", 0.5)
        last_severity = previous_findings[-1].get("severity_score", 0.5)
        
        # Acute cases (high initial severity) should show change
        if first_severity > 0.7 and abs(last_severity - first_severity) > 0.1:
            positive_indicators += 1
            total_indicators += 1
        # Chronic stable cases should show consistency
        elif first_severity < 0.5 and abs(last_severity - first_severity) < 0.2:
            positive_indicators += 1
            total_indicators += 1
        else:
            total_indicators += 1
    
    # Calculate quality score
    if total_indicators > 0:
        quality_score = positive_indicators / total_indicators
    
    return max(0.0, min(1.0, quality_score))


def _generate_uncertainty_narrative(
    knowledge_uncertainty: float,
    image_quality_uncertainty: float,
    temporal_uncertainty: float,
    sequence_uncertainty: float,
    follow_up_uncertainty: float,
    trajectory_clarity: float,
    cross_image_agreement: float,
    chronological_quality: float,
    confidence_calibration: float,
    primary_drivers: list[str]
) -> str:
    """
    Generate comprehensive human-readable uncertainty narrative.
    
    Synthesizes all uncertainty components into a coherent explanation
    suitable for communication to reviewers and for audit purposes.
    """
    narrative_parts = []
    
    # Overall confidence assessment
    if confidence_calibration > 0.85:
        narrative_parts.append(
            "EXCELLENT CALIBRATION: Reported confidence is well-aligned with uncertainty sources. "
        )
    elif confidence_calibration > 0.7:
        narrative_parts.append(
            "GOOD CALIBRATION: Confidence reasonably reflects uncertainty levels. "
        )
    elif confidence_calibration > 0.5:
        narrative_parts.append(
            "MODERATE CALIBRATION: Some mismatch between reported confidence and actual uncertainty. "
        )
    else:
        narrative_parts.append(
            "POOR CALIBRATION: Confidence significantly misaligned with uncertainty sources - "
            "recommend confidence adjustment. "
        )
    
    # Primary uncertainty drivers
    if primary_drivers:
        driver_descriptions = {
            "knowledge_gaps": "knowledge limitations",
            "image_quality": "image quality constraints",
            "temporal_context": "insufficient historical context",
            "sequence_position": "multi-image sequence position",
            "follow_up_trajectory": "follow-up trajectory ambiguity"
        }
        driver_text = ", ".join(
            driver_descriptions.get(d, d) for d in primary_drivers
        )
        narrative_parts.append(
            f"Primary uncertainty drivers: {driver_text}. "
        )
    
    # Image sequence assessment
    if sequence_uncertainty > 0.15:
        if cross_image_agreement < 0.5:
            narrative_parts.append(
                f"CONCERN: Low cross-image agreement ({cross_image_agreement:.0%}) indicates "
                "conflicting findings across the image sequence. This may require clarification "
                "or additional imaging. "
            )
        else:
            narrative_parts.append(
                f"Image sequence contributes moderate uncertainty ({sequence_uncertainty:.0%}). "
            )
    
    # Trajectory assessment
    if follow_up_uncertainty > 0.12:
        if trajectory_clarity < 0.4:
            narrative_parts.append(
                f"WARN: Low trajectory clarity ({trajectory_clarity:.0%}) - the follow-up "
                "progression is ambiguous. Temporal context would strengthen the analysis. "
            )
        else:
            narrative_parts.append(
                f"Follow-up trajectory clarity is {trajectory_clarity:.0%}. "
            )
    
    # Chronological reasoning quality
    if chronological_quality < 0.4:
        narrative_parts.append(
            "CHRONOLOGICAL REASONING WEAK: Disease progression/regression reasoning "
            "may not fully account for temporal relationships between findings. "
        )
    
    # Composite uncertainty level
    total_uncertainty = (
        knowledge_uncertainty * 0.25 +
        image_quality_uncertainty * 0.30 +
        temporal_uncertainty * 0.20 +
        sequence_uncertainty * 0.15 +
        follow_up_uncertainty * 0.10
    )
    
    if total_uncertainty < 0.15:
        narrative_parts.append(
            f"Overall uncertainty is LOW ({total_uncertainty:.0%}). "
            "This case can be managed with standard protocols."
        )
    elif total_uncertainty < 0.30:
        narrative_parts.append(
            f"Overall uncertainty is MODERATE ({total_uncertainty:.0%}). "
            "Consider additional context if available."
        )
    else:
        narrative_parts.append(
            f"Overall uncertainty is HIGH ({total_uncertainty:.0%}). "
            "This case may benefit from 32B model review or specialist consultation."
        )
    
    return "".join(narrative_parts)


def _generate_clarification_questions(
    knowledge_uncertainty: float,
    image_quality_uncertainty: float,
    temporal_uncertainty: float,
    sequence_uncertainty: float,
    follow_up_uncertainty: float,
    cross_image_agreement: float,
    total_images_in_sequence: int,
    previous_findings: list[dict]
) -> list[str]:
    """
    Generate targeted questions that would most reduce uncertainty if answered.
    
    Prioritizes questions by uncertainty impact and feasibility of answering.
    """
    questions = []
    
    # Image quality questions
    if image_quality_uncertainty > 0.3:
        questions.append(
            "Could higher-quality images or additional imaging angles be obtained?"
        )
    
    # Sequence completion questions
    if sequence_uncertainty > 0.12 and total_images_in_sequence < 3:
        questions.append(
            f"Additional images from other angles or timepoints would strengthen the sequence "
            f"(currently {total_images_in_sequence} image(s))."
        )
    
    # Cross-image conflict questions
    if cross_image_agreement < 0.5:
        questions.append(
            "Can you clarify the relationship between findings in different images? "
            "Are they from the same session or different timepoints?"
        )
    
    # Temporal/context questions
    if temporal_uncertainty > 0.15:
        questions.append(
            "What is the timeline of presentation? When did symptoms first appear "
            "relative to when these images were taken?"
        )
        questions.append(
            "Are there prior images or consultations for comparison?"
        )
    
    # Follow-up trajectory questions
    if follow_up_uncertainty > 0.12:
        questions.append(
            "Has any treatment already started? If so, what is the patient's response so far?"
        )
        questions.append(
            "What has been the progression of clinical signs since the previous consult?"
        )
    
    # Knowledge gap questions based on specific uncertainties
    if knowledge_uncertainty > 0.2:
        # Check for specific unknown patterns
        if len(previous_findings) > 0:
            last_finding = previous_findings[-1]
            differentials = last_finding.get("differential_diagnosis", [])
            if "neoplasia" in str(differentials).lower() or "cancer" in str(differentials).lower():
                questions.append(
                    "If neoplasia is in the differential, has biopsy or cytology been considered "
                    "to establish definitive diagnosis?"
                )
            if "immune" in str(differentials).lower() or "autoimmune" in str(differentials).lower():
                questions.append(
                    "Has immune-mediated disease been confirmed with appropriate testing?"
                )
    
    # Deduplicate while preserving order
    seen = set()
    unique_questions = []
    for q in questions:
        if q not in seen:
            seen.add(q)
            unique_questions.append(q)
    
    return unique_questions[:5]  # Return top 5 most impactful questions


# =============================================================================
# Differential Evolution Over Time
# Track how the likely differential changed across images/turns
# =============================================================================

class DifferentialEvolutionRecord(BaseModel):
    """Record of how differential diagnosis evolved across a sequence."""
    position: int = Field(..., description="Position in sequence (0-indexed)")
    timestamp: str = Field(..., description="Timestamp or timepoint identifier")
    differential_at_position: list[str] = Field(..., description="Differential diagnoses at this position")
    confidence_at_position: float = Field(..., description="Confidence level at this position")
    evidence_supports: list[str] = Field(default=[], description="Evidence that supports each differential")
    evidence_contradicts: list[str] = Field(default=[], description="Evidence that contradicts each differential")
    leading_differential: str = Field(..., description="Most likely differential at this position")
    confidence_shift_from_previous: float = Field(default=0.0, description="Change in leading differential confidence")


def _track_differential_evolution(
    image_sequence: list[dict],
    findings_sequence: list[dict]
) -> list[DifferentialEvolutionRecord]:
    """
    Track how the likely differential changed across images/turns.
    
    Analyzes the evolution of differential diagnoses through a sequence
    of images or consultation turns to identify shifting patterns.
    
    Args:
        image_sequence: List of image data across the sequence
        findings_sequence: List of findings from each timepoint
    
    Returns:
        List of DifferentialEvolutionRecord showing how differential evolved
    """
    evolution = []
    
    if not findings_sequence:
        return evolution
    
    for i, finding in enumerate(findings_sequence):
        # Extract differential at this position
        differential = finding.get("differential_diagnosis", [])
        if isinstance(differential, str):
            differential = [differential]
        
        # Get confidence at this position
        confidence = finding.get("confidence", 0.5)
        
        # Get evidence for and against each differential
        evidence_supports = []
        evidence_contradicts = []
        
        # Extract supporting evidence
        supporting_evidence = finding.get("supporting_evidence", [])
        if isinstance(supporting_evidence, list):
            evidence_supports = supporting_evidence
        
        # Extract contradicting evidence
        contradicting_evidence = finding.get("contradicting_evidence", [])
        if isinstance(contradicting_evidence, list):
            evidence_contradicts = contradicting_evidence
        
        # Determine leading differential
        leading = differential[0] if differential else "unknown"
        
        # Calculate confidence shift from previous
        confidence_shift = 0.0
        if i > 0:
            prev_confidence = findings_sequence[i-1].get("confidence", 0.5)
            confidence_shift = confidence - prev_confidence
        
        # Get timestamp or generate one
        timestamp = finding.get("timestamp", finding.get("consult_timestamp", f"timepoint_{i}"))
        
        evolution.append(DifferentialEvolutionRecord(
            position=i,
            timestamp=timestamp,
            differential_at_position=differential,
            confidence_at_position=confidence,
            evidence_supports=evidence_supports,
            evidence_contradicts=evidence_contradicts,
            leading_differential=leading,
            confidence_shift_from_previous=round(confidence_shift, 3)
        ))
    
    return evolution


def _identify_confidence_shift_points(evolution: list[DifferentialEvolutionRecord]) -> list[dict]:
    """
    Identify which image/timepoint changed confidence the most.
    
    Analyzes the evolution record to find the most significant
    confidence shift points and what caused them.
    
    Returns:
        List of shift points with causes
    """
    shift_points = []
    
    for i, record in enumerate(evolution):
        if abs(record.confidence_shift_from_previous) > 0.15:  # Significant shift threshold
            shift_point = {
                "position": i,
                "timestamp": record.timestamp,
                "magnitude": abs(record.confidence_shift_from_previous),
                "direction": "increased" if record.confidence_shift_from_previous > 0 else "decreased",
                "leading_differential": record.leading_differential,
                "previous_leading": evolution[i-1].leading_differential if i > 0 else None,
                "differential_changed": record.leading_differential != evolution[i-1].leading_differential if i > 0 else False,
                "evidence_at_shift": [],
                "cause_analysis": ""
            }
            
            # Collect evidence at this shift point
            shift_point["evidence_at_shift"] = record.evidence_supports + record.evidence_contradicts
            
            # Build cause analysis
            if shift_point["differential_changed"]:
                shift_point["cause_analysis"] = (
                    f"Differential shifted from '{evolution[i-1].leading_differential}' to "
                    f"'{record.leading_differential}' with confidence change of "
                    f"{record.confidence_shift_from_previous:+.0%}. "
                    f"Evidence supporting new differential: {len(record.evidence_supports)} items. "
                    f"Evidence contradicting old differential: {len(record.evidence_contradicts)} items."
                )
            else:
                shift_point["cause_analysis"] = (
                    f"Confidence in '{record.leading_differential}' "
                    f"{'increased' if record.confidence_shift_from_previous > 0 else 'decreased'} by "
                    f"{abs(record.confidence_shift_from_previous):.0%}. "
                    f"Evidence at this point: {len(record.evidence_supports)} supporting, "
                    f"{len(record.evidence_contradicts)} contradicting."
                )
            
            shift_points.append(shift_point)
    
    # Sort by magnitude (most significant first)
    shift_points.sort(key=lambda x: x["magnitude"], reverse=True)
    
    return shift_points


def _identify_shift_cause(shift_point: dict, all_findings: list[dict]) -> str:
    """
    Identify what evidence caused the shift.
    
    Analyzes the context around a shift point to determine
    what specific evidence or factor caused the change.
    """
    position = shift_point["position"]
    if position >= len(all_findings):
        return "Unable to determine shift cause - insufficient data"
    
    finding = all_findings[position]
    
    causes = []
    
    # Check for severity changes
    if position > 0:
        prev_severity = all_findings[position-1].get("severity_score", 0.5)
        curr_severity = finding.get("severity_score", 0.5)
        if abs(curr_severity - prev_severity) > 0.2:
            causes.append(
                f"Severity change from {prev_severity:.0%} to {curr_severity:.0%} "
                f"({'increased' if curr_severity > prev_severity else 'decreased'})"
            )
    
    # Check for new evidence
    new_evidence = finding.get("new_evidence", [])
    if new_evidence:
        causes.append(f"New evidence presented: {', '.join(new_evidence[:3])}")
    
    # Check for image quality changes
    image_quality = finding.get("image_quality", "unknown")
    if image_quality in ("poor", "marginal"):
        causes.append(f"Image quality limitations ({image_quality}) may affect confidence")
    
    # Check for temporal factors
    temporal_context = finding.get("temporal_marker", "")
    if temporal_context:
        causes.append(f"Temporal context: {temporal_context}")
    
    # Check for pattern detection
    detected_pattern = finding.get("detected_pattern", "")
    if detected_pattern:
        causes.append(f"Pattern detected: {detected_pattern}")
    
    if not causes:
        return "Shift cause undetermined - no specific factor identified"
    
    return " | ".join(causes)


def _compute_most_valuable_clarification(
    evolution: list[DifferentialEvolutionRecord],
    shift_points: list[dict],
    current_uncertainty_drivers: list[str]
) -> list[dict]:
    """
    Determine what clarification question would reduce uncertainty fastest.
    
    Prioritizes clarification questions based on:
    - Which uncertainty drivers are most impactful
    - Which shift points have the most ambiguity
    - What evidence would resolve the differential
    
    Returns:
        List of prioritized clarification questions with rationale
    """
    clarifications = []
    
    # Question 1: Resolve the most uncertain differential
    if evolution:
        last_record = evolution[-1]
        if len(last_record.differential_at_position) > 1:
            clarifications.append({
                "question": f"Which differential is most likely: {', '.join(last_record.differential_at_position[:3])}?",
                "rationale": "Multiple differentials remain possible. Clarifying the leading diagnosis would significantly focus the analysis.",
                "impact": "high",
                "targets": last_record.differential_at_position[:3]
            })
    
    # Question 2: Address the biggest confidence shift
    if shift_points:
        biggest_shift = shift_points[0]
        if biggest_shift.get("differential_changed"):
            clarifications.append({
                "question": f"What evidence confirms the shift from '{biggest_shift.get('previous_leading')}' to '{biggest_shift.get('leading_differential')}'?",
                "rationale": f"Confidence shifted by {biggest_shift.get('magnitude', 0):.0%} at position {biggest_shift.get('position')}. Confirming this shift would stabilize the differential.",
                "impact": "high",
                "targets": [biggest_shift.get("leading_differential")]
            })
    
    # Question 3: Address specific uncertainty drivers
    driver_questions = {
        "knowledge_gaps": "What additional clinical history or presentation details are available?",
        "image_quality": "Can higher quality images or additional imaging angles be obtained?",
        "temporal_context": "What is the timeline of symptom progression? When did this first appear?",
        "sequence_position": "Are there additional images from other timepoints available?",
        "follow_up_trajectory": "What treatment has been attempted and what was the response?"
    }
    
    for driver in current_uncertainty_drivers[:2]:  # Top 2 drivers
        if driver in driver_questions:
            clarifications.append({
                "question": driver_questions[driver],
                "rationale": f"Primary uncertainty driver '{driver}' significantly impacts confidence. Addressing this would reduce uncertainty substantially.",
                "impact": "medium",
                "targets": [driver]
            })
    
    # Question 4: Resolve conflicting evidence
    if shift_points:
        for shift in shift_points[:2]:
            evidence_at_shift = shift.get("evidence_at_shift", [])
            if len(evidence_at_shift) > 3:
                clarifications.append({
                    "question": "Can you clarify which evidence is most reliable at this timepoint?",
                    "rationale": f"Multiple evidence items present ({len(evidence_at_shift)}). Identifying the most authoritative would help resolve conflicting signals.",
                    "impact": "medium",
                    "targets": evidence_at_shift[:3]
                })
    
    # Deduplicate and limit
    seen = set()
    unique_clarifications = []
    for c in clarifications:
        if c["question"] not in seen:
            seen.add(c["question"])
            unique_clarifications.append(c)
    
    return unique_clarifications[:4]  # Return top 4


def _build_differential_evolution_summary(
    evolution: list[DifferentialEvolutionRecord],
    shift_points: list[dict],
    clarifications: list[dict]
) -> str:
    """
    Build comprehensive natural language summary of differential evolution.
    """
    parts = []
    
    parts.append("DIFFERENTIAL EVOLUTION ANALYSIS")
    parts.append("=" * 50)
    
    if not evolution:
        parts.append("\nNo evolution data available.")
        return "\n".join(parts)
    
    # Summary of evolution
    parts.append(f"\nEVOLUTION OVER {len(evolution)} TIMEPOINTS:")
    for record in evolution:
        shift_indicator = f" ({record.confidence_shift_from_previous:+.0%})" if record.position > 0 else ""
        parts.append(
            f"  [{record.position}] {record.leading_differential}: "
            f"{record.confidence_at_position:.0%} confidence{shift_indicator}"
        )
    
    # Most significant shift
    if shift_points:
        biggest = shift_points[0]
        parts.append(f"\nMOST SIGNIFICANT SHIFT:")
        parts.append(f"  Position {biggest['position']}: {biggest['direction'].upper()}")
        parts.append(f"  Magnitude: {biggest['magnitude']:.0%}")
        parts.append(f"  Differential: {biggest.get('previous_leading', 'N/A')} → {biggest.get('leading_differential')}")
        parts.append(f"  Analysis: {biggest.get('cause_analysis', 'No analysis available')}")
    
    # Recommendations
    if clarifications:
        parts.append(f"\nTOP CLARIFICATION QUESTIONS:")
        for i, c in enumerate(clarifications[:3], 1):
            parts.append(f"  {i}. {c['question']}")
            parts.append(f"     Impact: {c['impact']} | Rationale: {c['rationale']}")
    
    return "\n".join(parts)


# =============================================================================
# Deepened Uncertainty Narration
# Explain not just that uncertainty exists, but WHY and what would CHANGE
# =============================================================================

class DeepUncertaintyNarrative(BaseModel):
    """Deep uncertainty narrative with causal explanations."""
    overall_uncertainty_level: str = Field(..., description="LOW, MODERATE, or HIGH")
    total_uncertainty_score: float = Field(..., description="0-1 composite uncertainty score")
    
    # Why uncertainty exists
    why_uncertainty_exists: str = Field(..., description="Root cause explanation")
    causal_factors: list[dict] = Field(default=[], description="Specific causal factors")
    
    # What would change the conclusion
    what_would_change_conclusion: list[str] = Field(default=[], description="What evidence would flip the conclusion")
    conclusion_flip_conditions: list[dict] = Field(default=[], description="Conditions that would flip conclusion")
    
    # What additional input is most valuable
    most_valuable_inputs: list[dict] = Field(default=[], description="Prioritized additional inputs")
    input_impact_analysis: list[str] = Field(default=[], description="Analysis of input value")
    
    # Natural language narration
    full_narrative: str = Field(..., description="Complete natural language explanation")


def _build_deep_uncertainty_narrative(
    case_context: dict,
    image_quality: str,
    previous_findings: list[dict],
    uncertainties: list[str],
    confidence: float,
    uncertainty_metrics: UncertaintyMetrics
) -> DeepUncertaintyNarrative:
    """
    Build deep uncertainty narrative explaining:
    - NOT JUST that uncertainty exists, but WHY it exists
    - What would CHANGE the conclusion
    - What additional input is MOST VALUABLE
    
    Returns:
        DeepUncertaintyNarrative with comprehensive explanations
    """
    # Calculate uncertainty components
    knowledge_uncertainty = uncertainty_metrics.knowledge_uncertainty
    image_quality_uncertainty = uncertainty_metrics.image_quality_uncertainty
    temporal_uncertainty = uncertainty_metrics.temporal_uncertainty
    sequence_uncertainty = uncertainty_metrics.sequence_uncertainty
    follow_up_uncertainty = uncertainty_metrics.follow_up_uncertainty
    
    # Composite uncertainty score
    total_uncertainty = (
        knowledge_uncertainty * 0.25 +
        image_quality_uncertainty * 0.30 +
        temporal_uncertainty * 0.20 +
        sequence_uncertainty * 0.15 +
        follow_up_uncertainty * 0.10
    )
    
    # Determine level
    if total_uncertainty < 0.15:
        level = "LOW"
    elif total_uncertainty < 0.30:
        level = "MODERATE"
    else:
        level = "HIGH"
    
    # WHY uncertainty exists
    causal_factors = []
    why_parts = []
    
    if knowledge_uncertainty > 0.15:
        causal_factors.append({
            "factor": "knowledge_gaps",
            "severity": "high" if knowledge_uncertainty > 0.3 else "medium",
            "description": "Insufficient domain knowledge to definitively resolve the differential",
            "specifics": []
        })
        why_parts.append("Knowledge gaps exist in the domain")
        if "unknown" in str(case_context).lower():
            causal_factors[-1]["specifics"].append("Generic 'unknown' markers detected in case context")
        if len(uncertainties) > 3:
            causal_factors[-1]["specifics"].append(f"{len(uncertainties)} explicit uncertainties stated")
    
    if image_quality_uncertainty > 0.2:
        causal_factors.append({
            "factor": "image_quality",
            "severity": "high" if image_quality_uncertainty > 0.4 else "medium",
            "description": f"Image quality rated as '{image_quality}' limits diagnostic confidence",
            "specifics": [f"Quality rating: {image_quality}"]
        })
        why_parts.append(f"Image quality limitations ({image_quality}) restrict confident interpretation")
    
    if temporal_uncertainty > 0.15:
        causal_factors.append({
            "factor": "temporal_context",
            "severity": "high" if temporal_uncertainty > 0.3 else "medium",
            "description": "Insufficient historical context to establish disease progression",
            "specifics": []
        })
        why_parts.append("Temporal context is insufficient to establish progression patterns")
        if not previous_findings:
            causal_factors[-1]["specifics"].append("No previous findings available")
        elif len(previous_findings) < 2:
            causal_factors[-1]["specifics"].append("Limited longitudinal history")
    
    if sequence_uncertainty > 0.12:
        causal_factors.append({
            "factor": "sequence_position",
            "severity": "high" if sequence_uncertainty > 0.2 else "medium",
            "description": "Multi-image sequence position introduces uncertainty",
            "specifics": []
        })
        why_parts.append("Image sequence position affects confidence (early images lack comparison, middle images await completion)")
        if uncertainty_metrics.cross_image_agreement_score < 0.6:
            causal_factors[-1]["specifics"].append(
                f"Cross-image agreement is low ({uncertainty_metrics.cross_image_agreement_score:.0%})"
            )
    
    if follow_up_uncertainty > 0.12:
        causal_factors.append({
            "factor": "follow_up_trajectory",
            "severity": "high" if follow_up_uncertainty > 0.2 else "medium",
            "description": "Follow-up trajectory is unclear",
            "specifics": []
        })
        why_parts.append("Follow-up trajectory ambiguity prevents confident progression assessment")
        if uncertainty_metrics.trajectory_clarity_score < 0.4:
            causal_factors[-1]["specifics"].append(
                f"Trajectory clarity is low ({uncertainty_metrics.trajectory_clarity_score:.0%})"
            )
    
    why_uncertainty_exists = ". ".join(why_parts) if why_parts else "Uncertainty sources are minimal."
    
    # WHAT would change the conclusion
    what_would_change = []
    flip_conditions = []
    
    # If knowledge gap is the issue
    if knowledge_uncertainty > 0.15:
        what_would_change.append(
            "Specific diagnostic testing or biopsy results would resolve knowledge gaps"
        )
        flip_conditions.append({
            "if": "Definitive diagnostic evidence obtained",
            "then": "Confidence would increase substantially",
            "uncertainty_reduced_by": knowledge_uncertainty * 0.4
        })
    
    # If image quality is the issue
    if image_quality_uncertainty > 0.2:
        what_would_change.append(
            "Higher quality images or additional imaging angles would reduce image quality uncertainty"
        )
        flip_conditions.append({
            "if": f"Image quality improved to 'good'",
            "then": f"Image quality uncertainty ({image_quality_uncertainty:.0%}) would be eliminated",
            "uncertainty_reduced_by": image_quality_uncertainty
        })
    
    # If cross-image agreement is low
    if uncertainty_metrics.cross_image_agreement_score < 0.5:
        what_would_change.append(
            "Clarification on whether images are from same session or different timepoints would resolve conflict"
        )
        flip_conditions.append({
            "if": "Images confirmed to be from same timepoint with consistent interpretation",
            "then": "Cross-image agreement would increase, reducing sequence uncertainty",
            "uncertainty_reduced_by": sequence_uncertainty * 0.5
        })
    
    # If temporal context is weak
    if temporal_uncertainty > 0.15:
        what_would_change.append(
            "Prior images or consultations for comparison would establish temporal baseline"
        )
        flip_conditions.append({
            "if": "Prior imaging or clinical history obtained",
            "then": "Temporal uncertainty would reduce significantly",
            "uncertainty_reduced_by": temporal_uncertainty * 0.6
        })
    
    # If trajectory is unclear
    if follow_up_uncertainty > 0.12 and uncertainty_metrics.trajectory_clarity_score < 0.4:
        what_would_change.append(
            "Clear documentation of treatment response and symptom progression would clarify trajectory"
        )
        flip_conditions.append({
            "if": "Treatment response documented with objective measures",
            "then": "Trajectory clarity would improve",
            "uncertainty_reduced_by": follow_up_uncertainty * 0.4
        })
    
    # MOST VALUABLE INPUT
    most_valuable = []
    impact_analysis = []
    
    # Prioritize based on uncertainty weights
    uncertainty_weights = {
        "image_quality": image_quality_uncertainty * 0.30,
        "temporal_context": temporal_uncertainty * 0.20,
        "knowledge": knowledge_uncertainty * 0.25,
        "sequence": sequence_uncertainty * 0.15,
        "trajectory": follow_up_uncertainty * 0.10
    }
    
    sorted_factors = sorted(uncertainty_weights.items(), key=lambda x: x[1], reverse=True)
    
    for factor, weight in sorted_factors[:3]:
        if weight < 0.05:
            continue
            
        if factor == "image_quality":
            most_valuable.append({
                "input": "Higher quality images or additional imaging angles",
                "priority": 1,
                "current_gap": f"Image quality rated as '{image_quality}'",
                "expected_impact": f"Would reduce total uncertainty by ~{image_quality_uncertainty * 0.3:.0%}"
            })
            impact_analysis.append(
                f"Image quality ({image_quality}) contributes {image_quality_uncertainty:.0%} uncertainty. "
                f"Improving quality would reduce composite uncertainty by ~{image_quality_uncertainty * 0.3:.0%}."
            )
        elif factor == "temporal_context":
            most_valuable.append({
                "input": "Prior imaging or clinical history for comparison",
                "priority": 2,
                "current_gap": "No or limited longitudinal history",
                "expected_impact": f"Would reduce total uncertainty by ~{temporal_uncertainty * 0.2:.0%}"
            })
            impact_analysis.append(
                f"Temporal context contributes {temporal_uncertainty:.0%} uncertainty. "
                f"Prior history would reduce composite uncertainty by ~{temporal_uncertainty * 0.2:.0%}."
            )
        elif factor == "knowledge":
            most_valuable.append({
                "input": "Diagnostic testing or biopsy results",
                "priority": 3,
                "current_gap": "Knowledge gaps in differential diagnosis",
                "expected_impact": f"Would reduce total uncertainty by ~{knowledge_uncertainty * 0.25:.0%}"
            })
            impact_analysis.append(
                f"Knowledge gaps contribute {knowledge_uncertainty:.0%} uncertainty. "
                f"Definitive diagnostic evidence would reduce composite uncertainty by ~{knowledge_uncertainty * 0.25:.0%}."
            )
        elif factor == "sequence":
            most_valuable.append({
                "input": "Additional images to complete the sequence",
                "priority": 4,
                "current_gap": "Multi-image sequence incomplete or inconsistent",
                "expected_impact": f"Would reduce total uncertainty by ~{sequence_uncertainty * 0.15:.0%}"
            })
            impact_analysis.append(
                f"Sequence position contributes {sequence_uncertainty:.0%} uncertainty. "
                f"Complete sequence would reduce composite uncertainty by ~{sequence_uncertainty * 0.15:.0%}."
            )
        elif factor == "trajectory":
            most_valuable.append({
                "input": "Treatment response documentation and symptom timeline",
                "priority": 5,
                "current_gap": "Follow-up trajectory unclear",
                "expected_impact": f"Would reduce total uncertainty by ~{follow_up_uncertainty * 0.10:.0%}"
            })
            impact_analysis.append(
                f"Follow-up trajectory contributes {follow_up_uncertainty:.0%} uncertainty. "
                f"Clear progression documentation would reduce composite uncertainty by ~{follow_up_uncertainty * 0.10:.0%}."
            )
    
    # BUILD FULL NARRATIVE
    full_narrative_parts = []
    
    full_narrative_parts.append(f"UNCERTAINTY ANALYSIS: {level} LEVEL (Score: {total_uncertainty:.0%})")
    full_narrative_parts.append("=" * 60)
    
    full_narrative_parts.append("\n## WHY UNCERTAINTY EXISTS")
    full_narrative_parts.append(why_uncertainty_exists)
    if causal_factors:
        full_narrative_parts.append("\nSpecific causal factors:")
        for cf in causal_factors:
            full_narrative_parts.append(f"  - [{cf['severity'].upper()}] {cf['description']}")
            for spec in cf.get("specifics", []):
                full_narrative_parts.append(f"      → {spec}")
    
    full_narrative_parts.append("\n## WHAT WOULD CHANGE THE CONCLUSION")
    if what_would_change:
        for i, w in enumerate(what_would_change, 1):
            full_narrative_parts.append(f"  {i}. {w}")
    else:
        full_narrative_parts.append("  Uncertainty is already low. Current evidence is sufficient for confident decision.")
    
    if flip_conditions:
        full_narrative_parts.append("\nConclusion flip conditions:")
        for fc in flip_conditions:
            full_narrative_parts.append(f"  → IF: {fc['if']}")
            full_narrative_parts.append(f"    THEN: {fc['then']}")
    
    full_narrative_parts.append("\n## MOST VALUABLE ADDITIONAL INPUTS")
    if most_valuable:
        for mv in most_valuable:
            full_narrative_parts.append(
                f"  [{mv['priority']}] {mv['input']} "
                f"(Current gap: {mv['current_gap']}, Expected impact: {mv['expected_impact']})"
            )
    else:
        full_narrative_parts.append("  No additional inputs identified as high-value.")
    
    full_narrative_parts.append("\n## INPUT IMPACT ANALYSIS")
    if impact_analysis:
        for ia in impact_analysis:
            full_narrative_parts.append(f"  • {ia}")
    
    full_narrative_parts.append("\n" + "=" * 60)
    full_narrative_parts.append(f"RECOMMENDATION: {'Manage with standard protocols' if level == 'LOW' else ('Consider specialist input' if level == 'MODERATE' else 'Escalate for comprehensive review')}")
    
    return DeepUncertaintyNarrative(
        overall_uncertainty_level=level,
        total_uncertainty_score=round(total_uncertainty, 3),
        why_uncertainty_exists=why_uncertainty_exists,
        causal_factors=causal_factors,
        what_would_change_conclusion=what_would_change,
        conclusion_flip_conditions=flip_conditions,
        most_valuable_inputs=most_valuable,
        input_impact_analysis=impact_analysis,
        full_narrative="\n".join(full_narrative_parts)
    )


class EnhancedCaseComparisonRequest(BaseModel):
    """Enhanced request model for comprehensive case comparison."""
    current_case: dict = Field(..., description="Current case data")
    historical_cases: list[dict] = Field(..., description="Historical cases for comparison")
    comparison_mode: str = Field(default="comprehensive", description="Comparison mode")
    include_uncertainty_analysis: bool = Field(default=True, description="Include uncertainty discipline analysis")


class EnhancedCaseComparisonResponse(BaseModel):
    """Enhanced response model for comprehensive case comparison."""
    current_case_id: str
    comparison_summary: str
    pattern_matches: list[dict]
    anomalies_detected: list[str]
    progression_indicators: dict
    risk_trajectory: str
    confidence: float
    # Enhanced fields
    uncertainty_metrics: dict
    uncertainty_discipline_score: float
    comparison_fidelity: float
    recommended_confidence_adjustment: float
    differential_evolution: list[dict] = Field(default_factory=list)
    confidence_shift_points: list[dict] = Field(default_factory=list)
    most_valuable_clarifications: list[dict] = Field(default_factory=list)
    deep_uncertainty_narrative: dict = Field(default_factory=dict)
    evolution_summary: str = Field(default="", description="Natural-language summary of how the differential evolved")
    # Phase 5: Enhanced longitudinal reasoning fields
    confidence_shift_narrative: dict = Field(
        default_factory=dict,
        description="Phase 5: Natural-language explanation of what changed confidence most"
    )
    highest_value_next_question: dict = Field(
        default_factory=dict,
        description="Phase 5: Which clarification question would most reduce uncertainty"
    )


@app.post("/compare-cases/enhanced", response_model=EnhancedCaseComparisonResponse)
async def enhanced_case_comparison(
    payload: EnhancedCaseComparisonRequest,
    authorization: str | None = Header(default=None),
):
    """
    Enhanced case comparison with stronger uncertainty discipline.
    
    Provides comprehensive comparison including:
    - Pattern matching across historical cases
    - Anomaly detection
    - Progression indicators
    - Uncertainty discipline analysis
    - Confidence calibration
    """
    validate_auth(authorization)
    
    current_case = payload.current_case
    historical_cases = payload.historical_cases
    comparison_mode = payload.comparison_mode
    include_uncertainty = payload.include_uncertainty_analysis
    
    current_case_id = current_case.get("case_id", "unknown")
    
    # Compute base comparison metrics
    pattern_matches = []
    anomalies_detected = []
    progression_indicators = {"direction": "stable", "magnitude": 0.0, "confidence": 0.5}
    
    # Enhanced temporal analysis
    if len(historical_cases) >= 2 and comparison_mode in ["temporal", "comprehensive"]:
        sorted_cases = sorted(historical_cases, key=lambda x: x.get("date", ""), reverse=True)
        
        # Compare severity progression
        severity_timeline = []
        for case in sorted_cases:
            sev = case.get("severity", "unknown").lower()
            severity_timeline.append(sev)
        
        if len(severity_timeline) >= 2:
            direction = _infer_progression_direction(severity_timeline)
            progression_indicators = {
                "direction": direction,
                "magnitude": len(set(severity_timeline)),
                "timeline_points": len(severity_timeline),
                "timeline": severity_timeline,
                "confidence": 0.8 if len(severity_timeline) >= 3 else 0.5
            }
            
            # Detect anomalies in progression
            if direction == "improving" and current_case.get("severity", "").lower() in ["high", "critical"]:
                anomalies_detected.append("Severity appears improving but current case is high/critical - verify data consistency")
            elif direction == "progressing":
                anomalies_detected.append(f"Progressive deterioration detected across {len(severity_timeline)} time points")
    
    # Cross-sectional pattern matching
    if comparison_mode in ["cross-sectional", "pattern", "comprehensive"]:
        # Domain-based patterns
        same_domain = [c for c in historical_cases if c.get("domain") == current_case.get("domain")]
        if same_domain:
            pattern_matches.append({
                "pattern_type": "domain_association",
                "match_count": len(same_domain),
                "description": f"{len(same_domain)} cases with same domain ({current_case.get('domain')})",
                "confidence": min(0.9, 0.5 + len(same_domain) * 0.1)
            })
        
        # Body region patterns
        same_region = [c for c in historical_cases if c.get("body_region") == current_case.get("body_region")]
        if same_region:
            pattern_matches.append({
                "pattern_type": "body_region_association",
                "match_count": len(same_region),
                "description": f"{len(same_region)} cases with same body region",
                "confidence": min(0.9, 0.5 + len(same_region) * 0.1)
            })
        
        # Severity cluster patterns
        same_severity = [c for c in historical_cases if c.get("severity") == current_case.get("severity")]
        if same_severity:
            pattern_matches.append({
                "pattern_type": "severity_cluster",
                "match_count": len(same_severity),
                "description": f"{len(same_severity)} cases with same severity",
                "confidence": min(0.9, 0.5 + len(same_severity) * 0.1)
            })
    
    # Risk trajectory
    risk_trajectory = _assess_risk_trajectory(current_case, historical_cases)
    
    # Base confidence
    confidence = min(0.9, 0.5 + len(historical_cases) * 0.05)
    
    # Enhanced uncertainty discipline analysis
    uncertainty_metrics = {}
    uncertainty_discipline_score = 0.5
    comparison_fidelity = 0.5
    recommended_confidence_adjustment = 0.0
    differential_evolution: list[dict] = []
    confidence_shift_points: list[dict] = []
    most_valuable_clarifications: list[dict] = []
    deep_uncertainty_narrative: dict = {}
    evolution_summary = ""
    # Phase 5: Enhanced longitudinal reasoning
    confidence_shift_narrative: dict = {}
    highest_value_next_question: dict = {}
    
    if include_uncertainty:
        # Extract uncertainty sources
        case_context = current_case.get("context", {})
        image_quality = current_case.get("image_quality", current_case.get("imageQuality", "unknown"))
        previous_findings = current_case.get("previous_findings", [])
        uncertainties = current_case.get("uncertainties", [])
        reported_confidence = current_case.get("confidence", 0.7)
        temporal_context = current_case.get("temporal_context") or current_case.get("case_temporal_context")
        
        uncertainty_metrics = _compute_uncertainty_metrics(
            case_context,
            image_quality,
            previous_findings,
            uncertainties,
            reported_confidence,
            image_sequence_position=max(len(historical_cases), 0),
            total_images_in_sequence=max(len(historical_cases) + 1, 1),
            case_temporal_context=temporal_context,
        )

        sequence_cases = sorted(
            [*historical_cases, current_case],
            key=lambda case: case.get("date")
            or case.get("timestamp")
            or case.get("consult_timestamp")
            or "",
        )
        findings_sequence = [case.get("findings", case) for case in sequence_cases]
        evolution_models = _track_differential_evolution(sequence_cases, findings_sequence)
        differential_evolution = [record.model_dump() for record in evolution_models]
        confidence_shift_points = _identify_confidence_shift_points(evolution_models)
        for shift_point in confidence_shift_points:
            shift_point["shift_cause"] = _identify_shift_cause(shift_point, findings_sequence)

        most_valuable_clarifications = _compute_most_valuable_clarification(
            evolution_models,
            confidence_shift_points,
            uncertainty_metrics.primary_uncertainty_drivers,
        )
        evolution_summary = _build_differential_evolution_summary(
            evolution_models,
            confidence_shift_points,
            most_valuable_clarifications,
        )
        
        # Phase 5: Enhanced longitudinal reasoning - confidence shift narrative
        differential_evolution_dicts = [dict(record) for record in evolution_models]
        confidence_shift_narrative = _build_confidence_shift_narrative(
            differential_evolution_dicts,
            confidence_shift_points,
            uncertainties,
        )
        
        # Phase 5: Highest value next question tied to differential evolution
        highest_value_question = _compute_highest_value_next_question(
            differential_evolution_dicts,
            confidence_shift_points,
            uncertainty_metrics.primary_uncertainty_drivers,
            confidence,
        )
        
        deep_uncertainty_narrative = _build_deep_uncertainty_narrative(
            case_context,
            image_quality,
            previous_findings,
            uncertainties,
            reported_confidence,
            uncertainty_metrics,
        ).model_dump()
        
        # Compute comparison fidelity - how reliable is this comparison?
        if len(historical_cases) >= 3:
            comparison_fidelity = min(0.9, 0.4 + len(historical_cases) * 0.15)
        else:
            comparison_fidelity = 0.3 + len(historical_cases) * 0.1
        
        # Compute uncertainty discipline score
        uncertainty_discipline_score = (
            uncertainty_metrics.confidence_calibration * 0.4 +
            (1.0 - uncertainty_metrics.knowledge_uncertainty) * 0.2 +
            (1.0 - uncertainty_metrics.image_quality_uncertainty) * 0.2 +
            (1.0 - uncertainty_metrics.temporal_uncertainty) * 0.2
        )
        
        # Recommend confidence adjustment based on uncertainty
        if uncertainty_metrics.knowledge_uncertainty > 0.4:
            recommended_confidence_adjustment = -0.1
        if uncertainty_metrics.image_quality_uncertainty > 0.4:
            recommended_confidence_adjustment = max(recommended_confidence_adjustment, -0.15)
        if uncertainty_metrics.temporal_uncertainty > 0.3:
            recommended_confidence_adjustment = max(recommended_confidence_adjustment, -0.1)
    
    return EnhancedCaseComparisonResponse(
        current_case_id=current_case_id,
        comparison_summary=f"Enhanced comparison of current case against {len(historical_cases)} historical cases using {comparison_mode} analysis with uncertainty discipline.",
        pattern_matches=pattern_matches,
        anomalies_detected=anomalies_detected,
        progression_indicators=progression_indicators,
        risk_trajectory=risk_trajectory,
        confidence=round(confidence, 3),
        uncertainty_metrics=uncertainty_metrics.model_dump() if isinstance(uncertainty_metrics, UncertaintyMetrics) else uncertainty_metrics,
        uncertainty_discipline_score=round(uncertainty_discipline_score, 3),
        comparison_fidelity=round(comparison_fidelity, 3),
        recommended_confidence_adjustment=round(recommended_confidence_adjustment, 3),
        differential_evolution=differential_evolution,
        confidence_shift_points=confidence_shift_points,
        most_valuable_clarifications=most_valuable_clarifications,
        deep_uncertainty_narrative=deep_uncertainty_narrative,
        evolution_summary=evolution_summary,
        # Phase 5: Enhanced longitudinal reasoning
        confidence_shift_narrative=confidence_shift_narrative,
        highest_value_next_question=highest_value_question,
    )


# =============================================================================
# Phase 5: Enhanced Longitudinal Reasoning
# =============================================================================

def _build_confidence_shift_narrative(
    evolution: list[dict],
    shift_points: list[dict],
    uncertainties: list[str]
) -> dict[str, Any]:
    """
    Build Phase 5 natural-language narrative explaining what changed confidence most
    and what evidence caused the shift.
    
    Produces:
    - primary_shift_narrative: What changed confidence most
    - evidence_causing_shift: What evidence caused the largest shift
    - secondary_shifts: Other significant shifts
    - natural_language_summary: Comprehensive explanation
    """
    narrative = {
        "primary_shift_narrative": "",
        "evidence_causing_shift": [],
        "secondary_shifts": [],
        "natural_language_summary": "",
        "largest_shift_magnitude": 0.0,
        "largest_shift_direction": "none",
    }
    
    if not shift_points:
        narrative["primary_shift_narrative"] = (
            "No significant confidence shifts detected across the consultation sequence. "
            "Confidence remained stable, indicating consistent diagnostic reasoning."
        )
        narrative["natural_language_summary"] = narrative["primary_shift_narrative"]
        return narrative
    
    # Primary shift (largest magnitude)
    primary = shift_points[0]
    narrative["largest_shift_magnitude"] = primary["magnitude"]
    narrative["largest_shift_direction"] = primary["direction"]
    
    # Build primary narrative
    if primary["differential_changed"]:
        narrative["primary_shift_narrative"] = (
            f"The largest confidence shift ({primary['magnitude']:+.0%}) occurred at timepoint {primary['position']}. "
            f"The leading differential changed from '{primary.get('previous_leading', 'N/A')}' "
            f"to '{primary.get('leading_differential', 'N/A')}'. "
            f"{primary.get('cause_analysis', '')}"
        )
    else:
        narrative["primary_shift_narrative"] = (
            f"The largest confidence shift ({primary['magnitude']:+.0%}) occurred at timepoint {primary['position']}. "
            f"Confidence in '{primary.get('leading_differential', 'unknown')}' "
            f"{primary['direction']} without a differential change. "
            f"{primary.get('cause_analysis', '')}"
        )
    
    # Evidence causing shift
    evidence = primary.get("evidence_at_shift", [])
    if evidence:
        narrative["evidence_causing_shift"] = evidence[:3]  # Top 3 pieces of evidence
    
    # Secondary shifts
    if len(shift_points) > 1:
        for shift in shift_points[1:3]:  # Next 2 most significant
            secondary = {
                "position": shift["position"],
                "magnitude": shift["magnitude"],
                "direction": shift["direction"],
                "differential": shift.get("leading_differential", "unknown"),
                "summary": f"Shift of {shift['magnitude']:+.0%} at position {shift['position']}"
            }
            narrative["secondary_shifts"].append(secondary)
    
    # Full natural language summary
    n_shifts = len(shift_points)
    if n_shifts == 1:
        narrative["natural_language_summary"] = (
            f"One significant confidence shift detected. "
            f"{narrative['primary_shift_narrative']} "
            f"{len(evidence)} evidence items contributed to this shift."
        )
    else:
        narrative["natural_language_summary"] = (
            f"{n_shifts} significant confidence shifts detected across the consultation sequence. "
            f"Primary shift ({primary['magnitude']:+.0%}): {narrative['primary_shift_narrative']} "
            f"Secondary shifts: {'; '.join(s['summary'] for s in narrative['secondary_shifts'])}. "
            f"This pattern suggests {'rapid diagnostic refinement' if primary['direction'] == 'increased' else 'emerging diagnostic complexity'} "
            f"as the consultation progressed."
        )
    
    return narrative


def _compute_highest_value_next_question(
    evolution: list[dict],
    shift_points: list[dict],
    uncertainty_drivers: list[str],
    current_confidence: float
) -> dict[str, Any]:
    """
    Phase 5: Compute which single clarification question would most reduce
    uncertainty, directly tied to the differential evolution pattern.
    
    Returns:
    - question: The highest value question
    - rationale: Why this question specifically
    - estimated_uncertainty_reduction: Expected improvement (0-1)
    - tied_to_shift: Which confidence shift this addresses
    """
    result = {
        "question": "",
        "rationale": "",
        "estimated_uncertainty_reduction": 0.0,
        "tied_to_shift": None,
        "category": "unknown",
    }
    
    if not shift_points and not uncertainty_drivers:
        result["question"] = "What additional clinical context or history can be provided to refine the differential diagnosis?"
        result["rationale"] = "No specific uncertainty drivers identified. General context clarification recommended."
        result["estimated_uncertainty_reduction"] = 0.15
        return result
    
    # Primary shift analysis
    if shift_points:
        primary = shift_points[0]
        shift_position = primary["position"]
        shift_direction = primary["direction"]
        differential = primary.get("leading_differential", "")
        
        # If confidence increased, we understood something - ask about what we might have missed
        if shift_direction == "increased":
            result["question"] = (
                f"Can you provide additional context about '{differential}' that would confirm "
                f"this diagnosis? Specifically, any relevant history or progression details?"
            )
            result["rationale"] = (
                f"Confidence increased when '{differential}' emerged. "
                f"Confirming evidence would solidify this shift and reduce remaining uncertainty."
            )
            result["estimated_uncertainty_reduction"] = 0.20
            result["tied_to_shift"] = f"position_{shift_position}_{differential}"
            result["category"] = "confidence_building"
        
        # If confidence decreased, we're uncertain - ask what we need to know
        else:
            result["question"] = (
                f"What additional findings or history would help distinguish between "
                f"competing differentials at the current timepoint?"
            )
            result["rationale"] = (
                f"Confidence decreased at position {shift_position}, indicating emerging uncertainty. "
                f"Clarification would help resolve the competing diagnostic possibilities."
            )
            result["estimated_uncertainty_reduction"] = 0.25
            result["tied_to_shift"] = f"position_{shift_position}_uncertainty"
            result["category"] = "uncertainty_resolution"
    
    # Tie to specific uncertainty drivers
    if uncertainty_drivers and result["estimated_uncertainty_reduction"] < 0.2:
        top_driver = uncertainty_drivers[0] if uncertainty_drivers else "knowledge_gaps"
        
        driver_question_map = {
            "knowledge_gaps": "Can additional diagnostic testing (biopsy, cytology, bloodwork) be performed to address knowledge gaps?",
            "image_quality": "Can higher quality or additional imaging angles be obtained?",
            "temporal_context": "What is the timeline of symptom progression? When did changes first appear?",
            "sequence_position": "Are there additional images from other timepoints for comparison?",
            "follow_up_trajectory": "Has any treatment been initiated? What has been the response so far?",
        }
        
        result["question"] = driver_question_map.get(top_driver, driver_question_map["knowledge_gaps"])
        result["rationale"] = (
            f"Primary uncertainty driver is '{top_driver.replace('_', ' ')}'. "
            f"Addressing this specific gap would have the highest impact on reducing uncertainty."
        )
        result["estimated_uncertainty_reduction"] = 0.18
        result["category"] = f"driver_specific_{top_driver}"
    
    # Confidence-based adjustment
    if current_confidence < 0.5 and result["estimated_uncertainty_reduction"] < 0.25:
        result["estimated_uncertainty_reduction"] = 0.25
        result["question"] = (
            "Given low confidence, what is the most urgent clinical concern to address first?"
        )
        result["rationale"] = (
            "Current confidence is low. Prioritizing the most urgent concern would "
            "provide the clearest path forward."
        )
    
    return result


@app.get("/uncertainty/discipline-report")
async def get_uncertainty_discipline_report(
    authorization: str | None = Header(default=None),
):
    """
    Generate a report on uncertainty discipline across recent consults.
    
    Returns aggregated statistics on how well uncertainty is being
    communicated and calibrated across the service.
    """
    validate_auth(authorization)
    
    # This would typically analyze recent consults
    # For now, return structure for future implementation
    return {
        "report_type": "uncertainty_discipline",
        "description": "Aggregated uncertainty discipline metrics across consults",
        "metrics_collected": [
            "knowledge_uncertainty_avg",
            "image_quality_uncertainty_avg",
            "temporal_uncertainty_avg",
            "confidence_calibration_avg",
            "discipline_compliance_rate"
        ],
        "note": "Implement analytics by tracking consult responses over time"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)
