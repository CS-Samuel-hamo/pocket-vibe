"""Connection registry lookup helpers."""

from typing import Any, Callable, Dict, Iterable, List, Optional

from backend.project_registry import host_registry_entry, sort_host_registry

RolePredicate = Callable[[Optional[str]], bool]
HostDescriptorBuilder = Callable[[Dict[str, Any]], Dict[str, Any]]


def desktop_host_peers(
    peers: Iterable[Any],
    *,
    roles: Dict[Any, str],
    is_desktop_host_role: RolePredicate,
) -> List[Any]:
    return [peer for peer in peers if is_desktop_host_role(roles.get(peer))]


def find_metadata_by_id(
    peers: Iterable[Any],
    metadata_by_peer: Dict[Any, Dict[str, Any]],
    *,
    id_key: str,
    id_value: Optional[str],
) -> Optional[Dict[str, Any]]:
    if not id_value:
        return None
    for peer in peers:
        metadata = metadata_by_peer.get(peer)
        if metadata and metadata.get(id_key) == id_value:
            return dict(metadata)
    return None


def build_room_host_registry_entries(
    peers: Iterable[Any],
    *,
    roles: Dict[Any, str],
    host_sessions: Dict[Any, Dict[str, Any]],
    active_host_id: Optional[str],
    host_descriptor_from_metadata: HostDescriptorBuilder,
    is_desktop_host_role: RolePredicate,
    default_host_label: str,
    default_platform: str,
) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for peer in desktop_host_peers(peers, roles=roles, is_desktop_host_role=is_desktop_host_role):
        metadata = host_sessions.get(peer)
        if not metadata:
            continue
        entries.append(
            host_registry_entry(
                metadata,
                host_descriptor_from_metadata(metadata),
                active_host_id=active_host_id,
                default_host_label=default_host_label,
                default_platform=default_platform,
            )
        )
    return sort_host_registry(entries)
