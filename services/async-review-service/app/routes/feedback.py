"""Feedback aggregation routes."""

from fastapi import APIRouter

from ..main_legacy import (
    get_feedback_summary,
    get_feedback_synthesis,
    get_feedback_trends,
    record_outcome_feedback,
)


router = APIRouter()

router.add_api_route("/feedback/summary", get_feedback_summary, methods=["GET"])
router.add_api_route("/feedback/record", record_outcome_feedback, methods=["POST"])
router.add_api_route("/feedback/synthesis", get_feedback_synthesis, methods=["GET"])
router.add_api_route("/feedback/trends", get_feedback_trends, methods=["GET"])
