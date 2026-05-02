"""Tests for websocket room peer filtering."""

from backend.connection_peers import filter_room_peers


def _is_desktop(role):
    return role in {"vscode-bridge", "desktop-host"}


def test_filter_room_peers_excludes_sender():
    result = filter_room_peers(
        ["mobile", "bridge"],
        roles={"mobile": "mobile", "bridge": "vscode-bridge"},
        connection_ids={},
        exclude_ws="mobile",
        role_filter=None,
        target_connection_id=None,
        desktop_target_role="desktop-host",
        is_desktop_host_role=_is_desktop,
    )

    assert result == ["bridge"]


def test_filter_room_peers_matches_desktop_target_role_alias():
    result = filter_room_peers(
        ["mobile", "bridge", "native"],
        roles={
            "mobile": "mobile",
            "bridge": "vscode-bridge",
            "native": "desktop-host",
        },
        connection_ids={},
        exclude_ws=None,
        role_filter="desktop-host",
        target_connection_id=None,
        desktop_target_role="desktop-host",
        is_desktop_host_role=_is_desktop,
    )

    assert result == ["bridge", "native"]


def test_filter_room_peers_matches_specific_connection():
    result = filter_room_peers(
        ["bridge-a", "bridge-b"],
        roles={"bridge-a": "vscode-bridge", "bridge-b": "vscode-bridge"},
        connection_ids={"bridge-a": "host-a", "bridge-b": "host-b"},
        exclude_ws=None,
        role_filter="vscode-bridge",
        target_connection_id="host-b",
        desktop_target_role="desktop-host",
        is_desktop_host_role=_is_desktop,
    )

    assert result == ["bridge-b"]
