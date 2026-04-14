"""Primary review lifecycle routes."""

from fastapi import APIRouter

from ..main_legacy import (
    delete_review,
    get_outcome_insights,
    get_outcome_patterns,
    get_review,
    get_severity_indicators,
    get_summary_history,
    healthz,
    list_reviews,
    record_outcome,
    review,
    synthesize_severity,
    generate_cross_case_summary,
)
from ..schemas import ReviewResponse


router = APIRouter()

router.add_api_route("/healthz", healthz, methods=["GET"])
router.add_api_route("/review", review, methods=["POST"])
router.add_api_route("/review/{case_id}", get_review, methods=["GET"], response_model=ReviewResponse)
router.add_api_route("/reviews", list_reviews, methods=["GET"])
router.add_api_route("/reviews/{case_id}", delete_review, methods=["DELETE"])
router.add_api_route("/severity/synthesize", synthesize_severity, methods=["POST"])
router.add_api_route("/severity/indicators", get_severity_indicators, methods=["GET"])
router.add_api_route("/outcome/record", record_outcome, methods=["POST"])
router.add_api_route("/outcome/insights", get_outcome_insights, methods=["GET"])
router.add_api_route("/outcome/patterns", get_outcome_patterns, methods=["GET"])
router.add_api_route("/summary/cross-case", generate_cross_case_summary, methods=["POST"])
router.add_api_route("/summary/history", get_summary_history, methods=["GET"])
