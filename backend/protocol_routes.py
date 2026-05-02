"""Payload builders for backend protocol route handlers."""

from typing import Any, Dict, Optional

from src.domain.models.protocol import approval_result_from_response, build_audit_event, build_execution_event


def _project_id(target_project: Optional[Dict[str, Any]]) -> Optional[str]:
    return target_project.get("project_id") if target_project else None


def _connection_id(target_project: Optional[Dict[str, Any]]) -> Optional[str]:
    return target_project.get("connection_id") if target_project else None


def _target_context(target_project: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "project_id": _project_id(target_project),
        "target_connection_id": _connection_id(target_project),
    }


def build_user_prompt_event(
    prompt: str,
    *,
    target_project: Optional[Dict[str, Any]],
    target_runtime: Optional[str],
) -> Dict[str, Any]:
    return {
        "type": "user",
        "content": prompt,
        "project_id": _project_id(target_project),
        "target_runtime": target_runtime,
    }


def build_prompt_dispatch_event(
    *,
    target_project: Optional[Dict[str, Any]],
    target_runtime: Optional[str],
) -> Dict[str, Any]:
    return build_execution_event(
        "dispatch",
        "Prompt dispatched to desktop host",
        project_id=_project_id(target_project),
        target_runtime=target_runtime,
    )


def build_bridge_offline_event() -> Dict[str, Any]:
    return build_execution_event("error", "No desktop host is connected", reason="bridge_offline")


def build_prompt_submit_payload(
    prompt: str,
    *,
    target_project: Optional[Dict[str, Any]],
    target_runtime: Optional[str],
) -> Dict[str, Any]:
    return {
        "type": "prompt.submit",
        "prompt": prompt,
        "target_runtime": target_runtime,
        **_target_context(target_project),
    }


def build_workspace_focus_payload(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "type": "workspace.focus",
        "file": data.get("file"),
        "line": data.get("line"),
        "flash": data.get("flash"),
        **_target_context(target_project),
    }


def build_workspace_focus_event(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
    target_runtime: Optional[str],
) -> Dict[str, Any]:
    return build_execution_event(
        "dispatch",
        "Focus request sent to desktop host",
        file=data.get("file"),
        line=data.get("line"),
        project_id=_project_id(target_project),
        target_runtime=target_runtime,
        reason="workspace.focus",
    )


def build_context_request_payload(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "type": "context.request",
        "file": data.get("file"),
        "line_start": data.get("line_start"),
        "line_end": data.get("line_end"),
        "position": data.get("position"),
        **_target_context(target_project),
    }


def build_command_dispatch_payload(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "type": "command.dispatch",
        "action": data.get("action"),
        "command": data.get("command"),
        "file": data.get("file"),
        "line": data.get("line"),
        "lines": data.get("lines", []),
        "instruction": data.get("instruction"),
        "target_runtime": data.get("target_runtime"),
        **_target_context(target_project),
    }


def build_command_dispatch_event(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return build_execution_event(
        "dispatch",
        "Command dispatched to desktop host",
        action=data.get("action"),
        project_id=_project_id(target_project),
        target_runtime=data.get("target_runtime"),
        file=data.get("file"),
        reason="desktop_dispatch",
    )


def approval_id(data: Dict[str, Any]) -> str:
    return str(data.get("approval_id") or "")


def normalize_decision(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"approved", "approve", "y", "yes", "true"}:
        return "approved"
    if raw in {"rejected", "reject", "n", "no", "false"}:
        return "rejected"
    return raw or "unknown"


def build_approval_offline_result(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        **approval_result_from_response(approval_id(data), str(data.get("decision") or ""), False),
        "reason": "bridge_offline",
        "project_id": _project_id(target_project),
        "target_runtime": data.get("target_runtime"),
    }


def build_approval_response_payload(
    approval_id_value: str,
    decision: str,
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "type": "approval.response",
        "approval_id": approval_id_value,
        "decision": decision,
        "target_runtime": data.get("target_runtime"),
        **_target_context(target_project),
    }


def build_approval_success_result(
    approval_id_value: str,
    decision: str,
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        **approval_result_from_response(approval_id_value, decision, True),
        "project_id": _project_id(target_project),
    }


def build_approval_audit_event(
    approval_id_value: str,
    decision: str,
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return build_audit_event(
        "approval",
        "Approval response forwarded",
        approval_id=approval_id_value,
        decision=decision,
        ok=True,
        project_id=_project_id(target_project),
    )


def build_kill_offline_result(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "type": "kill.result",
        "ok": False,
        "message": "No desktop host is connected",
        "reason": "bridge_offline",
        "project_id": _project_id(target_project),
        "target_runtime": data.get("target_runtime"),
    }


def build_kill_request_payload(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "type": "kill.request",
        "target_runtime": data.get("target_runtime"),
        "reason": data.get("reason"),
        **_target_context(target_project),
    }


def build_kill_audit_event(
    data: Dict[str, Any],
    *,
    target_project: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    return build_audit_event(
        "kill",
        "Kill request sent to desktop host",
        project_id=_project_id(target_project),
        target_runtime=data.get("target_runtime"),
        reason="desktop_dispatch",
    )
