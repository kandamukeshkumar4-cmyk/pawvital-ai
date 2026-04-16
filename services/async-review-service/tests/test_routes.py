from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as entry
import app.main_legacy as legacy


def build_payload() -> dict[str, object]:
    return {
        "image": "not-an-image-needed-for-force-fallback",
        "owner_text": "My dog has a persistent inflamed lesion.",
        "preprocess": {
            "domain": "skin_wound",
            "bodyRegion": "left hind leg",
            "detectedRegions": [],
            "bestCrop": None,
            "imageQuality": "good",
            "confidence": 0.7,
            "limitations": [],
        },
        "vision_summary": "Inflamed superficial lesion on the hind leg.",
        "severity": "needs_review",
        "contradictions": [],
        "deterministic_facts": {"wound_location": "left hind leg"},
    }


def reset_queue_state() -> None:
    legacy.REVIEW_RESULTS.clear()
    legacy.REVIEW_CONTEXT.clear()
    legacy.PROCESSING_QUEUE.clear()
    legacy.SHADOW_DISAGREEMENTS.clear()
    legacy.OUTCOME_FEEDBACK.clear()
    legacy.DEAD_LETTER_QUEUE.clear()
    legacy.REVIEW_STATE_TRANSITIONS.clear()
    legacy.MODEL = None
    legacy.PROCESSOR = None
    legacy.MODEL_LOAD_STATE = "idle"
    legacy.MODEL_LOAD_STARTED_AT = None
    legacy.MODEL_LOAD_COMPLETED_AT = None
    legacy.MODEL_LOAD_FAILURE_REASON = None
    legacy.MODEL_READY_EVENT.clear()


def test_healthz_reports_warming_during_background_model_load(monkeypatch) -> None:
    reset_queue_state()
    monkeypatch.setattr(legacy, "STUB_MODE", False)
    monkeypatch.setattr(legacy, "FORCE_FALLBACK", False)

    def fake_start_background_model_load(force_retry: bool = False) -> bool:
        legacy.MODEL_READY_EVENT.clear()
        legacy.MODEL_LOAD_STATE = "loading"
        legacy.MODEL_LOAD_STARTED_AT = "2026-04-15T15:00:00Z"
        legacy.MODEL_LOAD_COMPLETED_AT = None
        legacy.MODEL_LOAD_FAILURE_REASON = None
        return True

    monkeypatch.setattr(legacy, "start_background_model_load", fake_start_background_model_load)

    with TestClient(entry.app) as client:
        response = client.get("/healthz")

    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "warming"
    assert body["model_load"] == {
        "state": "loading",
        "ready": False,
        "started_at": "2026-04-15T15:00:00Z",
        "completed_at": None,
        "failure_reason": None,
    }


def test_healthz_reports_force_fallback(monkeypatch) -> None:
    reset_queue_state()
    monkeypatch.setattr(legacy, "STUB_MODE", False)
    monkeypatch.setattr(legacy, "FORCE_FALLBACK", True)

    with TestClient(entry.app) as client:
        response = client.get("/healthz")

    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "forced_fallback"
    assert body["fallback"] == {
        "stub_mode": False,
        "force_fallback": True,
        "reason": "force_fallback",
    }
    assert body["model_load"]["ready"] is True


def test_healthz_reports_startup_failure_reason(monkeypatch) -> None:
    reset_queue_state()
    monkeypatch.setattr(legacy, "STUB_MODE", False)
    monkeypatch.setattr(legacy, "FORCE_FALLBACK", False)
    monkeypatch.setattr(legacy, "start_background_model_load", lambda force_retry=False: False)
    legacy.MODEL_LOAD_STATE = "failed"
    legacy.MODEL_LOAD_STARTED_AT = "2026-04-15T15:00:00Z"
    legacy.MODEL_LOAD_COMPLETED_AT = "2026-04-15T15:00:10Z"
    legacy.MODEL_LOAD_FAILURE_REASON = "ValueError: model config missing"

    with TestClient(entry.app) as client:
        response = client.get("/healthz")

    body = response.json()
    assert response.status_code == 200
    assert body["mode"] == "startup_failed"
    assert body["model_load"] == {
        "state": "failed",
        "ready": False,
        "started_at": "2026-04-15T15:00:00Z",
        "completed_at": "2026-04-15T15:00:10Z",
        "failure_reason": "ValueError: model config missing",
    }


def test_resolve_model_source_prefers_snapshot_download(monkeypatch) -> None:
    monkeypatch.setattr(legacy, "snapshot_download", lambda repo_id: f"/tmp/{repo_id.replace('/', '__')}")
    assert legacy._resolve_model_source() == "/tmp/Qwen__Qwen2.5-VL-32B-Instruct"


def test_force_fallback_review_preserves_queue_contract(monkeypatch) -> None:
    reset_queue_state()
    monkeypatch.setattr(legacy, "STUB_MODE", False)
    monkeypatch.setattr(legacy, "FORCE_FALLBACK", True)
    monkeypatch.setattr(
        legacy,
        "load_model",
        lambda: (_ for _ in ()).throw(
            AssertionError("load_model should not run when FORCE_FALLBACK is enabled")
        ),
    )

    with TestClient(entry.app) as client:
        post_response = client.post("/review", json=build_payload())
        case_id = post_response.json()["case_id"]
        get_response = client.get(f"/review/{case_id}")

    post_body = post_response.json()
    get_body = get_response.json()

    assert post_response.status_code == 200
    assert post_body["status"] == "queued"
    assert get_response.status_code == 200
    assert get_body["model"].endswith("(force_fallback)")
    assert get_body["case_id"] == case_id
    assert get_body["confidence"] == 0.2
    assert any("force fallback" in item for item in get_body["uncertainties"])
