"""Connection preflight response builder."""

import time
from typing import Any, Dict, Optional


REASON_ERROR_CODES = {
    "token_missing": "PV-AUTH-001",
    "token_mismatch": "PV-AUTH-001",
    "token_expired": "PV-AUTH-002",
}


def _base_payload(ok: bool, reason: str, message: str, auth_mode: str, expires_at: Optional[float]) -> Dict[str, Any]:
    return {
        "type": "connection.preflight",
        "ok": ok,
        "reason": reason,
        "error_code": REASON_ERROR_CODES.get(reason),
        "message": message,
        "auth_mode": auth_mode,
        "expires_at": expires_at,
    }


def _empty_room_state() -> Dict[str, Any]:
    return {
        "host_connected": False,
        "host_count": 0,
        "project_count": 0,
        "active_project_name": None,
        "active_runtime": None,
    }


def _failure_payload(reason: str, message: str, auth_mode: str, expires_at: Optional[float]) -> Dict[str, Any]:
    payload = _base_payload(False, reason, message, auth_mode, expires_at)
    payload.update(_empty_room_state())
    return payload


def _token_failure(
    normalized_token: str,
    auth_token: Optional[str],
    auth_mode: str,
    expires_at: Optional[float],
) -> Optional[Dict[str, str]]:
    if auth_token and not normalized_token:
        return {"reason": "token_missing", "message": "Session token is required."}
    if auth_token and normalized_token != auth_token:
        return {"reason": "token_mismatch", "message": "Session token does not match the desktop host."}
    if auth_mode == "ephemeral" and expires_at and time.time() > expires_at:
        return {"reason": "token_expired", "message": "Session token expired. Restart the desktop host."}
    return None


def _room_state(manager: Any, room_token: str) -> Dict[str, Any]:
    active_project = manager.get_active_host_project(room_token)
    projects = manager.list_room_projects(room_token)
    hosts = manager.list_room_hosts(room_token)
    host_connected = manager.room_has_desktop_host(room_token)
    return {
        "host_connected": host_connected,
        "host_error_code": None if host_connected else "PV-CONN-003",
        "host_count": len(hosts),
        "project_count": len(projects),
        "active_project_name": active_project.get("project_name") if active_project else None,
        "active_runtime": active_project.get("active_runtime") if active_project else None,
    }


def build_connection_preflight(
    token: Optional[str],
    *,
    auth_token: Optional[str],
    auth_mode: str,
    expires_at: Optional[float],
    manager: Any,
) -> Dict[str, Any]:
    normalized_token = str(token or "").strip()
    failure = _token_failure(normalized_token, auth_token, auth_mode, expires_at)
    if failure:
        return _failure_payload(failure["reason"], failure["message"], auth_mode, expires_at)

    room_token = normalized_token or "default_room"
    payload = _base_payload(True, "ok", "API and token are reachable.", auth_mode, expires_at)
    payload.update(_room_state(manager, room_token))
    return payload
