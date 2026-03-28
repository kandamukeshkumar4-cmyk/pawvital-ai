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
import torch
from transformers import AutoProcessor, AutoModelForVision2Seq
from qwen_vl_utils import process_vision_info


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
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
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
    
    if include_uncertainty:
        # Extract uncertainty sources
        case_context = current_case.get("context", {})
        image_quality = current_case.get("image_quality", current_case.get("imageQuality", "unknown"))
        previous_findings = current_case.get("previous_findings", [])
        uncertainties = current_case.get("uncertainties", [])
        reported_confidence = current_case.get("confidence", 0.7)
        
        uncertainty_metrics = _compute_uncertainty_metrics(
            case_context, image_quality, previous_findings, uncertainties, reported_confidence
        )
        
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
        uncertainty_metrics=uncertainty_metrics,
        uncertainty_discipline_score=round(uncertainty_discipline_score, 3),
        comparison_fidelity=round(comparison_fidelity, 3),
        recommended_confidence_adjustment=round(recommended_confidence_adjustment, 3)
    )


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
