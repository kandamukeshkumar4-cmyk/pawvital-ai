from __future__ import annotations

import base64
import time
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import app.main as main
from app.models.grounding import Detection
from app.models.sam2 import SegmentationResult


app = main.app
GROUNDING_DINO = main.GROUNDING_DINO
SAM2 = main.SAM2
FLORENCE = main.FLORENCE
client = TestClient(app)


def build_test_image() -> str:
    image = Image.new("RGB", (256, 256), color=(235, 220, 205))
    draw = ImageDraw.Draw(image)
    draw.ellipse((84, 84, 188, 188), fill=(190, 42, 42))
    buffer = BytesIO()
    image.save(buffer, format="JPEG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def build_payload() -> dict:
    return {
        "image": build_test_image(),
        "owner_text": "My dog has a red wound on the left hind paw.",
        "known_symptoms": ["wound", "limping"],
        "breed": "Labrador",
        "age_years": 4,
        "weight": 50,
    }


def test_successful_model_pipeline(monkeypatch) -> None:
    monkeypatch.setattr(
        GROUNDING_DINO,
        "detect",
        lambda image, labels: [Detection("wound", 0.93, (72, 72, 196, 196))],
    )
    monkeypatch.setattr(
        SAM2,
        "segment_box",
        lambda image, box: SegmentationResult((80, 80, 188, 188), 0.22),
    )
    monkeypatch.setattr(FLORENCE, "caption", lambda image: "Red moist wound on the paw.")

    response = client.post("/infer", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["domain"] == "skin_wound"
    assert body["body_region"] == "paw"
    assert body["fallback_reason"] is None
    assert body["best_crop"].startswith("data:image/jpeg;base64,")
    assert body["detected_regions"][0]["label"] == "wound"
    assert "Red moist wound on the paw." in body["detected_regions"][0]["notes"]


def test_grounding_dino_timeout_falls_back(monkeypatch) -> None:
    def slow_detect(image, labels):
        time.sleep(0.7)
        return [Detection("wound", 0.9, (70, 70, 190, 190))]

    monkeypatch.setattr(GROUNDING_DINO, "detect", slow_detect)

    response = client.post("/infer", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["fallback_reason"] == "grounding_dino_timeout"
    assert body["pipeline_mode"] == "heuristic"
    assert body["detected_regions"]


def test_sam2_failure_falls_back(monkeypatch) -> None:
    monkeypatch.setattr(
        GROUNDING_DINO,
        "detect",
        lambda image, labels: [Detection("wound", 0.91, (68, 68, 192, 192))],
    )

    def boom(image, box):
        raise RuntimeError("mask decoder unavailable")

    monkeypatch.setattr(SAM2, "segment_box", boom)

    response = client.post("/infer", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["fallback_reason"].startswith("sam2_error")
    assert body["pipeline_mode"] == "heuristic"
    assert body["domain"] == "skin_wound"


def test_force_fallback_skips_model_calls(monkeypatch) -> None:
    monkeypatch.setattr(main, "FORCE_FALLBACK", True)

    def should_not_run(*args, **kwargs):
        raise AssertionError("model stage should not run when FORCE_FALLBACK is enabled")

    monkeypatch.setattr(GROUNDING_DINO, "detect", should_not_run)
    monkeypatch.setattr(SAM2, "segment_box", should_not_run)
    monkeypatch.setattr(FLORENCE, "caption", should_not_run)

    response = client.post("/infer", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["pipeline_mode"] == "heuristic"
    assert body["fallback_reason"] == "force_fallback"
    assert body["detected_regions"]


def test_healthz_reports_force_fallback(monkeypatch) -> None:
    monkeypatch.setattr(main, "FORCE_FALLBACK", True)

    response = client.get("/healthz")
    body = response.json()

    assert response.status_code == 200
    assert body["mode"] == "forced_fallback"
    assert body["fallback"] == {
        "stub_mode": False,
        "force_fallback": True,
        "reason": "force_fallback",
    }


def test_malformed_base64_returns_400() -> None:
    payload = build_payload()
    payload["image"] = "data:image/jpeg;base64,not-base64"

    response = client.post("/infer", json=payload)

    assert response.status_code == 400
    assert "Unable to decode image" in response.json()["detail"]
