from fastapi.testclient import TestClient

from app import main


class FakeEmbeddingModel:
    def encode(self, texts, normalize_embeddings=True):
        assert normalize_embeddings is True
        return [[0.1, 0.2] for _ in texts]


client = TestClient(main.app)


def test_embed_endpoint_returns_bge_embeddings(monkeypatch):
    monkeypatch.setattr(main, "SIDECAR_API_KEY", "secret")
    monkeypatch.setattr(main, "STUB_MODE", False)
    monkeypatch.setattr(main, "MODEL_LOAD_ERROR", None)
    monkeypatch.setattr(main, "load_models", lambda: (FakeEmbeddingModel(), None))

    response = client.post(
        "/embed",
        headers={"Authorization": "Bearer secret"},
        json={"texts": ["alpha", "beta"], "input_type": "passage"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["model"] == main.TEXT_EMBED_MODEL_NAME
    assert payload["count"] == 2
    assert payload["embeddings"] == [[0.1, 0.2], [0.1, 0.2]]


def test_embed_endpoint_rejects_stub_mode(monkeypatch):
    monkeypatch.setattr(main, "SIDECAR_API_KEY", "")
    monkeypatch.setattr(main, "STUB_MODE", True)

    response = client.post("/embed", json={"texts": ["alpha"]})

    assert response.status_code == 503
