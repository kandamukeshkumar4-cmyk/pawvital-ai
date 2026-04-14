"""Shadow analysis routes."""

from fastapi import APIRouter

from ..main_legacy import (
    analyze_shadow_patterns,
    get_arbitration_rationale,
    get_autopsy_synthesis,
    get_longitudinal_evolution,
    get_shadow_clusters,
    get_shadow_disagreement,
    get_shadow_disagreements,
    perform_escalation_autopsy,
)


router = APIRouter()

router.add_api_route("/shadow/{case_id}", get_shadow_disagreement, methods=["GET"])
router.add_api_route("/shadow/disagreements", get_shadow_disagreements, methods=["GET"])
router.add_api_route("/shadow/clusters", get_shadow_clusters, methods=["GET"])
router.add_api_route("/shadow/analyze", analyze_shadow_patterns, methods=["POST"])
router.add_api_route("/shadow/arbitration/{case_id}", get_arbitration_rationale, methods=["GET"])
router.add_api_route("/shadow/autopsy", perform_escalation_autopsy, methods=["POST"])
router.add_api_route("/shadow/autopsy/synthesis", get_autopsy_synthesis, methods=["GET"])
router.add_api_route("/shadow/longitudinal/{case_id}", get_longitudinal_evolution, methods=["GET"])
