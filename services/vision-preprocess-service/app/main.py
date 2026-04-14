from __future__ import annotations

import base64
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from io import BytesIO
from typing import Any, Callable, TypeVar

import requests
from fastapi import FastAPI, Header, HTTPException
from PIL import Image, ImageOps
from pydantic import BaseModel, Field

from .models import FlorenceCaptioner, GroundingDinoDetector, Sam2Segmenter
from .models.fallback import (
    build_heuristic_localization,
    classify_quality,
    encode_crop,
    infer_body_region,
    infer_domain,
)


MODEL_LABELS = ("wound", "rash", "lesion", "paw", "eye", "ear", "skin")
LABEL_TO_DOMAIN = {
    "eye": "eye",
    "ear": "ear",
    "paw": "skin_wound",
    "skin": "skin_wound",
    "wound": "skin_wound",
    "rash": "skin_wound",
    "lesion": "skin_wound",
}
DOMAIN_TO_LABELS = {
    "skin_wound": ("wound", "rash", "lesion", "paw", "skin"),
    "eye": ("eye",),
    "ear": ("ear",),
}

SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "").strip()
REQUEST_TIMEOUT_SECONDS = float(os.getenv("IMAGE_FETCH_TIMEOUT_SECONDS", "8"))
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"
GROUNDING_DINO_TIMEOUT_MS = int(os.getenv("GROUNDING_DINO_TIMEOUT_MS", "500"))
SAM2_TIMEOUT_MS = int(os.getenv("SAM2_TIMEOUT_MS", "800"))
FLORENCE_TIMEOUT_MS = int(os.getenv("FLORENCE_TIMEOUT_MS", "600"))

GROUNDING_DINO = GroundingDinoDetector()
SAM2 = Sam2Segmenter()
FLORENCE = FlorenceCaptioner()

app = FastAPI(title="vision-preprocess-service", version="0.3.0")


class VisionPreprocessRequest(BaseModel):
    image: str
    owner_text: str = ""
    known_symptoms: list[str] = Field(default_factory=list)
    breed: str | None = None
    age_years: float | None = None
    weight: float | None = None


ModelStageCallable = Callable[[], Any]
ModelStageResult = TypeVar("ModelStageResult")


def validate_auth(authorization: str | None) -> None:
    if not SIDECAR_API_KEY:
        return

    expected = f"Bearer {SIDECAR_API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid sidecar bearer token")


def decode_image_bytes(value: str) -> bytes:
    image_value = (value or "").strip()
    if not image_value:
        raise ValueError("No image provided")

    if image_value.startswith("http://") or image_value.startswith("https://"):
        response = requests.get(image_value, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.content

    if image_value.startswith("data:image/"):
        _, encoded = image_value.split(",", 1)
        return base64.b64decode(encoded)

    return base64.b64decode(image_value)


def load_image(value: str) -> Image.Image:
    image = Image.open(BytesIO(decode_image_bytes(value)))
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB")


def domain_labels(domain: str) -> tuple[str, ...]:
    return DOMAIN_TO_LABELS.get(domain, MODEL_LABELS)


def update_domain_with_detection(domain: str, label: str) -> str:
    normalized = str(label or "").strip().lower()
    detected_domain = LABEL_TO_DOMAIN.get(normalized)
    if not detected_domain:
        return domain
    if domain in {"unsupported", "skin_wound"}:
        return detected_domain
    return domain


def build_stub_response() -> dict[str, Any]:
    return {
        "domain": "unsupported",
        "body_region": None,
        "detected_regions": [
            {
                "label": "stub region",
                "confidence": 0.2,
                "notes": "Deterministic stub fixture for test mode.",
            }
        ],
        "best_crop": None,
        "image_quality": "borderline",
        "preprocess_confidence": 0.2,
        "limitations": [
            "stub service - replace with Grounding DINO, SAM2.1, and Florence-2 inference"
        ],
        "fallback_reason": "stub_mode",
        "pipeline_mode": "stub",
    }


def normalize_detection_regions(
    detections: list[Any],
    caption: str,
) -> list[dict[str, Any]]:
    regions: list[dict[str, Any]] = []
    for index, detection in enumerate(detections[:3]):
        notes = caption if index == 0 and caption else None
        regions.append(
            {
                "label": detection.label,
                "confidence": round(detection.confidence, 2),
                **({"notes": notes} if notes else {}),
            }
        )
    return regions


def clamp_confidence(*values: float) -> float:
    clean_values = [float(value) for value in values]
    if not clean_values:
        return 0.5
    average = sum(clean_values) / len(clean_values)
    return round(max(0.0, min(0.97, average)), 2)


def run_stage(
    name: str,
    timeout_ms: int,
    callback: ModelStageCallable,
) -> ModelStageResult:
    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(callback)
    try:
        return future.result(timeout=timeout_ms / 1000.0)
    except FutureTimeoutError as error:
        future.cancel()
        raise RuntimeError(f"{name}_timeout") from error
    except Exception as error:
        raise RuntimeError(f"{name}_error:{error}") from error
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def build_fallback_response(
    image: Image.Image,
    owner_text: str,
    known_symptoms: list[str],
    fallback_reason: str,
    domain_override: str | None = None,
    body_region_override: str | None = None,
) -> dict[str, Any]:
    domain = domain_override or infer_domain(owner_text, known_symptoms)
    body_region = body_region_override or infer_body_region(owner_text)
    image_quality, quality_confidence, quality_limitations = classify_quality(image)
    detected_regions, best_crop, localization_limitations, confidence_boost = (
        build_heuristic_localization(image=image, domain=domain, owner_text=owner_text)
    )
    limitations = [
        *quality_limitations,
        *localization_limitations,
        f"Used heuristic fallback because {fallback_reason.replace('_', ' ')}.",
    ]
    return {
        "domain": domain,
        "body_region": body_region,
        "detected_regions": detected_regions,
        "best_crop": best_crop,
        "image_quality": image_quality,
        "preprocess_confidence": clamp_confidence(
            quality_confidence,
            quality_confidence + confidence_boost,
        ),
        "limitations": limitations,
        "fallback_reason": fallback_reason,
        "pipeline_mode": "heuristic",
    }


def resolve_context(
    image: Image.Image,
    owner_text: str,
    known_symptoms: list[str],
) -> tuple[str, str | None, str, float, list[str]]:
    domain = infer_domain(owner_text, known_symptoms)
    body_region = infer_body_region(owner_text)
    image_quality, quality_confidence, quality_limitations = classify_quality(image)
    return domain, body_region, image_quality, quality_confidence, quality_limitations


def detect_regions(image: Image.Image, domain: str) -> list[Any]:
    return run_stage(
        "grounding_dino",
        GROUNDING_DINO_TIMEOUT_MS,
        lambda: GROUNDING_DINO.detect(image, domain_labels(domain)),
    )


def segment_region(
    image: Image.Image,
    detection: Any,
) -> Any:
    return run_stage(
        "sam2",
        SAM2_TIMEOUT_MS,
        lambda: SAM2.segment_box(image, detection.box),
    )


def caption_crop(image: Image.Image, crop_box: tuple[int, int, int, int]) -> str:
    crop_image = image.crop(crop_box)
    return run_stage(
        "florence",
        FLORENCE_TIMEOUT_MS,
        lambda: FLORENCE.caption(crop_image),
    )


def build_success_response(
    image: Image.Image,
    domain: str,
    body_region: str | None,
    image_quality: str,
    quality_confidence: float,
    quality_limitations: list[str],
    detections: list[Any],
    segmentation: Any,
    caption: str,
) -> dict[str, Any]:
    limitations = list(quality_limitations)
    if segmentation.coverage <= 0.01:
        limitations.append("Segmentation mask was sparse; using conservative crop bounds.")

    crop_box = segmentation.box or detections[0].box
    return {
        "domain": domain,
        "body_region": body_region,
        "detected_regions": normalize_detection_regions(detections, caption),
        "best_crop": encode_crop(image, crop_box),
        "image_quality": image_quality,
        "preprocess_confidence": clamp_confidence(
            quality_confidence,
            detections[0].confidence,
            min(0.95, 0.55 + segmentation.coverage),
        ),
        "limitations": limitations,
        "fallback_reason": None,
        "pipeline_mode": "model",
    }


def build_model_response(
    image: Image.Image,
    owner_text: str,
    known_symptoms: list[str],
) -> dict[str, Any]:
    domain, body_region, image_quality, quality_confidence, quality_limitations = (
        resolve_context(image, owner_text, known_symptoms)
    )

    try:
        detections = detect_regions(image, domain)
    except RuntimeError as error:
        return build_fallback_response(image, owner_text, known_symptoms, str(error))

    if not detections:
        return build_fallback_response(
            image,
            owner_text,
            known_symptoms,
            "grounding_dino_no_detections",
        )

    primary_detection = detections[0]
    domain = update_domain_with_detection(domain, primary_detection.label)
    body_region = body_region or infer_body_region(primary_detection.label)

    try:
        segmentation = segment_region(image, primary_detection)
    except RuntimeError as error:
        return build_fallback_response(
            image,
            owner_text,
            known_symptoms,
            str(error),
            domain_override=domain,
            body_region_override=body_region,
        )

    crop_box = segmentation.box or primary_detection.box
    if not crop_box:
        return build_fallback_response(
            image,
            owner_text,
            known_symptoms,
            "sam2_empty_mask",
            domain_override=domain,
            body_region_override=body_region,
        )

    try:
        caption = caption_crop(image, crop_box)
    except RuntimeError as error:
        return build_fallback_response(
            image,
            owner_text,
            known_symptoms,
            str(error),
            domain_override=domain,
            body_region_override=body_region,
        )

    return build_success_response(
        image=image,
        domain=domain,
        body_region=body_region,
        image_quality=image_quality,
        quality_confidence=quality_confidence,
        quality_limitations=quality_limitations,
        detections=detections,
        segmentation=segmentation,
        caption=caption,
    )


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "vision-preprocess-service",
        "mode": "stub" if STUB_MODE else "live_with_fallback",
        "models": {
            "grounding_dino": GROUNDING_DINO.health(),
            "sam2": SAM2.health(),
            "florence2": FLORENCE.health(),
        },
    }


@app.post("/infer")
def infer(
    payload: VisionPreprocessRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    validate_auth(authorization)

    if STUB_MODE:
        return build_stub_response()

    try:
        image = load_image(payload.image)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Unable to decode image: {error}") from error

    return build_model_response(
        image=image,
        owner_text=payload.owner_text,
        known_symptoms=payload.known_symptoms,
    )
