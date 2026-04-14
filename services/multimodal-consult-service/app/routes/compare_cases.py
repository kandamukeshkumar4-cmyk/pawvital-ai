"""Case comparison routes for the multimodal consult service."""

from fastapi import APIRouter

from ..main_legacy import compare_cases, enhanced_case_comparison
from ..schemas import CaseComparisonResponse, EnhancedCaseComparisonResponse


router = APIRouter()

router.add_api_route(
    "/compare-cases",
    compare_cases,
    methods=["POST"],
    response_model=CaseComparisonResponse,
)
router.add_api_route(
    "/compare-cases/enhanced",
    enhanced_case_comparison,
    methods=["POST"],
    response_model=EnhancedCaseComparisonResponse,
)
