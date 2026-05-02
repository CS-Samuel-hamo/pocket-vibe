"""Tests for websocket connection registry helpers."""

from backend.connection_registry import (
    build_room_host_registry_entries,
    desktop_host_peers,
    find_metadata_by_id,
)


def _is_desktop(role):
    return role in {"vscode-bridge", "desktop-host"}


def _descriptor(metadata):
    return {
        "id": metadata["host_id"],
        "label": metadata.get("host_label"),
        "platform": metadata.get("platform"),
        "kind": "vscode",
        "version": "test",
        "capabilities": ["prompt"],
        "health": metadata.get("runtime_health"),
        "last_error": None,
    }


def test_desktop_host_peers_filters_non_host_roles():
    result = desktop_host_peers(
        ["mobile", "bridge", "native"],
        roles={
            "mobile": "mobile",
            "bridge": "vscode-bridge",
            "native": "desktop-host",
        },
        is_desktop_host_role=_is_desktop,
    )

    assert result == ["bridge", "native"]


def test_find_metadata_by_id_returns_matching_copy():
    metadata = {"bridge": {"project_id": "p1", "name": "Pocket Vibe"}}

    result = find_metadata_by_id(
        ["bridge"],
        metadata,
        id_key="project_id",
        id_value="p1",
    )

    assert result == {"project_id": "p1", "name": "Pocket Vibe"}
    assert result is not metadata["bridge"]


def test_find_metadata_by_id_returns_none_without_id():
    assert find_metadata_by_id(["bridge"], {}, id_key="project_id", id_value=None) is None


def test_build_room_host_registry_entries_uses_desktop_hosts_only():
    result = build_room_host_registry_entries(
        ["mobile", "bridge"],
        roles={"mobile": "mobile", "bridge": "vscode-bridge"},
        host_sessions={
            "bridge": {
                "host_id": "host-1",
                "host_label": "VS Code",
                "platform": "vscode",
                "runtime_health": "ready",
            }
        },
        active_host_id="host-1",
        host_descriptor_from_metadata=_descriptor,
        is_desktop_host_role=_is_desktop,
        default_host_label="Desktop Host",
        default_platform="unknown",
    )

    assert len(result) == 1
    assert result[0]["host_id"] == "host-1"
    assert result[0]["selected"] is True
    assert result[0]["health"] == "ready"
