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
    """Metrics for quantifying and qualifying uncertainty in consults."""
    knowledge_uncertainty: float = Field(..., description="0-1 score for gaps in domain knowledge")
    image_quality_uncertainty: float = Field(..., description="0-1 score for image quality limitations")
    temporal_uncertainty: float = Field(..., description="0-1 score for insufficient historical context")
    confidence_calibration: float = Field(..., description="How well confidence matches actual accuracy")
    uncertainty_disciplined: bool = Field(..., description="Whether uncertainty was properly communicated")


def _compute_uncertainty_metrics(
    case_context: dict,
    image_quality: str,
    previous_findings: list[dict],
    uncertainties: list[str],
    confidence: float
) -> UncertaintyMetrics:
    """
    Compute disciplined uncertainty metrics for a consult.
    
    Quantifies and qualifies different sources of uncertainty to ensure
    proper calibration and communication.
    """
    # Knowledge uncertainty - gaps in what the model knows
    knowledge_uncertainty = 0.0
    if "unknown" in str(case_context).lower():
        knowledge_uncertainty += 0.2
    if len(uncertainties) > 3:
        knowledge_uncertainty += min(0.3, (len(uncertainties) - 3) * 0.1)
    
    # Image quality uncertainty
    image_quality_uncertainty = 0.0
    quality_map = {"good": 0.0, "adequate": 0.2, "poor": 0.5, "marginal": 0.4, "unknown": 0.3}
    image_quality_uncertainty = quality_map.get(image_quality.lower(), 0.3)
    
    # Temporal uncertainty - insufficient historical context
    temporal_uncertainty = 0.0
    if not previous_findings:
        temporal_uncertainty = 0.4
    elif len(previous_findings) < 2:
        temporal_uncertainty = 0.2
    
    # Confidence calibration - does reported confidence match uncertainty sources?
    expected_confidence = 1.0 - (knowledge_uncertainty * 0.3 + image_quality_uncertainty * 0.4 + temporal_uncertainty * 0.3)
    confidence_calibration = 1.0 - abs(confidence - expected_confidence)
    
    # Uncertainty discipline - were uncertainties properly communicated?
    uncertainty_disciplined = (
        len(uncertainties) >= 1 and
        knowledge_uncertainty < 0.5 and
        image_quality_uncertainty < 0.6
    )
    
    return UncertaintyMetrics(
        knowledge_uncertainty=round(knowledge_uncertainty, 3),
        image_quality_uncertainty=round(image_quality_uncertainty, 3),
        temporal_uncertainty=round(temporal_uncertainty, 3),
        confidence_calibration=round(max(0.0, confidence_calibration), 3),
        uncertainty_disciplined=uncertainty_disciplined
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
