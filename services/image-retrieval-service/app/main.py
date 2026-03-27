from fastapi import FastAPI, Header
from pydantic import BaseModel, Field


class ImageRetrievalRequest(BaseModel):
    query: str
    domain: str | None = None
    breed: str | None = None
    condition_hints: list[str] = Field(default_factory=list)
    dog_only: bool = True
    image_limit: int = 4


app = FastAPI(title="image-retrieval-service", version="0.1.0")


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "image-retrieval-service", "mode": "stub"}


@app.post("/search")
def search(payload: ImageRetrievalRequest, authorization: str | None = Header(default=None)):
    return {
        "image_matches": [],
        "source_citations": [],
    }
