"""Tests for project state payload normalization."""

from backend.project_state_payload import build_project_state_payload


def test_build_project_state_payload_removes_protocol_type():
    result = build_project_state_payload({"type": "session.state", "files": []})

    assert result == {"files": []}


def test_build_project_state_payload_adds_present_project_metadata():
    result = build_project_state_payload(
        {"files": []},
        project_id="p1",
        project_name="Pocket Vibe",
        workspace_path="D:/AI_projects/Pocket_Vibe",
        host_label="VS Code",
        host_id="host-1",
    )

    assert result["project_id"] == "p1"
    assert result["project_name"] == "Pocket Vibe"
    assert result["workspace_path"] == "D:/AI_projects/Pocket_Vibe"
    assert result["host_label"] == "VS Code"
    assert result["host_id"] == "host-1"


def test_build_project_state_payload_skips_empty_metadata_values():
    result = build_project_state_payload(
        {"files": []},
        project_id="",
        project_name=None,
        host_label="Desktop",
    )

    assert "project_id" not in result
    assert "project_name" not in result
    assert result["host_label"] == "Desktop"
