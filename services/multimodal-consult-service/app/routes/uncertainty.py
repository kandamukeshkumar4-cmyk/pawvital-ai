"""Uncertainty reporting routes for the multimodal consult service."""

from fastapi import APIRouter

from ..main_legacy import (
    get_live_longitudinal_uncertainty_report,
    get_longitudinal_uncertainty_history,
    get_trajectory_analysis,
    get_uncertainty_discipline_report,
)
from ..schemas import LongitudinalUncertaintyReport


router = APIRouter()

router.add_api_route(
    "/uncertainty/discipline-report",
    get_uncertainty_discipline_report,
    methods=["GET"],
)
router.add_api_route(
    "/uncertainty/live-longitudinal-report",
    get_live_longitudinal_uncertainty_report,
    methods=["POST"],
    response_model=LongitudinalUncertaintyReport,
)
router.add_api_route(
    "/uncertainty/longitudinal-history",
    get_longitudinal_uncertainty_history,
    methods=["GET"],
)
router.add_api_route(
    "/uncertainty/trajectory-analysis",
    get_trajectory_analysis,
    methods=["GET"],
)
