import base64
import os
import re
from io import BytesIO
from typing import Any

import numpy as np
import requests
from fastapi import FastAPI, Header, HTTPException
from PIL import Image, ImageOps
from pydantic import BaseModel, Field


DOMAIN_KEYWORDS: list[tuple[str, list[str]]] = [
    (
        "eye",
        ["eye", "eyes", "eyelid", "eyelids", "cornea", "conjunctiva", "ocular"],
    ),
    ("ear", ["ear", "ears", "ear flap", "ear canal", "otitis", "mites"]),
    (
        "stool_vomit",
        ["vomit", "vomiting", "stool", "poop", "diarrhea", "diarrhoea", "feces", "faeces"],
    ),
    (
        "skin_wound",
        [
            "wound",
            "cut",
            "scrape",
            "rash",
            "skin",
            "hot spot",
            "hotspot",
            "lesion",
            "lump",
            "bump",
            "mass",
            "bleeding",
            "swelling",
            "paw",
            "leg",
            "limp",
            "limping",
        ],
    ),
]

BODY_REGION_KEYWORDS: list[tuple[str, list[str]]] = [
    ("left front leg", ["left front leg", "left foreleg", "left front paw"]),
    ("right front leg", ["right front leg", "right foreleg", "right front paw"]),
    ("left back leg", ["left back leg", "left hind leg", "left rear leg"]),
    ("right back leg", ["right back leg", "right hind leg", "right rear leg"]),
    ("paw", ["paw", "foot", "pad", "pads", "toe", "toes"]),
    ("eye", ["eye", "eyelid", "ocular"]),
    ("ear", ["ear", "ear flap", "ear canal"]),
    ("abdomen", ["belly", "abdomen", "stomach", "side"]),
    ("mouth", ["mouth", "gum", "gums", "lip", "teeth"]),
]

SIDECAR_API_KEY = os.getenv("SIDECAR_API_KEY", "").strip()
REQUEST_TIMEOUT_SECONDS = float(os.getenv("IMAGE_FETCH_TIMEOUT_SECONDS", "8"))
STUB_MODE = os.getenv("STUB_MODE", "false").strip().lower() == "true"


class VisionPreprocessRequest(BaseModel):
    image: str
    owner_text: str = ""
    known_symptoms: list[str] = Field(default_factory=list)
    breed: str | None = None
    age_years: float | None = None
    weight: float | None = None


app = FastAPI(title="vision-preprocess-service", version="0.2.0")


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().lower())


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
    image_bytes = decode_image_bytes(value)
    image = Image.open(BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB")


def infer_domain(owner_text: str, known_symptoms: list[str]) -> str:
    combined = normalize_text(" ".join([owner_text, *known_symptoms]))
    for domain, keywords in DOMAIN_KEYWORDS:
        if any(keyword in combined for keyword in keywords):
            return domain
    return "unsupported"


def infer_body_region(owner_text: str) -> str | None:
    normalized = normalize_text(owner_text)
    for body_region, keywords in BODY_REGION_KEYWORDS:
        if any(keyword in normalized for keyword in keywords):
            return body_region
    return None


def classify_quality(image: Image.Image) -> tuple[str, float, list[str]]:
    width, height = image.size
    rgb = np.asarray(image).astype(np.float32)
    gray = rgb.mean(axis=2)
    brightness = float(gray.mean())
    contrast = float(gray.std())
    if gray.shape[0] > 1 and gray.shape[1] > 1:
        edge_strength = float(np.abs(np.diff(gray, axis=0)).mean() + np.abs(np.diff(gray, axis=1)).mean())
    else:
        edge_strength = 0.0

    limitations: list[str] = []
    if min(width, height) < 256:
        limitations.append("Image resolution is low for confident preprocessing.")
    if brightness < 45 or brightness > 225:
        limitations.append("Lighting is poor or overexposed.")
    if contrast < 20:
        limitations.append("Image contrast is low.")
    if edge_strength < 18:
        limitations.append("Image may be blurry.")

    quality = "excellent"
    if min(width, height) < 256 or brightness < 45 or brightness > 225 or edge_strength < 10:
        quality = "poor"
    elif min(width, height) < 384 or contrast < 20 or edge_strength < 18:
        quality = "borderline"
    elif min(width, height) < 768 or edge_strength < 28:
        quality = "good"

    confidence = 0.92
    if quality == "good":
        confidence = 0.78
    elif quality == "borderline":
        confidence = 0.62
    elif quality == "poor":
        confidence = 0.4

    return quality, confidence, limitations


def compute_inflammation_box(image: Image.Image) -> tuple[tuple[int, int, int, int] | None, float]:
    rgb = np.asarray(image).astype(np.float32)
    red = rgb[:, :, 0]
    green = rgb[:, :, 1]
    blue = rgb[:, :, 2]
    redness = red - (0.82 * green) - (0.82 * blue)
    mask = (red > 90) & (redness > 18)

    coordinates = np.argwhere(mask)
    if coordinates.size == 0:
        return None, 0.0

    y_min, x_min = coordinates.min(axis=0)
    y_max, x_max = coordinates.max(axis=0)
    area_ratio = float(mask.mean())
    if area_ratio < 0.005:
        return None, area_ratio

    padding_x = max(12, int((x_max - x_min) * 0.15))
    padding_y = max(12, int((y_max - y_min) * 0.15))
    left = max(0, int(x_min - padding_x))
    top = max(0, int(y_min - padding_y))
    right = min(image.size[0], int(x_max + padding_x))
    bottom = min(image.size[1], int(y_max + padding_y))
    return (left, top, right, bottom), area_ratio


def encode_crop(image: Image.Image, box: tuple[int, int, int, int] | None) -> str | None:
    if not box:
        return None

    crop = image.crop(box)
    crop.thumbnail((512, 512))
    buffer = BytesIO()
    crop.save(buffer, format="JPEG", quality=85)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def build_detected_regions(
    image: Image.Image,
    domain: str,
    owner_text: str,
) -> tuple[list[dict[str, Any]], str | None, list[str], float]:
    findings: list[dict[str, Any]] = []
    limitations: list[str] = []
    best_crop: str | None = None
    confidence_boost = 0.0

    if domain == "skin_wound" or domain == "unsupported":
        box, area_ratio = compute_inflammation_box(image)
        if box:
            confidence = round(min(0.94, 0.55 + area_ratio * 8.0), 2)
            findings.append(
                {
                    "label": "inflamed skin region",
                    "confidence": confidence,
                    "notes": "Color clustering suggests irritation, inflammation, or an open lesion.",
                }
            )
            best_crop = encode_crop(image, box)
            confidence_boost = max(confidence_boost, confidence - 0.5)
        else:
            limitations.append("No focal inflamed region was confidently localized.")

    if not findings and domain in {"eye", "ear"}:
        findings.append(
            {
                "label": f"{domain.replace('_', ' ')} region",
                "confidence": 0.58,
                "notes": f"Domain was inferred from the owner description: {owner_text[:120]}",
            }
        )
        confidence_boost = max(confidence_boost, 0.08)

    return findings, best_crop, limitations, confidence_boost


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "service": "vision-preprocess-service",
        "mode": "stub" if STUB_MODE else "heuristic_live",
    }


@app.post("/infer")
def infer(payload: VisionPreprocessRequest, authorization: str | None = Header(default=None)):
    validate_auth(authorization)

    if STUB_MODE:
        return {
            "domain": "unsupported",
            "body_region": None,
            "detected_regions": [],
            "best_crop": None,
            "image_quality": "borderline",
            "preprocess_confidence": 0.2,
            "limitations": [
                "stub service - replace with Grounding DINO, SAM2.1, and Florence-2 inference"
            ],
        }

    try:
        image = load_image(payload.image)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Unable to decode image: {error}") from error

    domain = infer_domain(payload.owner_text, payload.known_symptoms)
    body_region = infer_body_region(payload.owner_text)
    image_quality, quality_confidence, quality_limitations = classify_quality(image)
    detected_regions, best_crop, detection_limitations, confidence_boost = build_detected_regions(
        image=image,
        domain=domain,
        owner_text=payload.owner_text,
    )

    confidence = round(min(0.97, quality_confidence + confidence_boost), 2)
    limitations = [*quality_limitations, *detection_limitations]

    return {
        "domain": domain,
        "body_region": body_region,
        "detected_regions": detected_regions,
        "best_crop": best_crop,
        "image_quality": image_quality,
        "preprocess_confidence": confidence,
        "limitations": limitations,
    }
