"""Tests for websocket route emission helpers."""

import pytest

from backend.route_flows import emit_approval_completion_events, emit_prompt_submit_events


@pytest.mark.asyncio
async def test_emit_prompt_submit_events_sends_user_and_dispatch_events():
    emitted = []

    async def emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    await emit_prompt_submit_events(
        room_token="room-1",
        prompt="ship it",
        target_project={"project_id": "p1"},
        target_runtime="codex-cli",
        exclude_ws="mobile-ws",
        emit_room_event=emit,
    )

    assert emitted[0][1]["type"] == "user"
    assert emitted[0][1]["content"] == "ship it"
    assert emitted[0][1]["target_runtime"] == "codex-cli"
    assert emitted[0][2]["exclude_ws"] == "mobile-ws"
    assert emitted[1][1]["phase"] == "dispatch"
    assert emitted[1][2]["buffer_message"] is True


@pytest.mark.asyncio
async def test_emit_approval_completion_events_sends_result_and_audit():
    emitted = []

    async def emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    await emit_approval_completion_events(
        room_token="room-1",
        approval_id_value="approval-1",
        decision="approved",
        target_project={"project_id": "p1"},
        emit_room_event=emit,
    )

    assert emitted[0][1]["type"] == "approval.result"
    assert emitted[0][1]["ok"] is True
    assert emitted[1][1]["type"] == "audit.event"
    assert emitted[1][1]["category"] == "approval"
    assert emitted[1][1]["approval_id"] == "approval-1"
    assert all(item[2]["ignore_rate_limit"] is True for item in emitted)
