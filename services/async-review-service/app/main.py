from fastapi import FastAPI, Header
from pydantic import BaseModel


class AsyncReviewRequest(BaseModel):
    image: str
    owner_text: str = ""
    mode: str = "async"
    preprocess: dict
    vision_summary: str = ""
    severity: str = "needs_review"
    contradictions: list[str] = []
    deterministic_facts: dict = {}


app = FastAPI(title="async-review-service", version="0.1.0")


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "async-review-service", "mode": "stub"}


@app.post("/review")
def review(payload: AsyncReviewRequest, authorization: str | None = Header(default=None)):
    return {
        "model": "Qwen2.5-VL-32B-Instruct",
        "summary": "Stub async review accepted.",
        "agreements": [],
        "disagreements": [],
        "uncertainties": ["stub service - replace with real async worker + Qwen2.5-VL-32B"],
        "confidence": 0.3,
    }
