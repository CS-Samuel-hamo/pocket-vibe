"""Tests for connection preflight payload construction."""

from backend.connection_preflight import build_connection_preflight


class _FakeManager:
    def get_active_host_project(self, room_token):
        return {"project_name": f"{room_token}-project", "active_runtime": "codex-cli"}

    def list_room_projects(self, room_token):
        return [{"project_id": f"{room_token}-project"}]

    def list_room_hosts(self, room_token):
        return [{"host_id": f"{room_token}-host"}]

    def room_has_desktop_host(self, room_token):
        return room_token == "token-1"


def test_connection_preflight_rejects_missing_token():
    result = build_connection_preflight(
        "",
        auth_token="token-1",
        auth_mode="configured",
        expires_at=None,
        manager=_FakeManager(),
    )

    assert result["ok"] is False
    assert result["reason"] == "token_missing"
    assert result["host_connected"] is False


def test_connection_preflight_rejects_expired_ephemeral_token():
    result = build_connection_preflight(
        "token-1",
        auth_token="token-1",
        auth_mode="ephemeral",
        expires_at=1,
        manager=_FakeManager(),
    )

    assert result["ok"] is False
    assert result["reason"] == "token_expired"


def test_connection_preflight_reports_room_state():
    result = build_connection_preflight(
        "token-1",
        auth_token="token-1",
        auth_mode="configured",
        expires_at=None,
        manager=_FakeManager(),
    )

    assert result["ok"] is True
    assert result["host_connected"] is True
    assert result["project_count"] == 1
    assert result["active_runtime"] == "codex-cli"
