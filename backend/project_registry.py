"""Project and host registry presentation helpers."""

from typing import Any, Dict, List, Optional


def project_registry_entry(
    metadata: Dict[str, Any],
    *,
    selected_id: str,
    default_host_label: str,
    default_platform: str,
) -> Dict[str, Any]:
    return {
        "project_id": metadata["project_id"],
        "project_name": metadata["project_name"],
        "workspace_path": metadata.get("workspace_path"),
        "host_id": metadata.get("host_id"),
        "host_label": metadata.get("host_label", default_host_label),
        "host_kind": metadata.get("host_kind", "desktop-host"),
        "host_version": metadata.get("host_version"),
        "bridge_label": metadata.get("host_label", default_host_label),
        "host_platform": metadata.get("host_platform", default_platform),
        "active_runtime": metadata.get("active_runtime"),
        "runtime_label": metadata.get("runtime_label"),
        "runtime_health": metadata.get("runtime_health", "offline"),
        "status_detail": metadata.get("status_detail"),
        "last_error": metadata.get("last_error"),
        "updated_at": metadata.get("updated_at"),
        "selected": metadata["project_id"] == selected_id,
    }


def sort_project_registry(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        entries,
        key=lambda item: (
            0 if item["selected"] else 1,
            str(item.get("project_name") or "").lower(),
            str(item.get("bridge_label") or "").lower(),
        ),
    )


def host_registry_entry(
    metadata: Dict[str, Any],
    descriptor: Dict[str, Any],
    *,
    active_host_id: str,
    default_host_label: str,
    default_platform: str,
) -> Dict[str, Any]:
    entry = _host_descriptor_fields(descriptor)
    entry.update(_host_metadata_fields(metadata, default_host_label, default_platform))
    entry["selected"] = metadata["host_id"] == active_host_id
    entry["online"] = True
    return entry


def _host_descriptor_fields(descriptor: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": descriptor["id"],
        "label": descriptor["label"],
        "platform": descriptor["platform"],
        "kind": descriptor["kind"],
        "version": descriptor["version"],
        "capabilities": descriptor["capabilities"],
        "health": descriptor["health"],
        "last_error": descriptor["last_error"],
    }


def _host_metadata_fields(
    metadata: Dict[str, Any],
    default_host_label: str,
    default_platform: str,
) -> Dict[str, Any]:
    return {
        "host_id": metadata["host_id"],
        "connection_id": metadata.get("connection_id"),
        "host_label": metadata.get("host_label", default_host_label),
        "host_platform": metadata.get("host_platform", default_platform),
        "host_kind": metadata.get("host_kind", "desktop-host"),
        "host_version": metadata.get("host_version"),
        "session_capabilities": list(metadata.get("session_capabilities") or []),
        "active_project_id": metadata.get("active_project_id"),
        "active_runtime": metadata.get("active_runtime"),
        "runtime_label": metadata.get("runtime_label"),
        "runtime_health": metadata.get("runtime_health", "offline"),
        "status_detail": metadata.get("status_detail"),
        "updated_at": metadata.get("updated_at"),
    }


def sort_host_registry(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        entries,
        key=lambda item: (
            0 if item["selected"] else 1,
            str(item.get("host_label") or "").lower(),
            str(item.get("host_platform") or "").lower(),
        ),
    )


def sort_active_project_candidates(projects: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        projects,
        key=lambda item: (
            0 if item.get("workspace_path") else 1,
            0 if item.get("runtime_health") == "ready" else 1,
            -float(item.get("updated_at", 0) or 0),
        ),
    )


def active_project_candidate(
    projects: List[Dict[str, Any]],
    selected: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if selected and selected.get("workspace_path"):
        return selected
    if not projects:
        return None
    return sort_active_project_candidates(projects)[0]


def should_update_project_selection(
    selected_id: Optional[str],
    selected: Optional[Dict[str, Any]],
) -> bool:
    return not selected_id or not selected or not selected.get("workspace_path")
