"""Tests for pairing context URL and IP helpers."""

from urllib.parse import parse_qs, urlparse

from backend.pairing_context import (
    build_pairing_context_payload,
    pick_best_ip,
    replace_loopback_host,
    resolve_mobile_base_url,
)


def test_pick_best_ip_prefers_lan_then_private_ranges():
    assert pick_best_ip(["10.0.0.5", "192.168.1.10"]) == "192.168.1.10"
    assert pick_best_ip(["172.20.1.2", "203.0.113.9"]) == "172.20.1.2"
    assert pick_best_ip(["203.0.113.9"]) == "203.0.113.9"


def test_replace_loopback_host_preserves_path_and_port():
    result = replace_loopback_host("http://127.0.0.1:5173/app", "192.168.1.55")

    assert result == "http://192.168.1.55:5173/app"


def test_resolve_mobile_base_url_rewrites_configured_loopback(monkeypatch):
    monkeypatch.setenv("VITE_FRONTEND_URL", "http://localhost:5173")
    monkeypatch.delenv("PUBLIC_FRONTEND_URL", raising=False)

    assert resolve_mobile_base_url("192.168.1.55") == "http://192.168.1.55:5173/"


def test_build_pairing_context_payload_adds_remote_query_values(monkeypatch):
    monkeypatch.setenv("PUBLIC_FRONTEND_URL", "https://phone.example.com")
    monkeypatch.setenv("PUBLIC_API_BASE_URL", "https://relay.example.com")
    monkeypatch.setenv("PUBLIC_BACKEND_WS_URL", "wss://relay.example.com/ws")

    result = build_pairing_context_payload(
        "192.168.1.55",
        auth_token="token-1",
        auth_mode="configured",
        expires_at=None,
        port=8000,
    )
    query = parse_qs(urlparse(result["target_url"]).query)

    assert result["connection_mode"] == "public"
    assert query["token"] == ["token-1"]
    assert query["api_base_url"] == ["https://relay.example.com"]
    assert query["backend_ws_url"] == ["wss://relay.example.com/ws"]
