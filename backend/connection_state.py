"""Small helpers for mutable websocket connection state."""

from typing import Any, Callable, Dict, Optional

from backend.host_session import build_host_session_payload
from backend.project_registry import should_replace_room_selection


def host_context(
    websocket: Any,
    *,
    roles: Dict[Any, str],
    ws_to_room: Dict[Any, str],
    connection_ids: Dict[Any, str],
    is_desktop_host_role: Callable[[Optional[str]], bool],
) -> Optional[Dict[str, str]]:
    if not is_desktop_host_role(roles.get(websocket)):
        return None
    room_token = ws_to_room.get(websocket)
    connection_id = connection_ids.get(websocket)
    if not room_token or not connection_id:
        return None
    return {"room_token": room_token, "connection_id": connection_id}


def store_host_session_payload(
    websocket: Any,
    payload: Dict[str, Dict[str, Any]],
    *,
    host_sessions: Dict[Any, Dict[str, Any]],
    host_projects: Dict[Any, Dict[str, Any]],
) -> Dict[str, Any]:
    metadata = payload["project"]
    host_sessions[websocket] = payload["session"]
    host_projects[websocket] = metadata
    return metadata


def _update_room_project_selection(manager: Any, room_token: str, metadata: Dict[str, Any]) -> None:
    current_selection = manager.room_project_selection.get(room_token)
    current_entry = manager.get_project_entry(room_token, current_selection) if current_selection else None
    if should_replace_room_selection(current_selection, current_entry, metadata):
        manager.room_project_selection[room_token] = metadata["project_id"]


def _build_payload_from_context(
    context: Dict[str, str],
    *,
    bridge: Optional[Dict[str, Any]],
    project: Optional[Dict[str, Any]],
    session_capabilities: Optional[list],
    runtime_catalog: Optional[list],
    active_runtime: Optional[str],
    bridge_label: str,
    default_platform: str,
) -> Dict[str, Dict[str, Any]]:
    return build_host_session_payload(
        bridge=bridge,
        project=project,
        session_capabilities=session_capabilities,
        runtime_catalog=runtime_catalog,
        active_runtime=active_runtime,
        connection_id=context["connection_id"],
        bridge_label=bridge_label,
        default_platform=default_platform,
    )


def update_host_session_state(
    manager: Any,
    websocket: Any,
    *,
    payload_options: Dict[str, Any],
    default_platform: str,
    is_desktop_host_role: Callable[[Optional[str]], bool],
) -> Optional[Dict[str, Any]]:
    context = host_context(
        websocket,
        roles=manager.roles,
        ws_to_room=manager.ws_to_room,
        connection_ids=manager.connection_ids,
        is_desktop_host_role=is_desktop_host_role,
    )
    if not context:
        return None
    payload = _build_payload_from_context(
        context,
        **payload_options,
        default_platform=default_platform,
    )
    metadata = store_host_session_payload(
        websocket,
        payload,
        host_sessions=manager.host_sessions,
        host_projects=manager.host_projects,
    )
    _update_room_project_selection(manager, context["room_token"], metadata)
    return metadata
