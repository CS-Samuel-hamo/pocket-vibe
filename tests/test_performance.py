"""Performance and large-payload tests for the current Pocket Vibe protocol stack."""

import time

import pytest

from src.core.message_buffer import MessageBuffer
from src.domain.models.protocol import normalize_protocol_message


@pytest.mark.asyncio
async def test_websocket_latency():
    start = time.time()
    latency = (time.time() - start) * 1000
    assert latency < 50


@pytest.mark.asyncio
async def test_large_payload_handling():
    buffer = MessageBuffer(size=5)
    payload = {
        "type": "execution.event",
        "phase": "output",
        "message": "x" * 150_000,
    }

    start = time.time()
    normalized = normalize_protocol_message(payload)
    buffered = await buffer.push_and_get(normalized)
    duration = time.time() - start

    assert buffered["type"] == "execution.event"
    assert buffered["seq_id"] == 1
    assert duration < 1.0
