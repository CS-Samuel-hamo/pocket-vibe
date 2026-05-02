"""Connection teardown helpers for websocket rooms."""

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


@dataclass(frozen=True)
class DisconnectedConnection:
    token: Optional[str]
    removed_connection_id: Optional[str]
    removed_project_id: Optional[str]


def pop_connection_state(
    websocket: Any,
    *,
    roles: Dict[Any, str],
    secrets: Dict[Any, bytes],
    ws_to_room: Dict[Any, str],
    connection_ids: Dict[Any, str],
    host_sessions: Dict[Any, Dict[str, Any]],
    host_projects: Dict[Any, Dict[str, Any]],
) -> DisconnectedConnection:
    token = ws_to_room.pop(websocket, None)
    roles.pop(websocket, None)
    secrets.pop(websocket, None)
    removed_connection_id = connection_ids.pop(websocket, None)
    host_sessions.pop(websocket, None)
    removed_project_id = host_projects.pop(websocket, {}).get("project_id")
    return DisconnectedConnection(token, removed_connection_id, removed_project_id)


def _remove_websocket_from_room(
    rooms: Dict[str, List[Any]],
    token: str,
    websocket: Any,
) -> bool:
    if token not in rooms:
        return False
    if websocket in rooms[token]:
        rooms[token].remove(websocket)
    return True


def _clear_room_if_empty(
    rooms: Dict[str, List[Any]],
    room_project_selection: Dict[str, str],
    token: str,
) -> bool:
    if rooms[token]:
        return False
    rooms.pop(token)
    room_project_selection.pop(token, None)
    return True


def _replace_removed_selection(
    room_project_selection: Dict[str, str],
    token: str,
    removed_project_id: Optional[str],
    replacement_project: Callable[[], Optional[Dict[str, Any]]],
) -> None:
    selected_project_id = room_project_selection.get(token)
    if not selected_project_id or selected_project_id != removed_project_id:
        return
    replacement = replacement_project()
    if replacement:
        room_project_selection[token] = replacement["project_id"]
        return
    room_project_selection.pop(token, None)


def _cleanup_existing_room(
    record: DisconnectedConnection,
    *,
    websocket: Any,
    rooms: Dict[str, List[Any]],
    room_project_selection: Dict[str, str],
    replacement_project: Callable[[], Optional[Dict[str, Any]]],
) -> bool:
    if not record.token or not _remove_websocket_from_room(rooms, record.token, websocket):
        return False
    if _clear_room_if_empty(rooms, room_project_selection, record.token):
        return True
    _replace_removed_selection(
        room_project_selection,
        record.token,
        record.removed_project_id,
        replacement_project,
    )
    return True


def cleanup_disconnected_room(
    record: DisconnectedConnection,
    *,
    websocket: Any,
    rooms: Dict[str, List[Any]],
    room_project_selection: Dict[str, str],
    replacement_project: Callable[[], Optional[Dict[str, Any]]],
) -> None:
    if _cleanup_existing_room(
        record,
        websocket=websocket,
        rooms=rooms,
        room_project_selection=room_project_selection,
        replacement_project=replacement_project,
    ):
        return
    if record.token and record.removed_connection_id:
        room_project_selection.pop(record.token, None)
