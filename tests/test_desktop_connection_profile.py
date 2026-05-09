"""Tests for local desktop connection profile generation."""

import json

from backend.desktop_connection_profile import (
    build_desktop_connection_profile,
    desktop_connection_profile_path,
    write_desktop_connection_profile,
)


def _pairing_payload():
    return {
        "backend_ws_url": "ws://127.0.0.1:8000/ws",
        "api_base_url": "http://127.0.0.1:8000",
        "pairing_page_url": "http://127.0.0.1:8000/",
        "target_url": "http://127.0.0.1:8000/app/?token=secret",
        "connection_mode": "lan",
    }


def test_build_desktop_connection_profile_contains_bridge_fields():
    profile = build_desktop_connection_profile(
        _pairing_payload(),
        token="secret-token",
        auth_mode="configured",
        expires_at=None,
        updated_at=123.0,
    )

    assert profile["schema_version"] == 1
    assert profile["backend_ws_url"] == "ws://127.0.0.1:8000/ws"
    assert profile["api_base_url"] == "http://127.0.0.1:8000"
    assert profile["token"] == "secret-token"
    assert profile["auth_mode"] == "configured"
    assert profile["updated_at"] == 123.0


def test_write_desktop_connection_profile_uses_ignored_local_directory(tmp_path):
    profile = build_desktop_connection_profile(
        _pairing_payload(),
        token="secret-token",
        auth_mode="configured",
        expires_at=None,
        updated_at=123.0,
    )

    written = write_desktop_connection_profile(tmp_path, profile)
    loaded = json.loads(written.read_text(encoding="utf-8"))

    assert written == desktop_connection_profile_path(tmp_path)
    assert written.parts[-2:] == (".pocket-vibe", "desktop-connection.json")
    assert loaded["token"] == "secret-token"
