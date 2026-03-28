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
from typing import Optional
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
    Build a comprehensive prompt for thorough async review.
    
    The 32B model has more capacity for nuanced analysis, so we can:
    1. Ask for more detailed disagreement analysis
    2. Request explicit confidence calibration
    3. Ask for differential diagnostic considerations
    4. Request follow-up question recommendations
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

IMPORTANT: You are NOT the authority. The clinical matrix makes final triage decisions. 
Your role is to provide deep specialist insight that may inform, but never override, the clinical matrix.

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

=== YOUR TASK ===

Conduct a THOROUGH specialist review using your full 32B model capacity.

Provide a comprehensive structured review with these fields:
- "summary": A detailed 3-4 sentence specialist assessment
- "agreements": Specific points where your view CONFIRMS the clinical matrix (with explanations)
- "disagreements": Points where your view DIVERGES (advisory only, flag explicitly)
- "uncertainties": Areas where you lack confident opinion OR image quality limits assessment
- "confidence": Float 0.0-1.0 indicating your overall review confidence
- "differential_considerations": Other conditions that could present similarly (array of strings)
- "recommended_followup": Questions that would strengthen the assessment (array of strings)

Be thorough in disagreements and uncertainties. The 32B model has capacity for nuanced analysis.
If image quality limits your assessment, state this explicitly with specific concerns.

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.
"""
    
    return prompt


def parse_model_response(content: str) -> dict:
    """Parse the model's JSON response with comprehensive fallback handling."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        import re
        # Try to find JSON object in response
        json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Fallback
        return {
            "summary": content[:500] if content else "Unable to generate review.",
            "agreements": [],
            "disagreements": [],
            "uncertainties": ["Failed to parse structured response from model"],
            "confidence": 0.3,
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
    """Background task to process review and store result."""
    case_id = generate_case_id(request)
    try:
        result = await generate_review(request, case_id)
        REVIEW_RESULTS[case_id] = result
        
        # Remove from processing queue
        if case_id in PROCESSING_QUEUE:
            PROCESSING_QUEUE.remove(case_id)
        
        # Callback if URL provided
        if request.callback_url:
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    await client.post(request.callback_url, json=result.model_dump())
            except Exception as e:
                logger.error("Callback failed for case %s", case_id, exc_info=e)
                
    except Exception as e:
        logger.error("Processing error for case %s", case_id, exc_info=e)
        if case_id in PROCESSING_QUEUE:
            PROCESSING_QUEUE.remove(case_id)


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
    """Health check endpoint."""
    return {
        "ok": True,
        "service": "async-review-service",
        "mode": "stub" if STUB_MODE else "production",
        "model": MODEL_NAME,
        "device": DEVICE,
        "queue_size": len(PROCESSING_QUEUE),
        "results_cached": len(REVIEW_RESULTS),
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
    
    if case_id in REVIEW_RESULTS:
        return REVIEW_RESULTS[case_id]
    
    if case_id in PROCESSING_QUEUE:
        return JSONResponse({
            "status": "processing",
            "case_id": case_id,
            "message": "Review still in progress. Check back shortly.",
        })
    
    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


@app.get("/reviews")
async def list_reviews(limit: int = 10):
    """List recent review results."""
    recent = list(REVIEW_RESULTS.values())[-limit:]
    return {
        "reviews": [r.model_dump() for r in recent],
        "total": len(REVIEW_RESULTS),
        "queue_size": len(PROCESSING_QUEUE),
    }


@app.delete("/reviews/{case_id}")
async def delete_review(case_id: str):
    """Delete a stored review result."""
    if case_id in REVIEW_RESULTS:
        del REVIEW_RESULTS[case_id]
        return {"ok": True, "message": f"Review {case_id} deleted"}
    
    if case_id in PROCESSING_QUEUE:
        PROCESSING_QUEUE.remove(case_id)
        return {"ok": True, "message": f"Queued review {case_id} cancelled"}
    
    raise HTTPException(status_code=404, detail=f"Case {case_id} not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
