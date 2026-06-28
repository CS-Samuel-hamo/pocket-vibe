"""Tests for project and host registry presentation helpers."""

from backend.project_registry import (
    active_project_candidate,
    host_registry_entry,
    project_registry_entry,
    should_update_project_selection,
    should_replace_room_selection,
    sort_host_registry,
    sort_project_registry,
)


def _project(project_id, name, selected=False):
    return {"project_id": project_id, "project_name": name, "host_label": "VS Code", "selected": selected}


def test_project_registry_entry_marks_selected_and_defaults_runtime_health():
    metadata = {"project_id": "p1", "project_name": "Pocket", "host_id": "h1"}

    entry = project_registry_entry(
        metadata,
        selected_id="p1",
        default_host_label="Desktop Host",
        default_platform="desktop",
    )

    assert entry["selected"] is True
    assert entry["host_label"] == "Desktop Host"
    assert entry["host_platform"] == "desktop"
    assert entry["runtime_health"] == "offline"


def test_project_registry_sort_prioritizes_selected_project():
    entries = [_project("p2", "Beta"), _project("p1", "Alpha", selected=True)]

    sorted_entries = sort_project_registry(entries)

    assert [entry["project_id"] for entry in sorted_entries] == ["p1", "p2"]


def test_host_registry_entry_merges_descriptor_and_metadata():
    metadata = {"host_id": "h1", "session_capabilities": ["prompt"], "active_project_id": "p1"}
    descriptor = {
        "id": "h1",
        "label": "Codex App",
        "platform": "codex-app",
        "kind": "native-app",
        "version": "0.9",
        "capabilities": ["prompt"],
        "health": "ready",
        "last_error": None,
    }

    entry = host_registry_entry(
        metadata,
        descriptor,
        active_host_id="h1",
        default_host_label="Desktop Host",
        default_platform="desktop",
    )

    assert entry["selected"] is True
    assert entry["online"] is True
    assert entry["label"] == "Codex App"
    assert entry["session_capabilities"] == ["prompt"]


def test_host_registry_sort_prioritizes_selected_host():
    entries = [
        {"host_id": "h2", "host_label": "Beta", "host_platform": "desktop", "selected": False},
        {"host_id": "h1", "host_label": "Alpha", "host_platform": "desktop", "selected": True},
    ]

    sorted_entries = sort_host_registry(entries)

    assert [entry["host_id"] for entry in sorted_entries] == ["h1", "h2"]


def test_active_project_candidate_keeps_selected_workspace_project():
    selected = {"project_id": "p1", "workspace_path": "D:/repo", "runtime_health": "degraded"}
    fallback = {"project_id": "p2", "workspace_path": "D:/repo2", "runtime_health": "ready"}

    assert active_project_candidate([fallback], selected) == selected


def test_active_project_candidate_prefers_workspace_and_ready_runtime():
    projects = [
        {"project_id": "p1", "workspace_path": None, "runtime_health": "ready", "updated_at": 20},
        {"project_id": "p2", "workspace_path": "D:/repo2", "runtime_health": "ready", "updated_at": 10},
        {"project_id": "p3", "workspace_path": "D:/repo3", "runtime_health": "offline", "updated_at": 30},
    ]

    assert active_project_candidate(projects, selected=None)["project_id"] == "p2"


def test_project_selection_updates_only_when_selected_project_is_unusable():
    assert should_update_project_selection(None, None) is True
    assert should_update_project_selection("p1", {"project_id": "p1"}) is True
    assert should_update_project_selection("p1", {"project_id": "p1", "workspace_path": "D:/repo"}) is False


def test_room_selection_replacement_prefers_real_workspace():
    candidate = {"project_id": "new", "workspace_path": "D:/repo"}

    assert should_replace_room_selection(None, None, candidate) is True
    assert should_replace_room_selection("old", None, candidate) is True
    assert should_replace_room_selection("old", {"project_id": "old"}, candidate) is True
    assert should_replace_room_selection("old", {"project_id": "old", "workspace_path": "D:/old"}, candidate) is False
