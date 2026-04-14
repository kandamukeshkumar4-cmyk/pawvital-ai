"""Cross-case intelligence routes."""

from fastapi import APIRouter

from ..main_legacy import (
    analyze_all_cross_case_intelligence,
    get_batch_promotion_readiness,
    get_body_region_patterns,
    get_cross_case_disagreement_clusters,
    get_image_quality_patterns,
    get_promotion_error_analysis,
    get_promotion_readiness_summary,
    get_promotion_threshold_recommendations,
    get_reviewer_calibration_narrative,
    get_severity_patterns,
    get_cluster_promotion_playbooks,
)


router = APIRouter()

router.add_api_route("/intelligence/disagreement-clusters", get_cross_case_disagreement_clusters, methods=["GET"])
router.add_api_route("/intelligence/promotion-thresholds", get_promotion_threshold_recommendations, methods=["GET"])
router.add_api_route("/intelligence/playbooks", get_cluster_promotion_playbooks, methods=["GET"])
router.add_api_route("/intelligence/calibration/{case_id}", get_reviewer_calibration_narrative, methods=["GET"])
router.add_api_route("/intelligence/promotion-readiness/{case_id}", get_promotion_readiness_summary, methods=["GET"])
router.add_api_route("/intelligence/promotion-readiness/batch", get_batch_promotion_readiness, methods=["GET"])
router.add_api_route("/intelligence/patterns/body-region", get_body_region_patterns, methods=["GET"])
router.add_api_route("/intelligence/patterns/severity", get_severity_patterns, methods=["GET"])
router.add_api_route("/intelligence/patterns/image-quality", get_image_quality_patterns, methods=["GET"])
router.add_api_route("/intelligence/promotion-errors", get_promotion_error_analysis, methods=["GET"])
router.add_api_route("/intelligence/analyze-all", analyze_all_cross_case_intelligence, methods=["POST"])
