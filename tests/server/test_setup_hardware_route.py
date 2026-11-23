"""Tests for the read-only local hardware/setup endpoint."""

from __future__ import annotations

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from openjarvis.core.events import EventBus  # noqa: E402
from openjarvis.server.app import create_app  # noqa: E402

from .test_routes import _make_engine, _test_config  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    app = create_app(
        _make_engine(), "test-model", bus=EventBus(), config=_test_config()
    )
    return TestClient(app)


def test_setup_hardware_route_reports_local_policy(client: TestClient) -> None:
    response = client.get("/v1/setup/hardware")
    assert response.status_code == 200
    payload = response.json()
    assert payload["product"] == "Free Jarvis"
    assert payload["recommended_engine"] == "ollama"
    assert payload["recommended_model"].startswith("qwen")
    assert payload["cloud_keys_required"] is False
    assert "ollama_install_hint" in payload
    assert "ram_gb" in payload
    assert "hardware_tier" in payload
