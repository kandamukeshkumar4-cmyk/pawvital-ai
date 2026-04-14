from __future__ import annotations

from fastapi.testclient import TestClient

import app.main as main


app = main.app
client = TestClient(app)


def build_candidate(
    chunk_id: str,
    title: str,
    text_content: str,
    score: float,
) -> dict[str, object]:
    return {
        "chunk_id": chunk_id,
        "source_id": "source-1",
        "source_title": "Veterinary Reference",
        "chunk_title": title,
        "source_url": f"https://example.com/{chunk_id}",
        "citation": title,
        "text_content": text_content,
        "keyword_tags": ["wound"],
        "score": score,
    }


def build_payload() -> dict[str, object]:
    return {
        "query": "dog leg wound",
        "domain": "skin_wound",
        "breed": "Labrador",
        "condition_hints": ["wound"],
        "dog_only": True,
        "text_limit": 2,
    }


class FakeEmbedModel:
    def encode(self, inputs, normalize_embeddings=True):
        if len(inputs) == 1:
            return [[1.0, 0.0]]

        vectors: list[list[float]] = []
        for item in inputs:
            text = str(item).lower()
            vectors.append([1.0, 0.0] if "deep wound cleaning" in text else [0.2, 0.0])
        return vectors


class FakeRerankModel:
    def predict(self, pairs):
        scores: list[float] = []
        for _, candidate_text in pairs:
            text = str(candidate_text).lower()
            scores.append(0.9 if "deep wound cleaning" in text else 0.1)
        return scores


def test_search_uses_model_reranking_when_available(monkeypatch) -> None:
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_KEY", "service-role-key")
    monkeypatch.setattr(main, "FORCE_FALLBACK", False)
    monkeypatch.setattr(main, "TEXT_MODEL_ENABLED", True)
    monkeypatch.setattr(main, "MODEL_LOAD_ERROR", None)
    monkeypatch.setattr(
        main,
        "load_models",
        lambda: (FakeEmbedModel(), FakeRerankModel()),
    )
    monkeypatch.setattr(
        main,
        "fetch_rpc_candidates",
        lambda query, limit: [
            build_candidate(
                "lexical-first",
                "Lexical match first",
                "Basic wound care tips for dogs.",
                0.6,
            ),
            build_candidate(
                "model-wins",
                "Model match wins",
                "Deep wound cleaning guidance for dogs with draining lesions.",
                0.2,
            ),
        ],
    )
    monkeypatch.setattr(main, "fetch_fallback_candidates", lambda search_terms, limit: [])

    response = client.post("/search", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["retrieval_mode"] == "model"
    assert body["fallback_reason"] is None
    assert body["candidate_source"] == "rpc"
    assert body["candidate_count"] == 2
    assert body["text_chunks"][0]["title"] == "Model match wins"
    assert body["text_chunks"][0]["score"] <= 1
    assert all(0 <= score <= 1 for score in body["rerank_scores"])


def test_force_fallback_skips_model_backend(monkeypatch) -> None:
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_KEY", "service-role-key")
    monkeypatch.setattr(main, "FORCE_FALLBACK", True)
    monkeypatch.setattr(main, "TEXT_MODEL_ENABLED", True)
    monkeypatch.setattr(
        main,
        "load_models",
        lambda: (_ for _ in ()).throw(
            AssertionError("load_models should not run when FORCE_FALLBACK is enabled")
        ),
    )
    monkeypatch.setattr(
        main,
        "fetch_rpc_candidates",
        lambda query, limit: [
            build_candidate(
                "fallback-only",
                "Fallback only",
                "Dog wound cleaning guidance.",
                0.5,
            )
        ],
    )

    response = client.post("/search", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["retrieval_mode"] == "lexical_fallback"
    assert body["fallback_reason"] == "force_fallback"
    assert body["candidate_source"] == "rpc"


def test_model_load_failure_is_explicit(monkeypatch) -> None:
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_KEY", "service-role-key")
    monkeypatch.setattr(main, "FORCE_FALLBACK", False)
    monkeypatch.setattr(main, "TEXT_MODEL_ENABLED", True)
    monkeypatch.setattr(main, "MODEL_LOAD_ERROR", "weights missing")
    monkeypatch.setattr(main, "load_models", lambda: (None, None))
    monkeypatch.setattr(
        main,
        "fetch_rpc_candidates",
        lambda query, limit: [
            build_candidate(
                "load-failed",
                "Load failed fallback",
                "Dog wound cleaning guidance.",
                0.5,
            )
        ],
    )

    response = client.post("/search", json=build_payload())
    body = response.json()

    assert response.status_code == 200
    assert body["retrieval_mode"] == "lexical_fallback"
    assert body["fallback_reason"] == "model_load_failed"


def test_healthz_reports_force_fallback(monkeypatch) -> None:
    monkeypatch.setattr(main, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(main, "SUPABASE_KEY", "service-role-key")
    monkeypatch.setattr(main, "FORCE_FALLBACK", True)
    monkeypatch.setattr(main, "TEXT_MODEL_ENABLED", True)
    monkeypatch.setattr(main, "MODEL_LOAD_ATTEMPTED", False)
    monkeypatch.setattr(main, "EMBED_MODEL", None)
    monkeypatch.setattr(main, "RERANK_MODEL", None)
    monkeypatch.setattr(main, "MODEL_LOAD_ERROR", None)

    response = client.get("/healthz")
    body = response.json()

    assert response.status_code == 200
    assert body["mode"] == "forced_fallback"
    assert body["fallback"] == {
        "stub_mode": False,
        "force_fallback": True,
        "reason": "force_fallback",
    }
    assert body["models"]["backend_enabled"] is False
