"""Tests for protocol router orchestration."""

import pytest

from backend.protocol_router import ProtocolRouter, ProtocolRouterDependencies


class _Manager:
    def __init__(self):
        self.host_projects = {}
        self.selected = None
        self.host_connected = True

    def get_active_host_project(self, room_token, preferred_project_id=None):
        self.selected = (room_token, preferred_project_id)
        return {"project_id": preferred_project_id or "p1", "connection_id": "host-1"}

    def room_has_desktop_host(self, _room_token):
        return self.host_connected

    def select_project(self, _room_token, _project_id):
        return True


class _Driver:
    def __init__(self):
        self.commands = []
        self.catalog = None

    async def dispatch_command(self, payload):
        self.commands.append(payload)

    async def update_runtime_catalog(self, runtime_catalog, *, active_runtime=None):
        self.catalog = (runtime_catalog, active_runtime)

    def get_active_runtime(self):
        return "codex-cli"


def _router(manager=None, driver=None, emitted=None):
    emitted = emitted if emitted is not None else []

    async def emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    return ProtocolRouter(
        ProtocolRouterDependencies(
            manager=manager or _Manager(),
            driver=driver or _Driver(),
            default_host_label="Desktop Host",
            is_desktop_host_role=lambda role: role in {"vscode-bridge", "desktop-host"},
            emit_room_event=emit,
            ensure_driver_running=lambda _room: _noop(),
            broadcast_room_snapshot=lambda _room: _noop(),
            send_initial_snapshot=lambda *_args: _noop(),
        )
    )


def test_resolve_target_project_uses_requested_project_id():
    manager = _Manager()
    router = _router(manager=manager)

    result = router.resolve_target_project("room-1", {"project_id": "p2"})

    assert result["project_id"] == "p2"
    assert manager.selected == ("room-1", "p2")


@pytest.mark.asyncio
async def test_handle_bridge_room_event_adds_host_project_context():
    emitted = []
    manager = _Manager()
    manager.host_projects["ws"] = {
        "project_id": "p1",
        "project_name": "Pocket Vibe",
        "host_id": "host-1",
    }
    router = _router(manager=manager, emitted=emitted)

    await router.handle_bridge_room_event({"type": "assistant"}, "room-1", "ws")

    assert emitted[0][1]["project_id"] == "p1"
    assert emitted[0][1]["project_name"] == "Pocket Vibe"
    assert emitted[0][2]["exclude_ws"] == "ws"


@pytest.mark.asyncio
async def test_route_kill_request_emits_offline_result_without_host():
    emitted = []
    manager = _Manager()
    manager.host_connected = False
    router = _router(manager=manager, emitted=emitted)

    await router.route_kill_request({"type": "kill.request"}, "room-1")

    assert emitted[0][1]["type"] == "kill.result"
    assert emitted[0][1]["ok"] is False


async def _noop():
    return None
