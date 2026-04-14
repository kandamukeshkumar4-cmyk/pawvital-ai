"""Calibration and phase-5 analytics routes."""

from fastapi import APIRouter

from ..main_legacy import (
    get_calibration_drift_report,
    get_calibration_phase5_followup,
    get_live_validation_synthesis,
    get_observed_reduction_synthesis,
    get_phase5_shadow_calibration_summary,
    get_threshold_tuning_insights,
    record_calibration_snapshot,
    record_observed_reduction,
)


router = APIRouter()

router.add_api_route("/calibration/phase5-summary/{case_id}", get_phase5_shadow_calibration_summary, methods=["GET"])
router.add_api_route("/calibration/threshold-insights", get_threshold_tuning_insights, methods=["GET"])
router.add_api_route("/calibration/observed-reduction-synthesis", get_observed_reduction_synthesis, methods=["GET"])
router.add_api_route("/calibration/phase5-followup", get_calibration_phase5_followup, methods=["GET"])
router.add_api_route("/calibration/live-validation", get_live_validation_synthesis, methods=["GET"])
router.add_api_route("/calibration/drift-report", get_calibration_drift_report, methods=["GET"])
router.add_api_route("/calibration/record-observed-reduction", record_observed_reduction, methods=["POST"])
router.add_api_route("/calibration/record-snapshot", record_calibration_snapshot, methods=["POST"])
