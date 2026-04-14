from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as main


app = main.app
client = TestClient(app)


def build_payload() -> dict[str, object]:
    return {
        "query": "dog hot spot hind leg",
        "domain": "skin_wound",
        "breed": "Labrador",
        "condition_hints": ["hot_spot"],
        "dog_only": True,
        "image_limit": 2,
    }


def build_source(source_id: str, title: str) -> dict[str, object]:
    return {
        "id": source_id,
        "title": title,
        "dataset_url": f"https://example.com/{source_id}",
        "metadata": {
            "live_retrieval_status": "live",
            "species_scope": "dog",
            "live_domains": ["skin_wound"],
        },
    }


def build_asset(asset_id: str, source_id: str, label: str, caption: str) -> dict[str, object]:
    return {
        "id": asset_id,
        "source_id": source_id,
        "condition_label": label,
        "local_path": None,
        "asset_url": f"https://example.com/{asset_id}.jpg",
        "caption": caption,
        "metadata": {"live_domain": "skin_wound"},
    }


def test_search_surfaces_model_rerank_and_normalizes_scores(monkeypatch) -> None:
    source = build_source("source-1", "Reference Set")
    assets = [
        build_asset("asset-a", "source-1", "dermatitis", "Mild dermatitis example."),
        build_asset("asset-b", "source-1", "hot_spot", "Classic hot spot on hind leg."),
    ]

    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_KEY", "service-role-key")
    monkeypatch.setattr(main, "FORCE_FALLBACK", False)
    monkeypatch.setattr(main, "IMAGE_MODEL_ENABLED", True)
    monkeypatch.setattr(main, "fetch_live_sources", lambda payload: {"source-1": source})
    monkeypatch.setattr(main, "fetch_assets", lambda source_ids, search_terms, condition_filters, limit: assets)
    monkeypatch.setattr(
        main,
        "rerank_assets_with_model",
        lambda payload, ranked_rows: (
            [ranked_rows[1], ranked_rows[0]],
            {"retrieval_mode": "model", "fallback_reason": None},
        ),
    )

    response = client.post("/search", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["retrieval_mode"] == "model"
    assert body["fallback_reason"] is None
    assert body["candidate_source"] == "supabase_live_assets"
    assert body["candidate_count"] == 2
    assert body["image_matches"][0]["condition_label"] == "dermatitis"
    assert all(0 <= item["score"] <= 1 for item in body["image_matches"])


def test_force_fallback_skips_model_loading(monkeypatch) -> None:
    monkeypatch.setattr(main, "FORCE_FALLBACK", True)
    payload = main.ImageRetrievalRequest(**build_payload())
    ranked_rows = [
        (1.8, build_asset("asset-a", "source-1", "hot_spot", "Caption"), build_source("source-1", "Reference Set"))
    ]
    monkeypatch.setattr(
        main,
        "load_biomedclip",
        lambda: (_ for _ in ()).throw(
            AssertionError("load_biomedclip should not run when FORCE_FALLBACK is enabled")
        ),
    )

    ranked, meta = main.rerank_assets_with_model(payload, ranked_rows)

    assert ranked == ranked_rows
    assert meta == {
        "retrieval_mode": "deterministic_fallback",
        "fallback_reason": "force_fallback",
    }


def test_warm_image_cache_records_warmed_assets(monkeypatch) -> None:
    source = build_source("source-1", "Reference Set")
    assets = [
        build_asset("asset-a", "source-1", "hot_spot", "Caption"),
        build_asset("asset-b", "source-1", "dermatitis", "Caption"),
    ]

    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_KEY", "service-role-key")
    monkeypatch.setattr(main, "FORCE_FALLBACK", False)
    monkeypatch.setattr(main, "IMAGE_MODEL_ENABLED", True)
    monkeypatch.setattr(main, "fetch_live_sources", lambda payload: {"source-1": source})
    monkeypatch.setattr(main, "fetch_assets", lambda source_ids, search_terms, condition_filters, limit: assets)
    monkeypatch.setattr(main, "prime_asset_embeddings", lambda rows: len(rows))

    main.warm_image_cache()

    assert main.CACHE_WARM_ATTEMPTED is True
    assert main.CACHE_WARMED_ASSET_COUNT == 2
    assert main.CACHE_WARM_ERROR is None


def test_healthz_reports_force_fallback_and_cache_state(monkeypatch) -> None:
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_KEY", "service-role-key")
    monkeypatch.setattr(main, "FORCE_FALLBACK", True)
    monkeypatch.setattr(main, "IMAGE_MODEL_ENABLED", True)
    monkeypatch.setattr(main, "MODEL_LOAD_ATTEMPTED", False)
    monkeypatch.setattr(main, "MODEL_LOAD_ERROR", None)
    monkeypatch.setattr(main, "CACHE_WARM_ATTEMPTED", True)
    monkeypatch.setattr(main, "CACHE_WARMED_ASSET_COUNT", 3)
    monkeypatch.setattr(main, "CACHE_WARM_ERROR", None)
    monkeypatch.setattr(main, "IMAGE_EMBED_CACHE", {"asset-a": [0.1, 0.2]})

    response = client.get("/healthz")
    body = response.json()

    assert response.status_code == 200
    assert body["mode"] == "forced_fallback"
    assert body["fallback"] == {
        "stub_mode": False,
        "force_fallback": True,
        "reason": "force_fallback",
    }
    assert body["cache"] == {
        "warm_attempted": True,
        "warmed_asset_count": 3,
        "cached_asset_count": 1,
        "warm_error": None,
    }
