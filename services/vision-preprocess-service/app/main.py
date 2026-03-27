from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field


class VisionPreprocessRequest(BaseModel):
    image: str
    owner_text: str = ""
    known_symptoms: list[str] = Field(default_factory=list)
    breed: str | None = None
    age_years: float | None = None
    weight: float | None = None


app = FastAPI(title="vision-preprocess-service", version="0.1.0")


def validate_auth(authorization: str | None) -> None:
    # Contract stub: add real bearer validation when deploying the production service.
    return


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "vision-preprocess-service", "mode": "stub"}


@app.post("/infer")
def infer(payload: VisionPreprocessRequest, authorization: str | None = Header(default=None)):
    validate_auth(authorization)
    return {
        "domain": "unsupported",
        "body_region": None,
        "detected_regions": [],
        "best_crop": None,
        "image_quality": "acceptable",
        "preprocess_confidence": 0.2,
        "limitations": ["stub service - replace with Grounding DINO, SAM2.1, and Florence-2 inference"],
    }
