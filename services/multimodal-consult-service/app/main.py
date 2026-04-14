"""Thin FastAPI entrypoint for the multimodal consult service."""

from fastapi import FastAPI

from .main_legacy import lifespan
from .routes.compare_cases import router as compare_cases_router
from .routes.consult import router as consult_router
from .routes.uncertainty import router as uncertainty_router


app = FastAPI(
    title="multimodal-consult-service",
    version="1.0.0",
    lifespan=lifespan,
)
app.include_router(consult_router)
app.include_router(compare_cases_router)
app.include_router(uncertainty_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8083)
