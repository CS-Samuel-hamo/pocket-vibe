"""Protocol message routing for mobile, desktop host, and runtime events."""

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional

from backend.protocol_dispatch import is_bridge_room_event, is_host_metadata_message
from backend.protocol_routes import (
    approval_id,
    build_approval_offline_result,
    build_approval_response_payload,
    build_bridge_offline_event,
    build_command_dispatch_event,
    build_command_dispatch_payload,
    build_context_request_payload,
    build_kill_audit_event,
    build_kill_offline_result,
    build_kill_request_payload,
    build_prompt_submit_payload,
    build_project_changed_event,
    build_project_unavailable_event,
    build_workspace_focus_event,
    build_workspace_focus_payload,
    normalize_decision,
    project_id_from_data,
)
from backend.route_flows import emit_approval_completion_events, emit_prompt_submit_events

Packet = Dict[str, Any]
AsyncHandler = Callable[..., Awaitable[None]]


@dataclass(frozen=True)
class ProtocolRouterDependencies:
    manager: Any
    driver: Any
    default_host_label: str
    is_desktop_host_role: Callable[[Optional[str]], bool]
    emit_room_event: AsyncHandler
    ensure_driver_running: Callable[[str], Awaitable[None]]
    broadcast_room_snapshot: Callable[[str], Awaitable[None]]
    send_initial_snapshot: Callable[[Any, str, str], Awaitable[None]]


class ProtocolRouter:
    def __init__(self, deps: ProtocolRouterDependencies) -> None:
        self.deps = deps

    def resolve_target_project(self, room_token: str, data: Optional[Packet] = None) -> Optional[Packet]:
        requested_project_id = str((data or {}).get("project_id") or "").strip() or None
        return self.deps.manager.get_active_host_project(room_token, preferred_project_id=requested_project_id)

    async def sync_bridge_metadata(self, data: Packet, room_token: str, websocket: Any) -> None:
        runtime_catalog = data.get("runtime_catalog")
        active_runtime = data.get("active_runtime")
        bridge_payload = self._bridge_payload(data)
        bridge_label = bridge_payload.get("label") or data.get("bridge_label") or self.deps.default_host_label
        self.deps.manager.update_host_session(
            websocket,
            bridge={
                **bridge_payload,
                "label": bridge_label,
                "version": bridge_payload.get("version") or data.get("bridge_version"),
                "session_capabilities": data.get("session_capabilities"),
            },
            project=data.get("project"),
            session_capabilities=data.get("session_capabilities"),
            runtime_catalog=runtime_catalog,
            active_runtime=active_runtime,
            bridge_label=bridge_label,
        )
        await self.deps.driver.update_runtime_catalog(runtime_catalog, active_runtime=active_runtime)
        await self.deps.broadcast_room_snapshot(room_token)

    @staticmethod
    def _bridge_payload(data: Packet) -> Packet:
        if isinstance(data.get("host"), dict):
            return data["host"]
        if isinstance(data.get("bridge"), dict):
            return data["bridge"]
        return {}

    async def route_prompt_submit(self, data: Packet, room_token: str, websocket: Any) -> None:
        prompt = str(data.get("prompt") or "").strip()
        if not prompt:
            return
        target_project = self.resolve_target_project(room_token, data)
        target_runtime = data.get("target_runtime")
        await emit_prompt_submit_events(
            room_token=room_token,
            prompt=prompt,
            target_project=target_project,
            target_runtime=target_runtime,
            exclude_ws=websocket,
            emit_room_event=self.deps.emit_room_event,
        )
        if not await self._desktop_host_ready(room_token, build_bridge_offline_event()):
            return
        await self.deps.ensure_driver_running(room_token)
        await self.deps.driver.dispatch_command(
            build_prompt_submit_payload(prompt, target_project=target_project, target_runtime=target_runtime)
        )

    async def _desktop_host_ready(self, room_token: str, offline_packet: Packet) -> bool:
        if self.deps.manager.room_has_desktop_host(room_token):
            return True
        await self.deps.emit_room_event(
            room_token,
            offline_packet,
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return False

    async def route_workspace_focus(self, data: Packet, room_token: str) -> None:
        target_project = self.resolve_target_project(room_token, data)
        if not await self._desktop_host_ready(room_token, build_bridge_offline_event()):
            return
        await self.deps.ensure_driver_running(room_token)
        await self.deps.driver.dispatch_command(build_workspace_focus_payload(data, target_project=target_project))
        await self.deps.emit_room_event(
            room_token,
            build_workspace_focus_event(
                data,
                target_project=target_project,
                target_runtime=target_project.get("active_runtime") if target_project else self.deps.driver.get_active_runtime(),
            ),
            ignore_rate_limit=True,
            buffer_message=True,
        )

    async def route_context_request(self, data: Packet, room_token: str) -> None:
        target_project = self.resolve_target_project(room_token, data)
        if not await self._desktop_host_ready(room_token, build_bridge_offline_event()):
            return
        await self.deps.ensure_driver_running(room_token)
        await self.deps.driver.dispatch_command(build_context_request_payload(data, target_project=target_project))

    async def route_command_dispatch(self, data: Packet, room_token: str) -> None:
        target_project = self.resolve_target_project(room_token, data)
        if not await self._desktop_host_ready(room_token, build_bridge_offline_event()):
            return
        await self.deps.ensure_driver_running(room_token)
        await self.deps.driver.dispatch_command(build_command_dispatch_payload(data, target_project=target_project))
        await self.deps.emit_room_event(
            room_token,
            build_command_dispatch_event(data, target_project=target_project),
            ignore_rate_limit=True,
            buffer_message=True,
        )

    async def route_approval_response(self, data: Packet, room_token: str) -> None:
        target_project = self.resolve_target_project(room_token, data)
        if not self.deps.manager.room_has_desktop_host(room_token):
            await self.deps.emit_room_event(
                room_token,
                build_approval_offline_result(data, target_project=target_project),
                ignore_rate_limit=True,
                buffer_message=True,
            )
            return
        approval_id_value = approval_id(data)
        decision = normalize_decision(data.get("decision"))
        await self.deps.driver.dispatch_command(
            build_approval_response_payload(approval_id_value, decision, data, target_project=target_project)
        )
        await emit_approval_completion_events(
            room_token=room_token,
            approval_id_value=approval_id_value,
            decision=decision,
            target_project=target_project,
            emit_room_event=self.deps.emit_room_event,
        )

    async def route_kill_request(self, data: Packet, room_token: str) -> None:
        target_project = self.resolve_target_project(room_token, data)
        if not self.deps.manager.room_has_desktop_host(room_token):
            await self.deps.emit_room_event(
                room_token,
                build_kill_offline_result(data, target_project=target_project),
                ignore_rate_limit=True,
                buffer_message=True,
            )
            return
        await self.deps.ensure_driver_running(room_token)
        await self.deps.driver.dispatch_command(build_kill_request_payload(data, target_project=target_project))
        await self.deps.emit_room_event(
            room_token,
            build_kill_audit_event(data, target_project=target_project),
            ignore_rate_limit=True,
            buffer_message=True,
        )

    async def route_project_select(self, data: Packet, room_token: str) -> None:
        project_id = project_id_from_data(data)
        if not project_id:
            return
        if not self.deps.manager.select_project(room_token, project_id):
            await self.deps.emit_room_event(
                room_token,
                build_project_unavailable_event(project_id),
                ignore_rate_limit=True,
                buffer_message=True,
            )
            return
        await self.deps.broadcast_room_snapshot(room_token)
        selected_project = self.deps.manager.get_active_host_project(room_token, preferred_project_id=project_id)
        await self.deps.emit_room_event(
            room_token,
            build_project_changed_event(project_id, selected_project),
            ignore_rate_limit=True,
            buffer_message=True,
        )

    async def handle_bridge_room_event(self, data: Packet, room_token: str, websocket: Any) -> None:
        packet = self._with_host_project_context(dict(data), websocket)
        await self.deps.emit_room_event(
            room_token,
            packet,
            exclude_ws=websocket,
            ignore_rate_limit=True,
            buffer_message=True,
        )

    def _with_host_project_context(self, packet: Packet, websocket: Any) -> Packet:
        packet_project_id = str(packet.get("project_id") or "").strip()
        room_token = getattr(self.deps.manager, "ws_to_room", {}).get(websocket)
        host_project = (
            self.deps.manager.get_project_entry(room_token, packet_project_id)
            if packet_project_id and room_token
            else self.deps.manager.host_projects.get(websocket)
        )
        if not host_project:
            return packet
        for key in ("project_id", "project_name", "host_id", "host_label", "host_platform", "bridge_label"):
            packet.setdefault(key, host_project.get(key))
        return packet

    async def handle_protocol_message(self, data: Packet, websocket: Any, room_token: str, role: str) -> None:
        msg_type = data.get("type")
        if is_host_metadata_message(role, msg_type, self.deps.is_desktop_host_role):
            await self.sync_bridge_metadata(data, room_token, websocket)
            await {"hello": self.deps.send_initial_snapshot}.get(msg_type, _skip_initial_snapshot)(websocket, room_token, role)
            return
        if is_bridge_room_event(role, msg_type, self.deps.is_desktop_host_role):
            await self.handle_bridge_room_event(data, room_token, websocket)
            return
        handler = self.protocol_dispatchers(data, websocket, room_token, role).get(msg_type)
        if handler:
            await handler()

    def protocol_dispatchers(self, data: Packet, websocket: Any, room_token: str, role: str) -> Dict[str, AsyncHandler]:
        return {
            "hello": lambda: self.deps.send_initial_snapshot(websocket, room_token, role),
            "prompt.submit": lambda: self.route_prompt_submit(data, room_token, websocket),
            "command.dispatch": lambda: self.route_command_dispatch(data, room_token),
            "workspace.focus": lambda: self.route_workspace_focus(data, room_token),
            "context.request": lambda: self.route_context_request(data, room_token),
            "approval.response": lambda: self.route_approval_response(data, room_token),
            "project.select": lambda: self.route_project_select(data, room_token),
            "kill.request": lambda: self.route_kill_request(data, room_token),
            "ping": lambda: self.deps.manager.send_packet(websocket, {"type": "pong"}, buffer_message=False),
        }


async def _skip_initial_snapshot(*_args: Any) -> None:
    return None
