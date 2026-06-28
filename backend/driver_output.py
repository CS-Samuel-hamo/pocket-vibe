"""Helpers for parsing and delivering desktop driver output packets."""

import asyncio
from typing import Any, Awaitable, Callable, Dict, Optional

from src.domain.models.protocol import build_execution_event

Packet = Dict[str, Any]
ParseJson = Callable[[str], Optional[Packet]]
NormalizeMessage = Callable[[Packet], Packet]
EmitRoomEvent = Callable[..., Awaitable[None]]


def driver_packet_from_text(
    packet_text: str,
    *,
    parse_json: ParseJson,
    normalize_message: NormalizeMessage,
) -> Packet:
    payload = parse_json(packet_text) or {"type": "log", "content": packet_text}
    return normalize_message(payload)


def driver_delivery_kwargs(packet: Packet) -> Dict[str, Any]:
    if packet.get("delivery") == "desktop":
        return {
            "role_filter": packet.get("target_role"),
            "target_connection_id": packet.get("target_connection_id"),
            "ignore_rate_limit": True,
            "buffer_message": False,
        }
    return {"ignore_rate_limit": True, "buffer_message": True}


def driver_broadcast_error_event(exc: Exception) -> Packet:
    return build_execution_event(
        "error",
        f"Driver broadcast failed: {exc}",
        reason="driver_broadcast_error",
    )


async def emit_driver_packet(
    room_token: str,
    packet: Packet,
    emit_room_event: EmitRoomEvent,
) -> None:
    await emit_room_event(room_token, packet, **driver_delivery_kwargs(packet))


async def broadcast_driver_packets(
    room_token: str,
    *,
    packet_source: Any,
    emit_room_event: EmitRoomEvent,
    parse_json: ParseJson,
    normalize_message: NormalizeMessage,
    logger: Any,
) -> None:
    try:
        async for packet_text in packet_source.start():
            packet = driver_packet_from_text(
                packet_text,
                parse_json=parse_json,
                normalize_message=normalize_message,
            )
            await emit_driver_packet(room_token, packet, emit_room_event)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.error("Broadcast error: %s", exc)
        await emit_room_event(
            room_token,
            driver_broadcast_error_event(exc),
            ignore_rate_limit=True,
            buffer_message=True,
        )
