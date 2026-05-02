"""Packet builders for room and initial snapshots."""

from typing import Any, Dict, Optional, Tuple

from src.domain.models.protocol import build_capabilities, build_session_state


def build_snapshot_session_packet(
    room_token: str,
    role: str,
    snapshot: Dict[str, Any],
    *,
    host_connected: bool,
    auth_mode: str,
    expires_at: Optional[float],
) -> Dict[str, Any]:
    return build_session_state(
        room_token,
        role,
        bridge_connected=host_connected,
        host_connected=host_connected,
        auth_mode=auth_mode,
        expires_at=expires_at,
        project_state=snapshot["project_state"],
        project_registry=snapshot["project_registry"],
        active_project_id=snapshot["active_project_id"],
        host_registry=snapshot["host_registry"],
        active_host_id=snapshot["active_host_id"],
        active_runtime=snapshot["active_runtime"],
    )


def build_snapshot_capabilities_packet(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    return build_capabilities(
        snapshot["runtime_catalog"],
        session_capabilities=snapshot["session_capabilities"],
        active_runtime=snapshot["active_runtime"],
        active_project_id=snapshot["active_project_id"],
        project_registry=snapshot["project_registry"],
        host_registry=snapshot["host_registry"],
        active_host_id=snapshot["active_host_id"],
        bridge_label=snapshot["bridge_label"],
        host=snapshot["host"],
    )


def build_snapshot_packets(
    room_token: str,
    role: str,
    snapshot: Dict[str, Any],
    *,
    host_connected: bool,
    auth_mode: str,
    expires_at: Optional[float],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    return (
        build_snapshot_session_packet(
            room_token,
            role,
            snapshot,
            host_connected=host_connected,
            auth_mode=auth_mode,
            expires_at=expires_at,
        ),
        build_snapshot_capabilities_packet(snapshot),
    )
