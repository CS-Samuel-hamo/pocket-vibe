"""Host and project metadata normalization for desktop bridge sessions."""

import time
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_RUNTIME_LABEL = "Desktop Host"


def _first_present(*values: Any) -> Any:
    for value in values:
        if value:
            return value
    return None


def _normalize_root(project_payload: Dict[str, Any]) -> Optional[str]:
    root_path = project_payload.get("root_path")
    if not root_path:
        return None
    return str(Path(root_path).resolve())


def _runtime_descriptor(
    runtime_entries: List[Dict[str, Any]],
    active_runtime: Optional[str],
) -> Optional[Dict[str, Any]]:
    return next((runtime for runtime in runtime_entries if runtime.get("id") == active_runtime), None)


def _host_identity(
    bridge_payload: Dict[str, Any],
    project_payload: Dict[str, Any],
    *,
    connection_id: str,
    bridge_label: str,
    default_platform: str,
) -> Dict[str, Any]:
    return {
        "host_id": _first_present(bridge_payload.get("host_id"), bridge_payload.get("id"), project_payload.get("host_id"), connection_id),
        "host_label": _first_present(bridge_payload.get("label"), project_payload.get("host_label"), project_payload.get("bridge_label"), bridge_label),
        "host_platform": _first_present(bridge_payload.get("platform"), project_payload.get("host_platform"), project_payload.get("platform"), default_platform),
        "host_kind": bridge_payload.get("kind") or "desktop-host",
        "host_version": _first_present(bridge_payload.get("version"), bridge_payload.get("bridge_version"), project_payload.get("host_version")),
    }


def _session_capabilities(
    explicit_capabilities: Optional[List[str]],
    bridge_payload: Dict[str, Any],
) -> List[str]:
    return list(explicit_capabilities or bridge_payload.get("session_capabilities") or bridge_payload.get("capabilities") or [])


def _runtime_state(
    active_descriptor: Optional[Dict[str, Any]],
    bridge_payload: Dict[str, Any],
    active_runtime: Optional[str],
) -> Dict[str, Any]:
    if active_descriptor:
        return {
            "runtime_label": active_descriptor.get("label"),
            "runtime_health": active_descriptor.get("health"),
            "status_detail": active_descriptor.get("status_detail"),
            "last_error": active_descriptor.get("last_error"),
        }
    return {
        "runtime_label": active_runtime or DEFAULT_RUNTIME_LABEL,
        "runtime_health": bridge_payload.get("health") or "offline",
        "status_detail": bridge_payload.get("status_detail"),
        "last_error": bridge_payload.get("last_error"),
    }


def _project_name(
    project_payload: Dict[str, Any],
    normalized_root: Optional[str],
    connection_id: str,
) -> str:
    root_name = Path(normalized_root).name if normalized_root else None
    return _first_present(project_payload.get("name"), project_payload.get("project_name"), root_name, f"Workspace {connection_id[-4:]}")


def _default_project_id(host_id: str, normalized_root: Optional[str]) -> str:
    if normalized_root:
        return f"{host_id}::{normalized_root.lower()}"
    return f"{host_id}::default"


def _project_id(project_payload: Dict[str, Any], host_id: str, normalized_root: Optional[str]) -> str:
    return _first_present(project_payload.get("id"), project_payload.get("project_id"), _default_project_id(host_id, normalized_root))


def _project_metadata(
    identity: Dict[str, Any],
    project_payload: Dict[str, Any],
    runtime_entries: List[Dict[str, Any]],
    runtime_state: Dict[str, Any],
    *,
    connection_id: str,
    active_runtime: Optional[str],
    normalized_root: Optional[str],
    updated_at: float,
) -> Dict[str, Any]:
    project_id = _project_id(project_payload, identity["host_id"], normalized_root)
    return {
        "project_id": project_id,
        "connection_id": connection_id,
        "project_name": _project_name(project_payload, normalized_root, connection_id),
        "workspace_path": normalized_root,
        "bridge_label": identity["host_label"],
        "active_runtime": active_runtime,
        "runtime_catalog": runtime_entries,
        "updated_at": updated_at,
        **identity,
        **runtime_state,
    }


def _session_metadata(
    identity: Dict[str, Any],
    project_metadata: Dict[str, Any],
    session_capabilities: List[str],
) -> Dict[str, Any]:
    return {
        **identity,
        "connection_id": project_metadata["connection_id"],
        "session_capabilities": session_capabilities,
        "active_project_id": project_metadata["project_id"],
        "active_runtime": project_metadata["active_runtime"],
        "runtime_catalog": project_metadata["runtime_catalog"],
        "runtime_label": project_metadata["runtime_label"],
        "runtime_health": project_metadata["runtime_health"],
        "status_detail": project_metadata["status_detail"],
        "last_error": project_metadata["last_error"],
        "updated_at": project_metadata["updated_at"],
    }


def build_host_session_payload(
    *,
    bridge: Optional[Dict[str, Any]],
    project: Optional[Dict[str, Any]],
    session_capabilities: Optional[List[str]],
    runtime_catalog: Optional[List[Dict[str, Any]]],
    active_runtime: Optional[str],
    connection_id: str,
    bridge_label: str,
    default_platform: str,
) -> Dict[str, Dict[str, Any]]:
    bridge_payload = dict(bridge or {})
    project_payload = dict(project or {})
    runtime_entries = list(runtime_catalog or [])
    normalized_root = _normalize_root(project_payload)
    identity = _host_identity(bridge_payload, project_payload, connection_id=connection_id, bridge_label=bridge_label, default_platform=default_platform)
    active_descriptor = _runtime_descriptor(runtime_entries, active_runtime)
    runtime_state = _runtime_state(active_descriptor, bridge_payload, active_runtime)
    metadata = _project_metadata(identity, project_payload, runtime_entries, runtime_state, connection_id=connection_id, active_runtime=active_runtime, normalized_root=normalized_root, updated_at=time.time())
    return {
        "project": metadata,
        "session": _session_metadata(identity, metadata, _session_capabilities(session_capabilities, bridge_payload)),
    }
