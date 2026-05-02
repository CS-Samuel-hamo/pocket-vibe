"""Tests for backend protocol route payload builders."""

from backend.protocol_routes import (
    approval_id,
    build_bridge_offline_event,
    build_approval_audit_event,
    build_approval_offline_result,
    build_approval_response_payload,
    build_approval_success_result,
    build_command_dispatch_event,
    build_command_dispatch_payload,
    build_context_request_payload,
    build_kill_audit_event,
    build_kill_offline_result,
    build_kill_request_payload,
    build_prompt_dispatch_event,
    build_prompt_submit_payload,
    build_user_prompt_event,
    build_workspace_focus_event,
    build_workspace_focus_payload,
    normalize_decision,
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


def test_approval_payloads_normalize_decision_and_target_project():
    data = {"approval_id": "a1", "decision": "YES", "target_runtime": "codex-cli"}
    decision = normalize_decision(data["decision"])

    payload = build_approval_response_payload(approval_id(data), decision, data, target_project=_target_project())
    result = build_approval_success_result("a1", decision, target_project=_target_project())
    audit = build_approval_audit_event("a1", decision, target_project=_target_project())

    assert payload["decision"] == "approved"
    assert payload["target_connection_id"] == "host-1"
    assert result["ok"] is True
    assert audit["category"] == "approval"


def test_approval_offline_result_preserves_runtime_and_reason():
    result = build_approval_offline_result(
        {"approval_id": "a1", "decision": "no", "target_runtime": "codex-cli"},
        target_project=_target_project(),
    )

    assert result["type"] == "approval.result"
    assert result["ok"] is False
    assert result["reason"] == "bridge_offline"
    assert result["target_runtime"] == "codex-cli"


def test_kill_payloads_preserve_reason_and_target_context():
    data = {"target_runtime": "codex-cli", "reason": "manual-test"}

    payload = build_kill_request_payload(data, target_project=_target_project())
    offline = build_kill_offline_result(data, target_project=_target_project())
    audit = build_kill_audit_event(data, target_project=_target_project())

    assert payload["type"] == "kill.request"
    assert payload["reason"] == "manual-test"
    assert offline["reason"] == "bridge_offline"
    assert audit["category"] == "kill"
