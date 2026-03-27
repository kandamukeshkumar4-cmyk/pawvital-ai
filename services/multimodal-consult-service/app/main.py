from fastapi import FastAPI, Header
from pydantic import BaseModel


class ConsultRequest(BaseModel):
    image: str
    owner_text: str = ""
    mode: str = "sync"
    preprocess: dict
    vision_summary: str = ""
    severity: str = "needs_review"
    contradictions: list[str] = []
    deterministic_facts: dict = {}


app = FastAPI(title="multimodal-consult-service", version="0.1.0")


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "multimodal-consult-service", "mode": "stub"}


@app.post("/consult")
def consult(payload: ConsultRequest, authorization: str | None = Header(default=None)):
    return {
        "model": "Qwen2.5-VL-7B-Instruct",
        "summary": "Stub specialist consult: no live multimodal model is loaded yet.",
        "agreements": [],
        "disagreements": [],
        "uncertainties": ["stub service - replace with real Qwen2.5-VL-7B inference"],
        "confidence": 0.35,
    }
