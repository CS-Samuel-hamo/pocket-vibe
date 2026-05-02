"""Tests for project and host registry presentation helpers."""

from backend.project_registry import (
    host_registry_entry,
    project_registry_entry,
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
