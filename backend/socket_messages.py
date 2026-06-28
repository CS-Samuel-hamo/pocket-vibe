"""Helpers for parsing websocket message envelopes."""

import json
from typing import Any, Awaitable, Callable, Dict, Optional

AsyncHandler = Callable[[Dict[str, Any], Any], Awaitable[bool]]
Decryptor = Callable[[Dict[str, Any], Any], str]
Normalizer = Callable[[Dict[str, Any]], Dict[str, Any]]


def safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def decrypt_if_needed(
    data: Dict[str, Any],
    websocket: Any,
    secrets: Dict[Any, Any],
    decrypt: Decryptor,
) -> Optional[Dict[str, Any]]:
    if data.get("type") != "encrypted":
        return data
    if websocket not in secrets:
        return None
    return safe_json_loads(decrypt(data, secrets[websocket]))


async def _control_message_handled(
    data: Dict[str, Any],
    websocket: Any,
    *,
    handle_handshake: AsyncHandler,
    handle_resume: AsyncHandler,
) -> bool:
    if await handle_handshake(data, websocket):
        return True
    return await handle_resume(data, websocket)


async def _normalized_route_payload(
    data: Optional[Dict[str, Any]],
    websocket: Any,
    *,
    normalize_message: Normalizer,
    handle_resume: AsyncHandler,
) -> Optional[Dict[str, Any]]:
    if not data:
        return None
    normalized = normalize_message(data)
    if await handle_resume(normalized, websocket):
        return None
    return normalized


async def routeable_socket_payload(
    message_text: str,
    websocket: Any,
    *,
    handle_handshake: AsyncHandler,
    handle_resume: AsyncHandler,
    decrypt_payload: Callable[[Dict[str, Any], Any], Optional[Dict[str, Any]]],
    normalize_message: Normalizer,
) -> Optional[Dict[str, Any]]:
    data = safe_json_loads(message_text)
    if not data:
        return None
    if await _control_message_handled(
        data,
        websocket,
        handle_handshake=handle_handshake,
        handle_resume=handle_resume,
    ):
        return None
    decrypted = decrypt_payload(data, websocket)
    return await _normalized_route_payload(
        decrypted,
        websocket,
        normalize_message=normalize_message,
        handle_resume=handle_resume,
    )
