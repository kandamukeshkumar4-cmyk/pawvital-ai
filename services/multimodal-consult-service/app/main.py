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


class ConsultResponse(BaseModel):
    model: str
    summary: str
    agreements: list[str]
    disagreements: list[str]
    uncertainties: list[str]
    confidence: float
    mode: str = "sync"


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
    Build a structured prompt for veterinary image consult.
    
    The model receives:
    1. Preprocess results (detected regions, domain, body region, quality)
    2. Owner description
    3. Severity from clinical matrix
    4. Known contradictions
    5. Deterministic facts
    
    The model must respond with structured analysis that:
    - AGREE: points where specialist view confirms the clinical matrix assessment
    - DISAGREE: points where specialist view diverges (flagged as uncertainty)
    - UNCERTAINTIES: areas where specialist cannot provide confident opinion
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
    
    prompt = f"""You are a veterinary specialist providing an additive second opinion on a clinical image case.

IMPORTANT: You are NOT the authority. The clinical matrix makes final triage decisions. 
Your role is to provide specialist insight that may inform, but never override, the clinical matrix.

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

=== YOUR TASK ===

Analyze this case as a veterinary specialist and provide a structured consult opinion.

Format your response as a JSON object with these fields:
- "summary": A 2-3 sentence specialist assessment of the image findings
- "agreements": Points where your specialist view CONFIRMS the clinical matrix assessment (array of strings)
- "disagreements": Points where your specialist view DIVERGES from the clinical matrix (array of strings) - these are advisory only
- "uncertainties": Areas where you cannot provide a confident specialist opinion (array of strings)
- "confidence": A float between 0.0 and 1.0 indicating your confidence in this consult

Focus on:
1. Image-based findings (lesion morphology, distribution patterns, severity indicators)
2. Consistency between image findings and reported symptoms
3. Red flags that the clinical matrix should be aware of
4. Breed-specific considerations where relevant

Be conservative with disagreements - only flag genuine specialist concerns.
If image quality limits your assessment, state this clearly in uncertainties.

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.
"""
    
    return prompt


def parse_model_response(content: str) -> dict:
    """Parse the model's JSON response with fallback handling."""
    try:
        # Try direct JSON parse
        return json.loads(content)
    except json.JSONDecodeError:
        # Try to extract JSON from content
        import re
        json_match = re.search(r'\{[^{}]*\}', content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Fallback to minimal structure
        return {
            "summary": content[:500] if content else "Unable to generate consult summary.",
            "agreements": [],
            "disagreements": [],
            "uncertainties": ["Failed to parse structured response from model"],
            "confidence": 0.3
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8083)
