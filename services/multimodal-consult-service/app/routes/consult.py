"""Consult and health routes for the multimodal consult service."""

from fastapi import APIRouter

from ..main_legacy import consult, healthz
from ..schemas import ConsultResponse


router = APIRouter()

router.add_api_route("/healthz", healthz, methods=["GET"])
router.add_api_route(
    "/consult",
    consult,
    methods=["POST"],
    response_model=ConsultResponse,
)
