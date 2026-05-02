"""Tests for desktop driver output delivery helpers."""

import pytest

from backend.driver_output import (
    broadcast_driver_packets,
    driver_delivery_kwargs,
    driver_packet_from_text,
)


class _PacketSource:
    def __init__(self, packets):
        self._packets = packets

    async def start(self):
        for packet in self._packets:
            if isinstance(packet, Exception):
                raise packet
            yield packet


class _Logger:
    def __init__(self):
        self.errors = []

    def error(self, message, *args):
        self.errors.append(message % args)


def test_driver_packet_from_text_normalizes_json_and_raw_logs():
    def normalize(packet):
        return {**packet, "normalized": True}

    json_packet = driver_packet_from_text(
        '{"type": "assistant", "content": "ok"}',
        parse_json=lambda text: {"type": "assistant", "content": "ok"},
        normalize_message=normalize,
    )
    raw_packet = driver_packet_from_text(
        "plain output",
        parse_json=lambda _text: None,
        normalize_message=normalize,
    )

    assert json_packet["normalized"] is True
    assert json_packet["content"] == "ok"
    assert raw_packet["type"] == "log"
    assert raw_packet["content"] == "plain output"


def test_driver_delivery_kwargs_marks_desktop_packets_unbuffered():
    packet = {
        "delivery": "desktop",
        "target_role": "vscode-bridge",
        "target_connection_id": "host-1",
    }

    result = driver_delivery_kwargs(packet)

    assert result["role_filter"] == "vscode-bridge"
    assert result["target_connection_id"] == "host-1"
    assert result["buffer_message"] is False


def test_driver_delivery_kwargs_buffers_default_packets():
    assert driver_delivery_kwargs({"type": "assistant"}) == {
        "ignore_rate_limit": True,
        "buffer_message": True,
    }


@pytest.mark.asyncio
async def test_broadcast_driver_packets_emits_packets_with_delivery_kwargs():
    emitted = []

    async def emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    await broadcast_driver_packets(
        "room-1",
        packet_source=_PacketSource(['{"type": "assistant", "content": "ok"}']),
        emit_room_event=emit,
        parse_json=lambda _text: {"type": "assistant", "content": "ok"},
        normalize_message=dict,
        logger=_Logger(),
    )

    assert emitted == [
        (
            "room-1",
            {"type": "assistant", "content": "ok"},
            {"ignore_rate_limit": True, "buffer_message": True},
        )
    ]


@pytest.mark.asyncio
async def test_broadcast_driver_packets_emits_buffered_error_event():
    emitted = []
    logger = _Logger()

    async def emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    await broadcast_driver_packets(
        "room-1",
        packet_source=_PacketSource([RuntimeError("boom")]),
        emit_room_event=emit,
        parse_json=lambda _text: None,
        normalize_message=dict,
        logger=logger,
    )

    assert logger.errors == ["Broadcast error: boom"]
    assert emitted[0][0] == "room-1"
    assert emitted[0][1]["phase"] == "error"
    assert emitted[0][1]["reason"] == "driver_broadcast_error"
    assert emitted[0][2]["buffer_message"] is True
