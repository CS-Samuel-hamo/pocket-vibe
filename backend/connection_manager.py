"""Websocket connection manager for room, replay, and delivery state."""

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional
from uuid import uuid4

from backend.connection_disconnect import cleanup_disconnected_room, pop_connection_state
from backend.connection_peers import filter_room_peers
from backend.connection_registry import (
    build_room_host_registry_entries,
    desktop_host_peers,
    find_metadata_by_id,
)
from backend.connection_state import update_host_session_state
from backend.project_registry import (
    active_project_candidate,
    project_registry_entry,
    should_update_project_selection,
    sort_project_registry,
)

Packet = Dict[str, Any]
AsyncTokenBucket = Any
MessageBufferLike = Any


@dataclass(frozen=True)
class ConnectionManagerDependencies:
    desktop_target_role: str
    default_host_label: str
    default_host_platform: str
    is_desktop_host_role: Callable[[Optional[str]], bool]
    host_descriptor_from_metadata: Callable[..., Packet]
    message_buffer: MessageBufferLike
    rate_limiter: AsyncTokenBucket
    json_dumps: Callable[[Packet], str]
    e2ee_enabled: Callable[[], bool]
    encrypt: Callable[[str, bytes], Packet]
    logger: Any


class ConnectionManager:
    def __init__(self, dependencies: ConnectionManagerDependencies) -> None:
        self.deps = dependencies
        self.rooms: Dict[str, List[Any]] = {}
        self.roles: Dict[Any, str] = {}
        self.secrets: Dict[Any, bytes] = {}
        self.ws_to_room: Dict[Any, str] = {}
        self.connection_ids: Dict[Any, str] = {}
        self.host_sessions: Dict[Any, Dict[str, Any]] = {}
        self.host_projects: Dict[Any, Dict[str, Any]] = {}
        self.bridge_projects = self.host_projects
        self.room_project_selection: Dict[str, str] = {}

    async def connect(self, websocket: Any, token: str, role: str) -> None:
        await websocket.accept()
        self.rooms.setdefault(token, []).append(websocket)
        self.roles[websocket] = role
        self.ws_to_room[websocket] = token
        self.connection_ids[websocket] = f"host-{uuid4().hex[:10]}"

    def disconnect(self, websocket: Any) -> Optional[str]:
        record = pop_connection_state(
            websocket,
            roles=self.roles,
            secrets=self.secrets,
            ws_to_room=self.ws_to_room,
            connection_ids=self.connection_ids,
            host_sessions=self.host_sessions,
            host_projects=self.host_projects,
        )
        cleanup_disconnected_room(
            record,
            websocket=websocket,
            rooms=self.rooms,
            room_project_selection=self.room_project_selection,
            replacement_project=lambda: self.get_active_host_project(
                record.token or "",
                preferred_project_id=None,
            ),
        )
        return record.token

    async def get_peers_in_room(
        self,
        room_token: str,
        *,
        exclude_ws: Optional[Any] = None,
        role_filter: Optional[str] = None,
        target_connection_id: Optional[str] = None,
    ) -> List[Any]:
        return filter_room_peers(
            self.rooms.get(room_token, []),
            roles=self.roles,
            connection_ids=self.connection_ids,
            exclude_ws=exclude_ws,
            role_filter=role_filter,
            target_connection_id=target_connection_id,
            desktop_target_role=self.deps.desktop_target_role,
            is_desktop_host_role=self.deps.is_desktop_host_role,
        )

    def room_has_role(self, room_token: str, role: str) -> bool:
        return any(self.roles.get(peer) == role for peer in self.rooms.get(room_token, []))

    def room_has_desktop_host(self, room_token: str) -> bool:
        return any(self.deps.is_desktop_host_role(self.roles.get(peer)) for peer in self.rooms.get(room_token, []))

    def get_connection_id(self, websocket: Any) -> Optional[str]:
        return self.connection_ids.get(websocket)

    def update_host_session(
        self,
        websocket: Any,
        *,
        bridge: Optional[Dict[str, Any]] = None,
        project: Optional[Dict[str, Any]] = None,
        session_capabilities: Optional[List[str]] = None,
        runtime_catalog: Optional[List[Dict[str, Any]]] = None,
        active_runtime: Optional[str] = None,
        bridge_label: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        return update_host_session_state(
            self,
            websocket,
            payload_options={
                "bridge": bridge,
                "project": project,
                "session_capabilities": session_capabilities,
                "runtime_catalog": runtime_catalog,
                "active_runtime": active_runtime,
                "bridge_label": bridge_label or self.deps.default_host_label,
            },
            default_platform=self.deps.default_host_platform,
            is_desktop_host_role=self.deps.is_desktop_host_role,
        )

    def update_bridge_project(
        self,
        websocket: Any,
        *,
        project: Optional[Dict[str, Any]] = None,
        runtime_catalog: Optional[List[Dict[str, Any]]] = None,
        active_runtime: Optional[str] = None,
        bridge_label: str = "VS Code Host",
    ) -> Optional[Dict[str, Any]]:
        return self.update_host_session(
            websocket,
            bridge={"label": bridge_label},
            project=project,
            runtime_catalog=runtime_catalog,
            active_runtime=active_runtime,
            bridge_label=bridge_label,
        )

    def list_room_projects(self, room_token: str) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        selected_id = self.room_project_selection.get(room_token)
        for peer in self.rooms.get(room_token, []):
            for metadata in self._host_project_entries_for_peer(peer):
                entries.append(
                    project_registry_entry(
                        metadata,
                        selected_id=selected_id,
                        default_host_label=self.deps.default_host_label,
                        default_platform=self.deps.default_host_platform,
                    )
                )
        return sort_project_registry(entries)

    def _host_project_for_peer(self, peer: Any) -> Optional[Dict[str, Any]]:
        if not self.deps.is_desktop_host_role(self.roles.get(peer)):
            return None
        return self.host_projects.get(peer)

    @staticmethod
    def _dedup_project_entries(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for candidate in candidates:
            project_id = candidate.get("project_id") if isinstance(candidate, dict) else None
            if project_id and project_id not in seen:
                seen.add(project_id)
                entries.append(candidate)
        return entries

    def _host_project_entries_for_peer(self, peer: Any) -> List[Dict[str, Any]]:
        primary = self._host_project_for_peer(peer)
        if not primary:
            return []
        return self._dedup_project_entries([primary, *(primary.get("projects") or [])])

    def _room_project_entries(self, room_token: str) -> List[Dict[str, Any]]:
        return [
            project
            for peer in self._desktop_host_peers(room_token)
            for project in self._host_project_entries_for_peer(peer)
        ]

    def get_project_entry(
        self,
        room_token: str,
        project_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        return next(
            (dict(metadata) for metadata in self._room_project_entries(room_token) if metadata.get("project_id") == project_id),
            None,
        )

    def _desktop_host_peers(self, room_token: str) -> List[Any]:
        return desktop_host_peers(
            self.rooms.get(room_token, []),
            roles=self.roles,
            is_desktop_host_role=self.deps.is_desktop_host_role,
        )

    def get_active_host_project(
        self,
        room_token: str,
        preferred_project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        projects = [dict(project) for project in self._room_project_entries(room_token)]
        if not projects:
            return None
        return self._selected_or_fallback_project(room_token, preferred_project_id, projects)

    def _selected_or_fallback_project(
        self,
        room_token: str,
        preferred_project_id: Optional[str],
        projects: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        selected_id = preferred_project_id or self.room_project_selection.get(room_token)
        selected = self.get_project_entry(room_token, selected_id)
        fallback = active_project_candidate(projects, selected)
        if should_update_project_selection(selected_id, selected):
            self.room_project_selection[room_token] = fallback["project_id"]
        return fallback

    def get_active_bridge_project(
        self,
        room_token: str,
        preferred_project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        return self.get_active_host_project(room_token, preferred_project_id=preferred_project_id)

    def select_project(self, room_token: str, project_id: str) -> bool:
        if not self.get_project_entry(room_token, project_id):
            return False
        self.room_project_selection[room_token] = project_id
        return True

    def find_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        for peer in self.host_projects:
            for metadata in self._host_project_entries_for_peer(peer):
                if metadata.get("project_id") == project_id:
                    return dict(metadata)
        return None

    def list_room_hosts(self, room_token: str) -> List[Dict[str, Any]]:
        active_project = self.get_active_host_project(room_token)
        active_host_id = active_project.get("host_id") if active_project else None
        return build_room_host_registry_entries(
            self.rooms.get(room_token, []),
            roles=self.roles,
            host_sessions=self.host_sessions,
            active_host_id=active_host_id,
            host_descriptor_from_metadata=self.deps.host_descriptor_from_metadata,
            is_desktop_host_role=self.deps.is_desktop_host_role,
            default_host_label=self.deps.default_host_label,
            default_platform=self.deps.default_host_platform,
        )

    def get_host_entry(self, room_token: str, host_id: Optional[str]) -> Optional[Dict[str, Any]]:
        return find_metadata_by_id(
            self._desktop_host_peers(room_token),
            self.host_sessions,
            id_key="host_id",
            id_value=host_id,
        )

    def get_active_host(self, room_token: str) -> Optional[Dict[str, Any]]:
        active_project = self.get_active_host_project(room_token)
        if active_project:
            active_host = self.get_host_entry(room_token, active_project.get("host_id"))
            if active_host:
                return active_host
        hosts = self.list_room_hosts(room_token)
        return hosts[0] if hosts else None

    def get_active_host_id(self, room_token: str) -> Optional[str]:
        active_host = self.get_active_host(room_token)
        return active_host.get("host_id") if active_host else None

    def get_project_connection_id(
        self,
        room_token: str,
        project_id: Optional[str] = None,
    ) -> Optional[str]:
        project = self.get_active_host_project(room_token, preferred_project_id=project_id)
        if not project:
            return None
        return project.get("connection_id")

    async def replay_since(
        self,
        websocket: Any,
        last_seq_id: int,
        role: Optional[str] = None,
    ) -> None:
        current_role = role or self.roles.get(websocket)
        for packet in await self.deps.message_buffer.get_since(last_seq_id):
            if not self._packet_visible_to_role(packet, current_role):
                continue
            await websocket.send_text(await self._serialize_for_connection(packet, websocket))

    async def send_packet(
        self,
        websocket: Any,
        packet: Dict[str, Any],
        *,
        buffer_message: bool = False,
    ) -> Optional[Dict[str, Any]]:
        buffered = await self._buffer_packet(packet, buffer_message)
        try:
            await websocket.send_text(await self._serialize_for_connection(buffered, websocket))
            return buffered
        except Exception as exc:
            self.deps.logger.warning("Send failed for client: %s", exc)
            self.disconnect(websocket)
            return None

    async def send_to_room(
        self,
        room_token: str,
        packet: Dict[str, Any],
        *,
        role_filter: Optional[str] = None,
        exclude_ws: Optional[Any] = None,
        target_connection_id: Optional[str] = None,
        ignore_rate_limit: bool = False,
        buffer_message: bool = True,
    ) -> Optional[Dict[str, Any]]:
        if not await self._can_deliver(packet, ignore_rate_limit):
            return None
        return await self._send_buffered_to_room(
            room_token,
            await self._buffer_packet(packet, buffer_message),
            role_filter=role_filter,
            exclude_ws=exclude_ws,
            target_connection_id=target_connection_id,
        )

    async def _send_buffered_to_room(
        self,
        room_token: str,
        buffered: Dict[str, Any],
        *,
        role_filter: Optional[str],
        exclude_ws: Optional[Any],
        target_connection_id: Optional[str],
    ) -> Dict[str, Any]:
        peers = await self.get_peers_in_room(
            room_token,
            exclude_ws=exclude_ws,
            role_filter=role_filter,
            target_connection_id=target_connection_id,
        )
        for peer in peers:
            await self._send_buffered_to_peer(peer, buffered)
        return buffered

    async def _send_buffered_to_peer(self, peer: Any, buffered: Dict[str, Any]) -> None:
        try:
            await peer.send_text(await self._serialize_for_connection(buffered, peer))
        except Exception as exc:
            self.deps.logger.warning("Broadcast failed for client: %s", exc)
            self.disconnect(peer)

    async def _can_deliver(self, packet: Dict[str, Any], ignore_rate_limit: bool) -> bool:
        if ignore_rate_limit:
            return True
        packet_type = packet.get("type")
        if packet_type == "log":
            return await self.deps.rate_limiter.consume()
        if packet_type == "execution.event" and packet.get("phase") in {"thinking", "output"}:
            return await self.deps.rate_limiter.consume()
        return True

    async def _buffer_packet(
        self, packet: Dict[str, Any], buffer_message: bool
    ) -> Dict[str, Any]:
        if not buffer_message:
            return dict(packet)
        if "seq_id" in packet and "timestamp" in packet:
            return dict(packet)
        return await self.deps.message_buffer.push_and_get(packet)

    async def _serialize_for_connection(
        self, packet: Dict[str, Any], websocket: Any
    ) -> str:
        if packet.get("type") in {"key_exchange", "pong"}:
            return self.deps.json_dumps(packet)
        if self.deps.e2ee_enabled() and websocket in self.secrets:
            encrypted = self.deps.encrypt(self.deps.json_dumps(packet), self.secrets[websocket])
            return self.deps.json_dumps({"type": "encrypted", **encrypted})
        return self.deps.json_dumps(packet)

    def _packet_visible_to_role(
        self,
        packet: Dict[str, Any],
        role: Optional[str],
    ) -> bool:
        target_role = packet.get("target_role")
        if target_role:
            return self._target_role_matches(target_role, role)
        if packet.get("delivery") == "desktop":
            return role == "desktop" or self.deps.is_desktop_host_role(role)
        return True

    def _target_role_matches(self, target_role: str, role: Optional[str]) -> bool:
        if target_role == self.deps.desktop_target_role:
            return self.deps.is_desktop_host_role(role)
        return role == target_role
