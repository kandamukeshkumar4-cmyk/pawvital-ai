"""Dead-letter queue routes."""

from fastapi import APIRouter

from ..main_legacy import (
    delete_dead_letter_entry,
    get_dead_letter_queue,
    retry_all_dead_letter_entries,
    retry_dead_letter_entry,
)


router = APIRouter()

router.add_api_route("/dead-letter", get_dead_letter_queue, methods=["GET"])
router.add_api_route("/dead-letter/{case_id}", retry_dead_letter_entry, methods=["POST"])
router.add_api_route("/dead-letter/{case_id}", delete_dead_letter_entry, methods=["DELETE"])
router.add_api_route("/dead-letter/retry-all", retry_all_dead_letter_entries, methods=["POST"])
