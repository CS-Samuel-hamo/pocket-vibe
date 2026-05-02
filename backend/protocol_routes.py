"""Payload builders for backend protocol route handlers."""

from typing import Any, Dict, Optional

from src.domain.models.protocol import build_execution_event


def _project_id(target_project: Optional[Dict[str, Any]]) -> Optional[str]:
    return target_project.get("project_id") if target_project else None


def _connection_id(target_project: Optional[Dict[str, Any]]) -> Optional[str]:
    return target_project.get("connection_id") if target_project else None


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
        "project_id": _project_id(target_project),
        "target_connection_id": _connection_id(target_project),
        "target_runtime": target_runtime,
    }
