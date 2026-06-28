"""Peer filtering helpers for websocket room delivery."""

from typing import Any, Callable, Dict, Iterable, List, Optional

RolePredicate = Callable[[Optional[str]], bool]


def _without_excluded(peers: List[Any], exclude_ws: Optional[Any]) -> List[Any]:
    if not exclude_ws:
        return peers
    return [peer for peer in peers if peer != exclude_ws]


def _matches_role(
    peer: Any,
    *,
    roles: Dict[Any, str],
    role_filter: str,
    desktop_target_role: str,
    is_desktop_host_role: RolePredicate,
) -> bool:
    role = roles.get(peer)
    if role_filter == desktop_target_role:
        return is_desktop_host_role(role)
    return role == role_filter


def _with_role_filter(
    peers: List[Any],
    *,
    roles: Dict[Any, str],
    role_filter: Optional[str],
    desktop_target_role: str,
    is_desktop_host_role: RolePredicate,
) -> List[Any]:
    if not role_filter:
        return peers
    return [
        peer
        for peer in peers
        if _matches_role(
            peer,
            roles=roles,
            role_filter=role_filter,
            desktop_target_role=desktop_target_role,
            is_desktop_host_role=is_desktop_host_role,
        )
    ]


def _with_connection_filter(
    peers: List[Any],
    *,
    connection_ids: Dict[Any, str],
    target_connection_id: Optional[str],
) -> List[Any]:
    if not target_connection_id:
        return peers
    return [peer for peer in peers if connection_ids.get(peer) == target_connection_id]


def filter_room_peers(
    peers: Iterable[Any],
    *,
    roles: Dict[Any, str],
    connection_ids: Dict[Any, str],
    exclude_ws: Optional[Any],
    role_filter: Optional[str],
    target_connection_id: Optional[str],
    desktop_target_role: str,
    is_desktop_host_role: RolePredicate,
) -> List[Any]:
    filtered = _without_excluded(list(peers), exclude_ws)
    filtered = _with_role_filter(
        filtered,
        roles=roles,
        role_filter=role_filter,
        desktop_target_role=desktop_target_role,
        is_desktop_host_role=is_desktop_host_role,
    )
    return _with_connection_filter(
        filtered,
        connection_ids=connection_ids,
        target_connection_id=target_connection_id,
    )
