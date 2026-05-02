"""Tests for room snapshot payload assembly."""

from backend.room_snapshot_payload import build_room_snapshot_payload


def _host_descriptor(metadata, **kwargs):
    return {
        "id": (metadata or {}).get("host_id", "desktop-host"),
        "health": kwargs.get("health"),
        "capabilities": kwargs.get("capabilities"),
    }


def test_build_room_snapshot_payload_uses_driver_fallback_without_active_host():
    result = build_room_snapshot_payload(
        active_project=None,
        active_host=None,
        project_registry=[],
        host_registry=[],
        project_state={"files": []},
        driver_active_runtime="codex-cli",
        driver_runtime_catalog=[{"id": "codex-cli"}],
        driver_session_capabilities=["prompt"],
        default_host_label="Desktop Host",
        host_descriptor_from_metadata=_host_descriptor,
    )

    assert result["active_project_id"] is None
    assert result["active_runtime"] == "codex-cli"
    assert result["runtime_catalog"] == [{"id": "codex-cli"}]
    assert result["host"]["health"] == "offline"
    assert result["bridge_label"] == "Desktop Host"


def test_build_room_snapshot_payload_prefers_active_project_and_host_values():
    result = build_room_snapshot_payload(
        active_project={
            "project_id": "p1",
            "active_runtime": "opencode",
            "runtime_catalog": [{"id": "opencode"}],
        },
        active_host={
            "host_id": "host-1",
            "host_label": "VS Code",
            "runtime_health": "ready",
            "session_capabilities": ["prompt", "kill"],
        },
        project_registry=[{"project_id": "p1"}],
        host_registry=[{"host_id": "host-1"}],
        project_state={"files": []},
        driver_active_runtime="codex-cli",
        driver_runtime_catalog=[{"id": "codex-cli"}],
        driver_session_capabilities=["prompt"],
        default_host_label="Desktop Host",
        host_descriptor_from_metadata=_host_descriptor,
    )

    assert result["active_project_id"] == "p1"
    assert result["active_host_id"] == "host-1"
    assert result["active_runtime"] == "opencode"
    assert result["runtime_catalog"] == [{"id": "opencode"}]
    assert result["host"]["health"] == "ready"
    assert result["bridge_label"] == "VS Code"
    assert result["session_capabilities"] == ["prompt", "kill"]
