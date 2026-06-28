"""Tests for backend-hosted production PWA support."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.static_pwa import (
    backend_mobile_base_url,
    mount_mobile_pwa,
    pwa_dist_ready,
    should_serve_frontend_from_backend,
)


def test_backend_mobile_base_url_uses_app_route():
    assert backend_mobile_base_url("192.168.1.55", 8000) == "http://192.168.1.55:8000/app/"


def test_should_serve_frontend_from_backend_is_explicit():
    assert should_serve_frontend_from_backend(lambda _name, _default: "") is False
    assert should_serve_frontend_from_backend(lambda _name, _default: "1") is True
    assert should_serve_frontend_from_backend(lambda _name, _default: "false") is False


def test_mount_mobile_pwa_serves_dist_index(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<div id='root'>Pocket Vibe</div>", encoding="utf-8")

    app = FastAPI()
    result = mount_mobile_pwa(app, enabled=True, dist_dir=dist)
    client = TestClient(app)

    assert pwa_dist_ready(dist) is True
    assert result["mounted"] is True
    response = client.get("/app/")
    assert response.status_code == 200
    assert "Pocket Vibe" in response.text


def test_mount_mobile_pwa_reports_missing_build(tmp_path):
    app = FastAPI()
    result = mount_mobile_pwa(app, enabled=True, dist_dir=tmp_path / "missing")
    client = TestClient(app)

    assert result["mounted"] is False
    response = client.get("/app/")
    assert response.status_code == 503
    assert "mobile app is not built" in response.text
