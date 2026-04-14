from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as entry
import app.main_legacy as legacy


def build_payload() -> dict[str, object]:
    return {
        "image": "not-an-image-needed-for-force-fallback",
        "owner_text": "My dog has an inflamed sore on the hind leg.",
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


def test_healthz_reports_force_fallback(monkeypatch) -> None:
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


def test_force_fallback_consult_short_circuits_before_model_load(monkeypatch) -> None:
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
        response = client.post("/consult", json=build_payload())

    body = response.json()
    assert response.status_code == 200
    assert body["model"].endswith("(force_fallback)")
    assert body["confidence"] == 0.2
    assert body["agreements"] == []
    assert body["disagreements"] == []
    assert any("force fallback" in item for item in body["uncertainties"])
