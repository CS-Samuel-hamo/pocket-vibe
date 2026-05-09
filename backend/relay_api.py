"""Default-off HTTP API wrapper for the Pocket Vibe relay core."""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Query
from fastapi.responses import JSONResponse

from backend.relay_core import RelayCore, RelayResult


RELAY_REASON_ERROR_CODES = {
    "host_not_registered": "PV-RELAY-004",
    "session_not_found": "PV-RELAY-002",
    "short_code_invalid": "PV-AUTH-003",
    "short_code_consumed": "PV-AUTH-003",
    "short_code_expired": "PV-AUTH-002",
    "device_not_found": "PV-AUTH-003",
    "device_not_authorized": "PV-AUTH-003",
    "payload_not_encrypted": "PV-DIAG-002",
}


def _relay_non_empty_fields(fields: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in fields.items() if value not in (None, [])}


def relay_result_payload(result: RelayResult) -> Dict[str, Any]:
    return {
        "ok": result.ok,
        "status": result.status,
        "reason": result.reason,
        **_relay_non_empty_fields(
            {
                "session_id": result.session_id,
                "device_id": result.device_id,
                "code": result.code,
                "next_cursor": result.next_cursor,
                "error_code": RELAY_REASON_ERROR_CODES.get(result.reason),
                "messages": result.messages,
            }
        ),
    }


def relay_response(result: RelayResult) -> JSONResponse:
    return JSONResponse(
        relay_result_payload(result),
        status_code=200 if result.ok else 400,
    )


class RelayApi:
    def __init__(self, relay: Optional[RelayCore] = None) -> None:
        self.store = relay or RelayCore()

    def register_host(self, payload: Optional[Dict[str, Any]] = Body(default=None)) -> JSONResponse:
        body = payload or {}
        return relay_response(
            self.store.register_host(
                str(body.get("host_id") or ""),
                label=str(body.get("label") or "Desktop Host"),
            )
        )

    def open_pairing_code(self, host_id: str, payload: Optional[Dict[str, Any]] = Body(default=None)) -> JSONResponse:
        body = payload or {}
        return relay_response(
            self.store.open_pairing_code(
                host_id,
                ttl_seconds=int(body.get("ttl_seconds") or 120),
            )
        )

    def pair_mobile_device(self, payload: Optional[Dict[str, Any]] = Body(default=None)) -> JSONResponse:
        body = payload or {}
        return relay_response(
            self.store.pair_mobile_device(
                str(body.get("code") or ""),
                label=str(body.get("label") or "Mobile"),
            )
        )

    def set_device_online(
        self,
        session_id: str,
        device_id: str,
        payload: Optional[Dict[str, Any]] = Body(default=None),
    ) -> JSONResponse:
        body = payload or {}
        return relay_response(self.store.set_device_online(session_id, device_id, bool(body.get("online", True))))

    def revoke_device(self, session_id: str, device_id: str) -> JSONResponse:
        return relay_response(self.store.revoke_device(session_id, device_id))

    def get_presence(self, session_id: str) -> Dict[str, Any]:
        return self.store.get_presence(session_id)

    def append_message(self, session_id: str, payload: Optional[Dict[str, Any]] = Body(default=None)) -> JSONResponse:
        body = payload or {}
        return relay_response(
            self.store.append_encrypted_envelope(
                session_id,
                str(body.get("device_id") or ""),
                dict(body.get("envelope") or {}),
            )
        )

    def replay_messages(
        self,
        session_id: str,
        device_id: str = Query(...),
        cursor: int = Query(0, ge=0),
    ) -> JSONResponse:
        return relay_response(self.store.replay_since(session_id, device_id, cursor=cursor))


def build_relay_router(relay: Optional[RelayCore] = None) -> APIRouter:
    api = RelayApi(relay)
    router = APIRouter(prefix="/api/relay", tags=["relay"])
    router.add_api_route("/hosts", api.register_host, methods=["POST"])
    router.add_api_route("/hosts/{host_id}/pairing-code", api.open_pairing_code, methods=["POST"])
    router.add_api_route("/pair", api.pair_mobile_device, methods=["POST"])
    router.add_api_route("/sessions/{session_id}/devices/{device_id}/online", api.set_device_online, methods=["POST"])
    router.add_api_route("/sessions/{session_id}/devices/{device_id}", api.revoke_device, methods=["DELETE"])
    router.add_api_route("/sessions/{session_id}/presence", api.get_presence, methods=["GET"])
    router.add_api_route("/sessions/{session_id}/messages", api.append_message, methods=["POST"])
    router.add_api_route("/sessions/{session_id}/messages", api.replay_messages, methods=["GET"])

    return router
