"""Thin FastAPI entrypoint for the async review service."""

from fastapi import FastAPI

from .main_legacy import lifespan
from .routes.calibration import router as calibration_router
from .routes.dead_letter import router as dead_letter_router
from .routes.feedback import router as feedback_router
from .routes.intelligence import router as intelligence_router
from .routes.review import router as review_router
from .routes.shadow import router as shadow_router


app = FastAPI(
    title="async-review-service",
    version="1.0.0",
    lifespan=lifespan,
)
app.include_router(review_router)
app.include_router(dead_letter_router)
app.include_router(shadow_router)
app.include_router(feedback_router)
app.include_router(intelligence_router)
app.include_router(calibration_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8084)
