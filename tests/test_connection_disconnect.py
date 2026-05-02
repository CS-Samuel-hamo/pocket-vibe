"""Tests for websocket connection teardown helpers."""

from backend.connection_disconnect import cleanup_disconnected_room, pop_connection_state


def test_pop_connection_state_removes_socket_metadata():
    websocket = "ws"
    roles = {websocket: "mobile"}
    secrets = {websocket: b"secret"}
    ws_to_room = {websocket: "room-1"}
    connection_ids = {websocket: "host-1"}
    host_sessions = {websocket: {"host_id": "host-1"}}
    host_projects = {websocket: {"project_id": "p1"}}

    record = pop_connection_state(
        websocket,
        roles=roles,
        secrets=secrets,
        ws_to_room=ws_to_room,
        connection_ids=connection_ids,
        host_sessions=host_sessions,
        host_projects=host_projects,
    )

    assert record.token == "room-1"
    assert record.removed_connection_id == "host-1"
    assert record.removed_project_id == "p1"
    assert roles == {}
    assert host_projects == {}


def test_cleanup_disconnected_room_removes_empty_room_selection():
    rooms = {"room-1": ["ws"]}
    selections = {"room-1": "p1"}
    record = pop_connection_state(
        "ws",
        roles={"ws": "mobile"},
        secrets={},
        ws_to_room={"ws": "room-1"},
        connection_ids={},
        host_sessions={},
        host_projects={},
    )

    cleanup_disconnected_room(
        record,
        websocket="ws",
        rooms=rooms,
        room_project_selection=selections,
        replacement_project=lambda: None,
    )

    assert rooms == {}
    assert selections == {}


def test_cleanup_disconnected_room_replaces_removed_selected_project():
    rooms = {"room-1": ["removed", "remaining"]}
    selections = {"room-1": "p1"}
    record = pop_connection_state(
        "removed",
        roles={"removed": "vscode-bridge"},
        secrets={},
        ws_to_room={"removed": "room-1"},
        connection_ids={"removed": "host-1"},
        host_sessions={},
        host_projects={"removed": {"project_id": "p1"}},
    )

    cleanup_disconnected_room(
        record,
        websocket="removed",
        rooms=rooms,
        room_project_selection=selections,
        replacement_project=lambda: {"project_id": "p2"},
    )

    assert rooms == {"room-1": ["remaining"]}
    assert selections == {"room-1": "p2"}


def test_cleanup_disconnected_room_clears_orphaned_selection():
    record = pop_connection_state(
        "ws",
        roles={},
        secrets={},
        ws_to_room={"ws": "room-1"},
        connection_ids={"ws": "host-1"},
        host_sessions={},
        host_projects={},
    )
    selections = {"room-1": "p1"}

    cleanup_disconnected_room(
        record,
        websocket="ws",
        rooms={},
        room_project_selection=selections,
        replacement_project=lambda: None,
    )

    assert selections == {}
