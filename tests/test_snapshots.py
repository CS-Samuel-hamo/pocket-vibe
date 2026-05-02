"""Tests for snapshot packet builders."""

from backend.snapshots import build_snapshot_packets


def _snapshot():
    return {
        "project_state": {"files": []},
        "project_registry": [{"project_id": "p1"}],
        "active_project_id": "p1",
        "host_registry": [{"host_id": "h1"}],
        "active_host_id": "h1",
        "active_runtime": "codex-cli",
        "runtime_catalog": [{"id": "codex-cli"}],
        "session_capabilities": ["prompt"],
        "bridge_label": "VS Code Host",
        "host": {"id": "h1", "label": "VS Code Host", "health": "ready"},
    }


def test_build_snapshot_packets_preserves_session_and_capability_contract():
    session_packet, capabilities_packet = build_snapshot_packets(
        "room-1",
        "mobile",
        _snapshot(),
        host_connected=True,
        auth_mode="configured",
        expires_at=None,
    )

    assert session_packet["type"] == "session.state"
    assert session_packet["role"] == "mobile"
    assert session_packet["host_connected"] is True
    assert session_packet["active_project_id"] == "p1"
    assert capabilities_packet["type"] == "capabilities"
    assert capabilities_packet["active_runtime"] == "codex-cli"
    assert capabilities_packet["host"]["label"] == "VS Code Host"
