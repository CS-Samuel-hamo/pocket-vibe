"""Tests for backend protocol route payload builders."""

from backend.protocol_routes import (
    build_bridge_offline_event,
    build_prompt_dispatch_event,
    build_prompt_submit_payload,
    build_user_prompt_event,
)


def _target_project():
    return {"project_id": "p1", "connection_id": "host-1"}


def test_prompt_submit_payload_targets_project_connection_and_runtime():
    payload = build_prompt_submit_payload(
        "summarize",
        target_project=_target_project(),
        target_runtime="codex-cli",
    )

    assert payload == {
        "type": "prompt.submit",
        "prompt": "summarize",
        "project_id": "p1",
        "target_connection_id": "host-1",
        "target_runtime": "codex-cli",
    }


def test_user_prompt_event_preserves_project_and_runtime_context():
    event = build_user_prompt_event(
        "hello",
        target_project=_target_project(),
        target_runtime="codex-cli",
    )

    assert event["type"] == "user"
    assert event["content"] == "hello"
    assert event["project_id"] == "p1"
    assert event["target_runtime"] == "codex-cli"


def test_prompt_dispatch_event_uses_execution_event_contract():
    event = build_prompt_dispatch_event(target_project=_target_project(), target_runtime="codex-cli")

    assert event["type"] == "execution.event"
    assert event["phase"] == "dispatch"
    assert event["project_id"] == "p1"


def test_bridge_offline_event_uses_standard_reason():
    event = build_bridge_offline_event()

    assert event["type"] == "execution.event"
    assert event["phase"] == "error"
    assert event["reason"] == "bridge_offline"
