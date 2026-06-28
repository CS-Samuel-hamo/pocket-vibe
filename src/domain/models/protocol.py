"""Protocol helpers for the Pocket Vibe v1 websocket contract."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional


SESSION_CAPABILITIES = [
    "prompt",
    "focus",
    "read_context",
    "approve",
    "kill",
    "run_script",
]


def build_host_descriptor(
    host: Optional[Dict[str, Any]] = None,
    *,
    bridge_label: str = "Desktop Host",
    capabilities: Optional[Iterable[str]] = None,
    health: Optional[str] = None,
    last_error: Optional[str] = None,
) -> Dict[str, Any]:
    """Normalize a desktop host descriptor for host-agnostic clients."""
    host_payload = dict(host or {})
    normalized_last_error = host_payload.get("last_error") or last_error
    normalized_capabilities = list(
        host_payload.get("capabilities")
        or host_payload.get("session_capabilities")
        or capabilities
        or []
    )
    return {
        "id": host_payload.get("id") or host_payload.get("host_id") or "desktop-host",
        "label": host_payload.get("label") or host_payload.get("host_label") or bridge_label,
        "platform": host_payload.get("platform") or host_payload.get("host_platform") or "desktop",
        "kind": host_payload.get("kind") or host_payload.get("host_kind") or "desktop-host",
        "version": host_payload.get("version") or host_payload.get("host_version"),
        "capabilities": normalized_capabilities,
        "health": host_payload.get("health")
        or host_payload.get("runtime_health")
        or health
        or ("degraded" if normalized_last_error else "ready"),
        "last_error": normalized_last_error,
    }


def build_session_state(
    room_token: str,
    role: str,
    *,
    bridge_connected: bool,
    host_connected: Optional[bool] = None,
    auth_mode: str,
    expires_at: Optional[float],
    project_state: Optional[Dict[str, Any]] = None,
    project_registry: Optional[Iterable[Dict[str, Any]]] = None,
    active_project_id: Optional[str] = None,
    host_registry: Optional[Iterable[Dict[str, Any]]] = None,
    active_host_id: Optional[str] = None,
    active_runtime: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a canonical session state event."""
    return {
        "type": "session.state",
        "room_token": room_token,
        "role": role,
        "bridge_connected": bridge_connected,
        "host_connected": bridge_connected if host_connected is None else host_connected,
        "auth_mode": auth_mode,
        "expires_at": expires_at,
        "project_state": project_state or {},
        "project_registry": list(project_registry or []),
        "active_project_id": active_project_id,
        "host_registry": list(host_registry or []),
        "active_host_id": active_host_id,
        "active_runtime": active_runtime,
    }


def build_capabilities(
    runtime_catalog: Iterable[Dict[str, Any]],
    *,
    session_capabilities: Optional[Iterable[str]] = None,
    active_runtime: Optional[str] = None,
    active_project_id: Optional[str] = None,
    project_registry: Optional[Iterable[Dict[str, Any]]] = None,
    host_registry: Optional[Iterable[Dict[str, Any]]] = None,
    active_host_id: Optional[str] = None,
    bridge_label: str = "VS Code Host",
    host: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build a capability manifest."""
    capabilities = list(session_capabilities or SESSION_CAPABILITIES)
    runtimes = list(runtime_catalog)
    host_descriptor = build_host_descriptor(
        host,
        bridge_label=bridge_label,
        capabilities=capabilities,
    )
    return {
        "type": "capabilities",
        "bridge": {
            "id": host_descriptor["id"],
            "label": host_descriptor["label"],
        },
        "host": host_descriptor,
        "session_capabilities": capabilities,
        "runtime_catalog": runtimes,
        "project_registry": list(project_registry or []),
        "active_project_id": active_project_id,
        "host_registry": list(host_registry or []),
        "active_host_id": active_host_id,
        "active_runtime": active_runtime,
    }


def build_execution_event(
    phase: str,
    message: str,
    **extra: Any,
) -> Dict[str, Any]:
    """Build a runtime execution event."""
    payload = {
        "type": "execution.event",
        "phase": phase,
        "message": message,
    }
    payload.update(extra)
    return payload


def build_audit_event(
    category: str,
    message: str,
    **extra: Any,
) -> Dict[str, Any]:
    """Build an audit event."""
    payload = {
        "type": "audit.event",
        "category": category,
        "message": message,
    }
    payload.update(extra)
    return payload


def _normalize_decision(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"y", "yes", "true", "approved", "approve"}:
        return "approved"
    if raw in {"n", "no", "false", "rejected", "reject"}:
        return "rejected"
    return raw or "unknown"


def normalize_protocol_message(data: Dict[str, Any]) -> Dict[str, Any]:
    """Map legacy message types onto the v1 protocol."""
    msg = dict(data)
    msg_type = msg.get("type")

    if msg_type in {
        "hello",
        "capabilities",
        "prompt.submit",
        "command.dispatch",
        "workspace.focus",
        "context.request",
        "context.result",
        "approval.request",
        "approval.response",
        "approval.result",
        "execution.event",
        "session.state",
        "project.select",
        "kill.request",
        "kill.result",
        "ping",
        "pong",
        "resume",
        "key_exchange",
        "encrypted",
        "audit.event",
    }:
        return msg

    if msg_type in {"user_input", "command"}:
        return {
            "type": "prompt.submit",
            "prompt": msg.get("content", ""),
            "target_runtime": msg.get("target_runtime"),
            "source_type": msg_type,
        }

    if msg_type == "run_command":
        return {
            "type": "command.dispatch",
            "action": "run_script",
            "command": msg.get("command", ""),
            "source_type": msg_type,
        }

    if msg_type in {"focus", "remote_focus"}:
        return {
            "type": "workspace.focus",
            "file": msg.get("file"),
            "line": msg.get("line"),
            "flash": msg.get("flash", False),
            "source_type": msg_type,
        }

    if msg_type == "request_context":
        return {
            "type": "context.request",
            "file": msg.get("file"),
            "line_start": msg.get("line_start"),
            "line_end": msg.get("line_end"),
            "position": msg.get("position"),
            "source_type": msg_type,
        }

    if msg_type == "context_update":
        return {
            "type": "context.result",
            "file": msg.get("file"),
            "lines": msg.get("lines", []),
            "position": msg.get("position"),
            "source_type": msg_type,
        }

    if msg_type == "confirm_required":
        return {
            "type": "approval.request",
            "approval_id": msg.get("id"),
            "tool_name": msg.get("tool_name"),
            "files": msg.get("files", []),
            "risk": msg.get("risk", "med"),
            "context": msg.get("context"),
            "source_type": msg_type,
        }

    if msg_type == "confirm_response":
        return {
            "type": "approval.response",
            "approval_id": msg.get("id") or msg.get("confirm_id"),
            "decision": _normalize_decision(msg.get("response")),
            "reason": msg.get("reason"),
            "source_type": msg_type,
        }

    if msg_type == "sniper_action":
        context = msg.get("context") or {}
        lines = msg.get("lines") or context.get("lines") or []
        return {
            "type": "command.dispatch",
            "action": msg.get("action"),
            "file": msg.get("file") or context.get("file"),
            "lines": lines,
            "instruction": msg.get("instruction", ""),
            "source_type": msg_type,
        }

    if msg_type == "project_state":
        project_state = dict(msg)
        project_state.pop("type", None)
        return {
            "type": "session.state",
            "project_state": project_state,
            "source_type": msg_type,
        }

    return msg


def approval_result_from_response(approval_id: str, decision: str, ok: bool) -> Dict[str, Any]:
    """Build an approval result packet."""
    return {
        "type": "approval.result",
        "approval_id": approval_id,
        "decision": _normalize_decision(decision),
        "ok": ok,
    }
