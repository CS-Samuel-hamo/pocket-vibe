"""Protocol message classification helpers."""

from typing import Callable, Optional

HOST_METADATA_TYPES = {"hello", "capabilities", "session.state"}
BRIDGE_ROOM_EVENT_TYPES = {
    "assistant",
    "command",
    "context.result",
    "execution.event",
    "approval.request",
    "approval.result",
    "audit.event",
    "kill.result",
    "diff",
    "file_content",
}


def is_host_metadata_message(
    role: Optional[str],
    msg_type: Optional[str],
    is_desktop_host_role: Callable[[Optional[str]], bool],
) -> bool:
    return is_desktop_host_role(role) and msg_type in HOST_METADATA_TYPES


def is_bridge_room_event(
    role: Optional[str],
    msg_type: Optional[str],
    is_desktop_host_role: Callable[[Optional[str]], bool],
) -> bool:
    return (is_desktop_host_role(role) or role == "desktop") and msg_type in BRIDGE_ROOM_EVENT_TYPES
