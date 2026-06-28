"""Higher-level route emission helpers for websocket control flows."""

from typing import Any, Awaitable, Callable, Dict, Optional

from backend.protocol_routes import (
    build_approval_audit_event,
    build_approval_success_result,
    build_prompt_dispatch_event,
    build_user_prompt_event,
)

EmitRoomEvent = Callable[..., Awaitable[None]]


async def emit_prompt_submit_events(
    *,
    room_token: str,
    prompt: str,
    target_project: Optional[Dict[str, Any]],
    target_runtime: Optional[str],
    exclude_ws: Any,
    emit_room_event: EmitRoomEvent,
) -> None:
    await emit_room_event(
        room_token,
        build_user_prompt_event(
            prompt,
            target_project=target_project,
            target_runtime=target_runtime,
        ),
        exclude_ws=exclude_ws,
        ignore_rate_limit=True,
        buffer_message=True,
    )
    await emit_room_event(
        room_token,
        build_prompt_dispatch_event(
            target_project=target_project,
            target_runtime=target_runtime,
        ),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def emit_approval_completion_events(
    *,
    room_token: str,
    approval_id_value: str,
    decision: str,
    target_project: Optional[Dict[str, Any]],
    emit_room_event: EmitRoomEvent,
) -> None:
    await emit_room_event(
        room_token,
        build_approval_success_result(
            approval_id_value,
            decision,
            target_project=target_project,
        ),
        ignore_rate_limit=True,
        buffer_message=True,
    )
    await emit_room_event(
        room_token,
        build_approval_audit_event(
            approval_id_value,
            decision,
            target_project=target_project,
        ),
        ignore_rate_limit=True,
        buffer_message=True,
    )
