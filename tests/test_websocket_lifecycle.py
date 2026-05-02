"""Tests for websocket endpoint lifecycle helpers."""

import pytest
from fastapi import WebSocketDisconnect

from backend.websocket_lifecycle import (
    WebSocketLifecycleDependencies,
    client_session_audit_event,
    open_websocket_session,
    run_websocket_lifecycle,
    websocket_session,
)


class _Manager:
    def __init__(self):
        self.connected = []
        self.disconnected = []
        self.rooms = {"room-1": []}

    async def connect(self, websocket, room_token, role):
        self.connected.append((websocket, room_token, role))
        self.rooms.setdefault(room_token, []).append(websocket)

    def disconnect(self, websocket):
        self.disconnected.append(websocket)
        self.rooms.pop("room-1", None)
        return "room-1"


class _Logger:
    def __init__(self):
        self.errors = []

    def error(self, message, *args):
        self.errors.append(message % args)


def test_websocket_session_uses_defaults():
    session = websocket_session(None, None)

    assert session.room_token == "default_room"
    assert session.role == "desktop"


def test_client_session_audit_event_uses_session_category():
    event = client_session_audit_event("mobile", "Client joined room")

    assert event["type"] == "audit.event"
    assert event["category"] == "session"
    assert event["role"] == "mobile"


@pytest.mark.asyncio
async def test_open_websocket_session_connects_and_emits_join_event():
    emitted = []
    manager = _Manager()

    async def emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    deps = WebSocketLifecycleDependencies(
        manager=manager,
        ensure_driver_running=lambda _room: _noop(),
        send_initial_snapshot=lambda *_args: _noop(),
        emit_room_event=emit,
        shutdown_room_tasks=lambda _room: _noop(),
        ws_loop=lambda *_args: _noop(),
        logger=_Logger(),
    )

    await open_websocket_session("ws", websocket_session("room-1", "mobile"), deps)

    assert manager.connected == [("ws", "room-1", "mobile")]
    assert emitted[0][1]["message"] == "Client joined room"
    assert emitted[0][2]["exclude_ws"] == "ws"


@pytest.mark.asyncio
async def test_run_websocket_lifecycle_closes_after_disconnect():
    emitted = []
    shutdowns = []
    manager = _Manager()

    async def emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    async def ws_loop(*_args):
        raise WebSocketDisconnect()

    deps = WebSocketLifecycleDependencies(
        manager=manager,
        ensure_driver_running=lambda _room: _noop(),
        send_initial_snapshot=lambda *_args: _noop(),
        emit_room_event=emit,
        shutdown_room_tasks=lambda room: _record(shutdowns, room),
        ws_loop=ws_loop,
        logger=_Logger(),
    )

    await run_websocket_lifecycle("ws", websocket_session("room-1", "mobile"), deps)

    assert manager.disconnected == ["ws"]
    assert emitted[-1][1]["message"] == "Client left room"
    assert shutdowns == ["room-1"]


async def _noop():
    return None


async def _record(items, item):
    items.append(item)
