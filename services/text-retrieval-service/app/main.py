from fastapi import FastAPI, Header
from pydantic import BaseModel, Field


class RetrievalRequest(BaseModel):
    query: str
    domain: str | None = None
    breed: str | None = None
    condition_hints: list[str] = Field(default_factory=list)
    dog_only: bool = True
    text_limit: int = 4


app = FastAPI(title="text-retrieval-service", version="0.1.0")


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": "text-retrieval-service", "mode": "stub"}


@app.post("/search")
def search(payload: RetrievalRequest, authorization: str | None = Header(default=None)):
    return {
        "text_chunks": [],
        "rerank_scores": [],
        "source_citations": [],
    }
