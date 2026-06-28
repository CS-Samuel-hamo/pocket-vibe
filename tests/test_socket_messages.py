"""Tests for websocket message envelope helpers."""

import json

import pytest

from backend.socket_messages import decrypt_if_needed, routeable_socket_payload, safe_json_loads


async def _false_handler(_data, _websocket):
    return False


async def _handshake_handler(data, _websocket):
    return data.get("type") == "key_exchange"


async def _resume_handler(data, _websocket):
    return data.get("type") == "resume"


def test_safe_json_loads_returns_none_for_invalid_json():
    assert safe_json_loads("{") is None
    assert safe_json_loads('{"type": "ping"}') == {"type": "ping"}


def test_decrypt_if_needed_requires_secret_for_encrypted_packet():
    packet = {"type": "encrypted", "ciphertext": "x"}

    assert decrypt_if_needed(packet, "ws", {}, lambda *_args: "{}") is None


def test_decrypt_if_needed_decodes_decrypted_json():
    packet = {"type": "encrypted", "ciphertext": "x"}

    result = decrypt_if_needed(packet, "ws", {"ws": "secret"}, lambda *_args: '{"type": "ping"}')

    assert result == {"type": "ping"}


@pytest.mark.asyncio
async def test_routeable_socket_payload_skips_handshake_and_resume():
    assert await routeable_socket_payload(
        json.dumps({"type": "key_exchange"}),
        "ws",
        handle_handshake=_handshake_handler,
        handle_resume=_resume_handler,
        decrypt_payload=lambda data, _ws: data,
        normalize_message=dict,
    ) is None

    assert await routeable_socket_payload(
        json.dumps({"type": "resume"}),
        "ws",
        handle_handshake=_false_handler,
        handle_resume=_resume_handler,
        decrypt_payload=lambda data, _ws: data,
        normalize_message=dict,
    ) is None


@pytest.mark.asyncio
async def test_routeable_socket_payload_normalizes_application_message():
    result = await routeable_socket_payload(
        json.dumps({"type": "prompt.submit", "text": "hello"}),
        "ws",
        handle_handshake=_false_handler,
        handle_resume=_resume_handler,
        decrypt_payload=lambda data, _ws: data,
        normalize_message=lambda data: {**data, "normalized": True},
    )

    assert result["type"] == "prompt.submit"
    assert result["normalized"] is True
