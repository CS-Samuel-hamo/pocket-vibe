"""Project state payload normalization helpers."""

from typing import Any, Dict, Optional


def build_project_state_payload(
    state: Dict[str, Any],
    *,
    project_id: Optional[str] = None,
    project_name: Optional[str] = None,
    workspace_path: Optional[str] = None,
    host_label: Optional[str] = None,
    host_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload = dict(state)
    payload.pop("type", None)
    payload.update(
        {
            key: value
            for key, value in {
                "project_id": project_id,
                "project_name": project_name,
                "workspace_path": workspace_path,
                "host_label": host_label,
                "host_id": host_id,
            }.items()
            if value
        }
    )
    return payload
