"""Room snapshot payload assembly helpers."""

from typing import Any, Callable, Dict, List, Optional


def _value(source: Optional[Dict[str, Any]], key: str, default: Any = None) -> Any:
    if not source:
        return default
    return source.get(key, default)


def _snapshot_session_capabilities(
    active_host: Optional[Dict[str, Any]],
    fallback_capabilities: List[str],
) -> List[str]:
    return _value(active_host, "session_capabilities", fallback_capabilities)


def _snapshot_host_descriptor(
    active_host: Optional[Dict[str, Any]],
    session_capabilities: List[str],
    host_descriptor_from_metadata: Callable[..., Dict[str, Any]],
) -> Dict[str, Any]:
    return host_descriptor_from_metadata(
        active_host,
        capabilities=session_capabilities,
        health=_value(active_host, "runtime_health", "offline"),
    )


def build_room_snapshot_payload(
    *,
    active_project: Optional[Dict[str, Any]],
    active_host: Optional[Dict[str, Any]],
    project_registry: List[Dict[str, Any]],
    host_registry: List[Dict[str, Any]],
    project_state: Dict[str, Any],
    driver_active_runtime: Optional[str],
    driver_runtime_catalog: List[Dict[str, Any]],
    driver_session_capabilities: List[str],
    default_host_label: str,
    host_descriptor_from_metadata: Callable[..., Dict[str, Any]],
) -> Dict[str, Any]:
    session_capabilities = _snapshot_session_capabilities(active_host, driver_session_capabilities)
    return {
        "project_registry": project_registry,
        "active_project_id": _value(active_project, "project_id"),
        "host_registry": host_registry,
        "active_host_id": _value(active_host, "host_id"),
        "project_state": project_state,
        "active_runtime": _value(active_project, "active_runtime", driver_active_runtime),
        "runtime_catalog": _value(active_project, "runtime_catalog", driver_runtime_catalog),
        "host": _snapshot_host_descriptor(active_host, session_capabilities, host_descriptor_from_metadata),
        "bridge_label": _value(active_host, "host_label", default_host_label),
        "session_capabilities": session_capabilities,
    }
