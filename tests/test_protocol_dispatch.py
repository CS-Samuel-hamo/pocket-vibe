"""Tests for protocol message classification."""

from backend.protocol_dispatch import is_bridge_room_event, is_host_metadata_message


def _is_host(role):
    return role in {"vscode-bridge", "desktop-host"}


def test_host_metadata_message_requires_desktop_host_role():
    assert is_host_metadata_message("vscode-bridge", "hello", _is_host) is True
    assert is_host_metadata_message("mobile", "hello", _is_host) is False
    assert is_host_metadata_message("vscode-bridge", "assistant", _is_host) is False


def test_bridge_room_event_accepts_desktop_host_and_legacy_desktop_role():
    assert is_bridge_room_event("vscode-bridge", "assistant", _is_host) is True
    assert is_bridge_room_event("desktop", "command", _is_host) is True
    assert is_bridge_room_event("mobile", "assistant", _is_host) is False
    assert is_bridge_room_event("vscode-bridge", "prompt.submit", _is_host) is False
