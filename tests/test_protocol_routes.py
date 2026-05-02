"""Tests for backend protocol route payload builders."""

from backend.protocol_routes import (
    build_bridge_offline_event,
    build_command_dispatch_event,
    build_command_dispatch_payload,
    build_context_request_payload,
    build_prompt_dispatch_event,
    build_prompt_submit_payload,
    build_user_prompt_event,
    build_workspace_focus_event,
    build_workspace_focus_payload,
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


def test_workspace_focus_payload_targets_project_connection():
    payload = build_workspace_focus_payload(
        {"file": "app.py", "line": 12, "flash": True},
        target_project=_target_project(),
    )

    assert payload["type"] == "workspace.focus"
    assert payload["file"] == "app.py"
    assert payload["target_connection_id"] == "host-1"


def test_workspace_focus_event_carries_target_runtime():
    event = build_workspace_focus_event(
        {"file": "app.py", "line": 12},
        target_project=_target_project(),
        target_runtime="codex-cli",
    )

    assert event["phase"] == "dispatch"
    assert event["reason"] == "workspace.focus"
    assert event["target_runtime"] == "codex-cli"


def test_context_request_payload_keeps_range_fields():
    payload = build_context_request_payload(
        {"file": "app.py", "line_start": 1, "line_end": 5, "position": {"line": 2}},
        target_project=_target_project(),
    )

    assert payload["type"] == "context.request"
    assert payload["line_start"] == 1
    assert payload["line_end"] == 5
    assert payload["project_id"] == "p1"


def test_command_dispatch_payload_and_event_share_target_context():
    data = {"action": "run_script", "command": "npm test", "file": "package.json", "target_runtime": "codex-cli"}

    payload = build_command_dispatch_payload(data, target_project=_target_project())
    event = build_command_dispatch_event(data, target_project=_target_project())

    assert payload["type"] == "command.dispatch"
    assert payload["target_connection_id"] == "host-1"
    assert event["phase"] == "dispatch"
    assert event["reason"] == "desktop_dispatch"
