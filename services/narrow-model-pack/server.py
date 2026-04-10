"""
Narrow Model Pack Server — VET-915

FastAPI server that serves the 4 essential text models via vLLM:
  - extraction:  qwen/qwen3.5-122b-a10b
  - phrasing:    meta/llama-3.3-70b-instruct
  - diagnosis:   nvidia/llama-3.1-nemotron-ultra-253b-v1
  - safety:      z-ai/glm5

This server lazy-loads one model role at a time to keep GPU memory bounded and
provides an OpenAI-compatible API at /v1/chat/completions.

Usage:
  python server.py --port 8085

Environment:
  SIDECAR_API_KEY      Bearer token for auth
  NARROW_PACK_MODELS   JSON dict of role -> model_id
"""

import gc
import json
import os
import time
from typing import Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SIDECAR_API_KEY = os.environ.get("SIDECAR_API_KEY", "")
NARROW_PACK_MODELS = json.loads(os.environ.get("NARROW_PACK_MODELS", "{}"))

# Default model mapping if not provided via env
DEFAULT_MODELS = {
    "extraction": "qwen/qwen3.5-122b-a10b",
    "phrasing": "meta/llama-3.3-70b-instruct",
    "diagnosis": "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "safety": "z-ai/glm5",
}

MODEL_MAPPING = NARROW_PACK_MODELS or DEFAULT_MODELS

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="PawVital Narrow Model Pack", version="1.0.0")

# Track model loading state. Only one large model should be resident at once.
loaded_models: Dict[str, object] = {}
model_load_errors: Dict[str, str] = {}


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------

@app.middleware("http")
async def authenticate(request: Request, call_next):
    """Verify SIDECAR_API_KEY bearer token."""
    if request.url.path == "/healthz":
        return await call_next(request)

    if not SIDECAR_API_KEY:
        return await call_next(request)

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != SIDECAR_API_KEY:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    return await call_next(request)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/healthz")
async def healthz():
    """Health check endpoint for RunPod."""
    return {
        "status": "ok",
        "service": "narrow-model-pack",
        "models_loaded": len(loaded_models),
        "active_model_role": next(iter(loaded_models.keys()), None),
        "model_errors": model_load_errors,
        "models_configured": list(MODEL_MAPPING.keys()),
    }


# ---------------------------------------------------------------------------
# OpenAI-compatible chat completions
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 1024
    temperature: Optional[float] = 0.7
    top_p: Optional[float] = 0.9
    stream: Optional[bool] = False


class ChatCompletionResponse(BaseModel):
    id: str
    object: str
    created: int
    model: str
    choices: List[Dict]
    usage: Dict[str, int]


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    """
    OpenAI-compatible chat completions endpoint.
    Routes to the appropriate model based on the model name or role hint.
    """
    # Find which local model matches the requested model
    target_model = None
    target_role = None

    # Check if model name matches any of our loaded models
    for role, model_id in MODEL_MAPPING.items():
        if req.model == model_id or req.model.endswith(model_id.split("/")[-1]):
            target_model = model_id
            target_role = role
            break

    # If no direct match, try to infer role from model name patterns
    if target_model is None:
        if "qwen" in req.model.lower():
            target_role = "extraction"
            target_model = MODEL_MAPPING.get("extraction")
        elif "llama" in req.model.lower() and "nemotron" not in req.model.lower():
            target_role = "phrasing"
            target_model = MODEL_MAPPING.get("phrasing")
        elif "nemotron" in req.model.lower():
            target_role = "diagnosis"
            target_model = MODEL_MAPPING.get("diagnosis")
        elif "glm" in req.model.lower():
            target_role = "safety"
            target_model = MODEL_MAPPING.get("safety")

    if target_model is None or target_role is None:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{req.model}' not served by this narrow pack. "
                   f"Served models: {list(MODEL_MAPPING.values())}"
        )

    llm = _get_model_for_role(target_role, target_model)

    try:
        from vllm import SamplingParams

        # Convert messages to prompt format
        prompt = _format_messages(req.messages)

        # Set sampling parameters
        sampling_params = SamplingParams(
            temperature=req.temperature or 0.7,
            top_p=req.top_p or 0.9,
            max_tokens=req.max_tokens or 1024,
        )

        # Generate
        outputs = llm.generate([prompt], sampling_params)
        generated_text = outputs[0].outputs[0].text

        # Build OpenAI-compatible response
        response_id = f"chatcmpl-{int(time.time())}"
        return ChatCompletionResponse(
            id=response_id,
            object="chat.completion",
            created=int(time.time()),
            model=target_model,
            choices=[{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": generated_text.strip(),
                },
                "finish_reason": "stop",
            }],
            usage={
                "prompt_tokens": len(prompt) // 4,  # rough estimate
                "completion_tokens": len(generated_text) // 4,
                "total_tokens": (len(prompt) + len(generated_text)) // 4,
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _format_messages(messages: List[ChatMessage]) -> str:
    """Convert OpenAI message format to text prompt."""
    prompt_parts = []
    for msg in messages:
        if msg.role == "system":
            prompt_parts.append(f"System: {msg.content}")
        elif msg.role == "user":
            prompt_parts.append(f"User: {msg.content}")
        elif msg.role == "assistant":
            prompt_parts.append(f"Assistant: {msg.content}")
    return "\n".join(prompt_parts) + "\nAssistant: "


def _build_llm(model_id: str):
    """Build a vLLM instance sized for the model family."""
    try:
        from vllm import LLM
    except ImportError:
        raise RuntimeError("vLLM not installed. Run: pip install vllm") from None

    if "253b" in model_id or "397b" in model_id:
        return LLM(
            model=model_id,
            tensor_parallel_size=2,
            gpu_memory_utilization=0.9,
            max_model_len=4096,
            trust_remote_code=True,
        )

    if "122b" in model_id or "70b" in model_id:
        return LLM(
            model=model_id,
            tensor_parallel_size=2,
            gpu_memory_utilization=0.85,
            max_model_len=4096,
            trust_remote_code=True,
        )

    return LLM(
        model=model_id,
        gpu_memory_utilization=0.8,
        max_model_len=4096,
        trust_remote_code=True,
    )


def _release_loaded_models() -> None:
    """Release the previous vLLM instance before loading another large model."""
    if not loaded_models:
        return

    loaded_models.clear()
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _get_model_for_role(role: str, model_id: str):
    """Return the active model, loading it lazily if the role changed."""
    if role in loaded_models:
        return loaded_models[role]

    _release_loaded_models()
    print(f"[narrow-pack] Loading {role}: {model_id}")
    try:
        llm = _build_llm(model_id)
    except Exception as exc:
        model_load_errors[role] = str(exc)
        print(f"[narrow-pack] ERROR loading {role}: {exc}")
        raise HTTPException(
            status_code=503,
            detail=f"Model '{model_id}' ({role}) could not be loaded: {exc}",
        ) from exc

    loaded_models[role] = llm
    model_load_errors.pop(role, None)
    print(f"[narrow-pack] {role} loaded successfully: {model_id}")
    return llm


# ---------------------------------------------------------------------------
# Model info endpoint
# ---------------------------------------------------------------------------

@app.get("/v1/models")
async def list_models():
    """List available models."""
    return {
        "object": "list",
        "data": [
            {
                "id": model_id,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "pawvital",
                "role": role,
                "loaded": role in loaded_models,
            }
            for role, model_id in MODEL_MAPPING.items()
        ],
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="PawVital Narrow Model Pack Server")
    parser.add_argument("--port", type=int, default=8085, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to listen on")
    args = parser.parse_args()

    print(f"[narrow-pack] Starting server on {args.host}:{args.port}")
    print(f"[narrow-pack] Models: {list(MODEL_MAPPING.keys())}")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
