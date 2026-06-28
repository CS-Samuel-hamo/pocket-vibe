"""Websocket endpoint lifecycle helpers."""

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from fastapi import WebSocketDisconnect

from src.domain.models.protocol import build_audit_event


@dataclass(frozen=True)
class WebSocketSession:
    room_token: str
    role: str


@dataclass(frozen=True)
class WebSocketLifecycleDependencies:
    manager: Any
    ensure_driver_running: Callable[[str], Awaitable[None]]
    send_initial_snapshot: Callable[[Any, str, str], Awaitable[None]]
    emit_room_event: Callable[..., Awaitable[None]]
    shutdown_room_tasks: Callable[[str], Awaitable[None]]
    ws_loop: Callable[[Any, str, str], Awaitable[None]]
    logger: Any


def websocket_session(token: Optional[str], role: Optional[str]) -> WebSocketSession:
    return WebSocketSession(token or "default_room", role or "desktop")


def client_session_audit_event(role: str, message: str) -> dict:
    return build_audit_event("session", message, role=role)


async def open_websocket_session(
    websocket: Any,
    session: WebSocketSession,
    deps: WebSocketLifecycleDependencies,
) -> None:
    await deps.manager.connect(websocket, session.room_token, session.role)
    await deps.ensure_driver_running(session.room_token)
    await deps.send_initial_snapshot(websocket, session.room_token, session.role)
    await deps.emit_room_event(
        session.room_token,
        client_session_audit_event(session.role, "Client joined room"),
        exclude_ws=websocket,
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def close_websocket_session(
    websocket: Any,
    session: WebSocketSession,
    deps: WebSocketLifecycleDependencies,
) -> None:
    disconnected_room = deps.manager.disconnect(websocket)
    if not disconnected_room:
        return
    await deps.emit_room_event(
        disconnected_room,
        client_session_audit_event(session.role, "Client left room"),
        ignore_rate_limit=True,
        buffer_message=True,
    )
    if disconnected_room not in deps.manager.rooms:
        await deps.shutdown_room_tasks(disconnected_room)


async def run_websocket_lifecycle(
    websocket: Any,
    session: WebSocketSession,
    deps: WebSocketLifecycleDependencies,
) -> None:
    await open_websocket_session(websocket, session, deps)
    try:
        await deps.ws_loop(websocket, session.room_token, session.role)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        deps.logger.error("WebSocket error: %s", exc)
    finally:
        await close_websocket_session(websocket, session, deps)
