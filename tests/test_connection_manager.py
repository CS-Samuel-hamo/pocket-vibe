"""Tests for the extracted websocket connection manager."""

import json

import pytest

from backend.connection_manager import ConnectionManager, ConnectionManagerDependencies
from src.core.message_buffer import MessageBuffer, TokenBucket


class _FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.sent = []

    async def accept(self):
        self.accepted = True

    async def send_text(self, text):
        self.sent.append(json.loads(text))


def _is_host(role):
    return role in {"vscode-bridge", "desktop-host"}


def _host_descriptor(metadata, **_kwargs):
    return {
        "id": metadata.get("host_id", "host-1"),
        "label": metadata.get("host_label", "VS Code"),
        "platform": metadata.get("platform", "vscode"),
        "kind": metadata.get("kind", "extension"),
        "version": metadata.get("version", "test"),
        "capabilities": metadata.get("session_capabilities", []),
        "health": metadata.get("runtime_health", "ready"),
        "last_error": metadata.get("last_error"),
    }


def _manager():
    return ConnectionManager(
        ConnectionManagerDependencies(
            desktop_target_role="desktop-host",
            default_host_label="Desktop Host",
            default_host_platform="unknown",
            is_desktop_host_role=_is_host,
            host_descriptor_from_metadata=_host_descriptor,
            message_buffer=MessageBuffer(10),
            rate_limiter=TokenBucket(100),
            json_dumps=lambda payload: json.dumps(payload, ensure_ascii=False),
            e2ee_enabled=lambda: False,
            encrypt=lambda _text, _secret: {},
            logger=_Logger(),
        )
    )


class _Logger:
    def warning(self, *_args):
        return None


def test_connection_manager_keeps_bridge_projects_alias():
    manager = _manager()

    assert manager.host_projects is manager.bridge_projects


@pytest.mark.asyncio
async def test_connection_manager_routes_desktop_target_to_host_roles():
    manager = _manager()
    mobile = _FakeWebSocket()
    bridge = _FakeWebSocket()
    await manager.connect(mobile, "room-1", "mobile")
    await manager.connect(bridge, "room-1", "vscode-bridge")

    await manager.send_to_room(
        "room-1",
        {"type": "execution.event", "message": "desktop-only"},
        role_filter="desktop-host",
        ignore_rate_limit=True,
    )

    assert mobile.sent == []
    assert bridge.sent[-1]["message"] == "desktop-only"


@pytest.mark.asyncio
async def test_connection_manager_replays_only_visible_packets():
    manager = _manager()
    mobile = _FakeWebSocket()
    await manager.send_to_room(
        "room-1",
        {"type": "execution.event", "message": "visible"},
        ignore_rate_limit=True,
    )
    await manager.send_to_room(
        "room-1",
        {"type": "execution.event", "message": "desktop-only", "delivery": "desktop"},
        ignore_rate_limit=True,
    )

    await manager.replay_since(mobile, 0, role="mobile")

    assert [packet["message"] for packet in mobile.sent] == ["visible"]
