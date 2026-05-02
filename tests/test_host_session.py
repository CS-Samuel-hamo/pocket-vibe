"""Tests for desktop host session metadata normalization."""

from backend.host_session import build_host_session_payload


def test_host_session_prefers_runtime_health_and_project_root():
    payload = build_host_session_payload(
        bridge={"label": "VS Code Host"},
        project={"name": "Pocket_Vibe", "root_path": "D:/AI_projects/Pocket_Vibe"},
        session_capabilities=["prompt"],
        runtime_catalog=[{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        active_runtime="codex-cli",
        connection_id="host-1234567890",
        bridge_label="Fallback Host",
        default_platform="desktop",
    )

    project = payload["project"]
    session = payload["session"]
    assert project["project_name"] == "Pocket_Vibe"
    assert project["host_label"] == "VS Code Host"
    assert project["runtime_label"] == "Codex CLI"
    assert project["runtime_health"] == "ready"
    assert session["session_capabilities"] == ["prompt"]
    assert session["active_project_id"] == project["project_id"]


def test_host_session_preserves_native_host_identity():
    payload = build_host_session_payload(
        bridge={"id": "native-1", "label": "Codex App", "platform": "codex-app", "kind": "native-app"},
        project={"project_name": "NativeProject", "host_version": "0.9"},
        session_capabilities=None,
        runtime_catalog=[],
        active_runtime=None,
        connection_id="host-abcdef1234",
        bridge_label="Desktop Host",
        default_platform="desktop",
    )

    project = payload["project"]
    session = payload["session"]
    assert project["project_id"] == "native-1::default"
    assert project["host_kind"] == "native-app"
    assert project["host_platform"] == "codex-app"
    assert project["host_version"] == "0.9"
    assert session["runtime_health"] == "offline"


def test_host_session_uses_bridge_capabilities_when_explicit_missing():
    payload = build_host_session_payload(
        bridge={"capabilities": ["prompt", "kill"], "health": "degraded", "last_error": "probe only"},
        project={},
        session_capabilities=None,
        runtime_catalog=[],
        active_runtime="probe",
        connection_id="host-abcdef1234",
        bridge_label="Probe Host",
        default_platform="desktop",
    )

    assert payload["project"]["project_name"] == "Workspace 1234"
    assert payload["project"]["runtime_label"] == "probe"
    assert payload["project"]["runtime_health"] == "degraded"
    assert payload["project"]["last_error"] == "probe only"
    assert payload["session"]["session_capabilities"] == ["prompt", "kill"]


def test_host_session_normalizes_multiple_workspace_projects():
    payload = build_host_session_payload(
        bridge={"id": "vscode-host-1", "label": "VS Code Host"},
        project={
            "name": "Pocket_Vibe",
            "root_path": "D:/AI_projects/Pocket_Vibe",
            "projects": [
                {"name": "Pocket_Vibe", "root_path": "D:/AI_projects/Pocket_Vibe"},
                {"name": "GeoDigest", "root_path": "D:/AI_projects/GeoDigest"},
            ],
        },
        session_capabilities=["prompt"],
        runtime_catalog=[{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        active_runtime="codex-cli",
        connection_id="host-abcdef1234",
        bridge_label="VS Code Host",
        default_platform="desktop",
    )

    project = payload["project"]

    assert project["project_name"] == "Pocket_Vibe"
    assert [item["project_name"] for item in project["projects"]] == ["Pocket_Vibe", "GeoDigest"]
    assert project["projects"][1]["connection_id"] == project["connection_id"]
    assert project["projects"][1]["runtime_label"] == "Codex CLI"
