"""Tests for websocket connection state helpers."""

from backend.connection_state import host_context, update_host_session_state


class _Manager:
    def __init__(self):
        self.roles = {"ws": "desktop-host"}
        self.ws_to_room = {"ws": "room-1"}
        self.connection_ids = {"ws": "host-1234567890"}
        self.host_sessions = {}
        self.host_projects = {}
        self.room_project_selection = {}

    def get_project_entry(self, room_token, project_id):
        return self.host_projects.get("ws") if project_id else None


def _is_host(role):
    return role == "desktop-host"


def test_host_context_requires_desktop_role_and_connection_state():
    manager = _Manager()

    assert host_context("ws", roles=manager.roles, ws_to_room=manager.ws_to_room, connection_ids=manager.connection_ids, is_desktop_host_role=_is_host) == {
        "room_token": "room-1",
        "connection_id": "host-1234567890",
    }

    manager.roles["ws"] = "mobile"
    assert host_context("ws", roles=manager.roles, ws_to_room=manager.ws_to_room, connection_ids=manager.connection_ids, is_desktop_host_role=_is_host) is None


def test_update_host_session_state_stores_project_and_session_metadata():
    manager = _Manager()

    metadata = update_host_session_state(
        manager,
        "ws",
        payload_options={
            "bridge": {"label": "VS Code Host"},
            "project": {"name": "Pocket", "root_path": "D:/AI_projects/Pocket_Vibe"},
            "session_capabilities": ["prompt"],
            "runtime_catalog": [{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
            "active_runtime": "codex-cli",
            "bridge_label": "Desktop Host",
        },
        default_platform="desktop",
        is_desktop_host_role=_is_host,
    )

    assert metadata["project_name"] == "Pocket"
    assert manager.host_projects["ws"]["runtime_health"] == "ready"
    assert manager.host_sessions["ws"]["session_capabilities"] == ["prompt"]
    assert manager.room_project_selection["room-1"] == metadata["project_id"]
