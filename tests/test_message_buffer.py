"""Unit tests for the message buffer module."""

import pytest
import asyncio
from src.core.message_buffer import MessageBuffer, TokenBucket

@pytest.mark.asyncio
async def test_buffer_push_and_sequence():
    buffer = MessageBuffer(size=10)
    seq1 = await buffer.push({"text": "hi"})
    seq2 = await buffer.push({"text": "bye"})

    assert seq1 == 1
    assert seq2 == 2
    assert len(buffer.buffer) == 2

@pytest.mark.asyncio
async def test_buffer_push_does_not_mutate_input_message():
    buffer = MessageBuffer(size=10)
    message = {"text": "immutable"}

    seq = await buffer.push(message)

    assert seq == 1
    assert message == {"text": "immutable"}
    assert buffer.buffer[-1]["text"] == "immutable"
    assert buffer.buffer[-1]["seq_id"] == 1
    assert "timestamp" in buffer.buffer[-1]

@pytest.mark.asyncio
async def test_buffer_overflow():
    buffer = MessageBuffer(size=3)
    for i in range(5):
        await buffer.push({"i": i})

    assert len(buffer.buffer) == 3
    assert buffer.buffer[0]["i"] == 2
    assert buffer.buffer[-1]["i"] == 4

@pytest.mark.asyncio
async def test_get_since():
    buffer = MessageBuffer(size=10)
    for i in range(5):
        await buffer.push({"i": i})

    missed = await buffer.get_since(3)
    assert len(missed) == 2
    assert missed[0]["seq_id"] == 4
    assert missed[1]["seq_id"] == 5

@pytest.mark.asyncio
async def test_token_bucket():
    bucket = TokenBucket(rate=10)
    for _ in range(10):
        assert await bucket.consume() is True

    assert await bucket.consume() is False

    await asyncio.sleep(0.15)
    assert await bucket.consume() is True
