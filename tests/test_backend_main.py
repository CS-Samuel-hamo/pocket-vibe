import json
import time
from urllib.parse import parse_qs, urlparse

import pytest

from backend import main as backend_main
from src.core.crypto import Crypto


class _FakeStat:
    st_size = 128


class _FakePath:
    def __init__(self, error_message: str) -> None:
        self._error_message = error_message

    def stat(self):
        return _FakeStat()

    def read_text(self, encoding: str = "utf-8") -> str:
        raise OSError(self._error_message)

    def __str__(self) -> str:
        return "allowed.txt"


class _SizedPath:
    def __init__(self, size: int) -> None:
        self._size = size

    def stat(self):
        return type("_Stat", (), {"st_size": self._size})()

    def read_text(self, encoding: str = "utf-8") -> str:
        return "ok"


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent = []
        self.accepted = False
        self.closed_code = None

    async def accept(self) -> None:
        self.accepted = True

    async def send_text(self, text: str) -> None:
        self.sent.append(json.loads(text))

    async def close(self, code: int) -> None:
        self.closed_code = code


def _decrypt_sent_payloads(peer_secret, sent_packets):
    decoded = []
    for packet in sent_packets:
        if packet.get("type") == "encrypted":
            decoded.append(json.loads(Crypto.decrypt(packet, peer_secret)))
        else:
            decoded.append(packet)
    return decoded


def test_host_projects_keeps_bridge_projects_alias_for_compatibility():
    assert backend_main.manager.host_projects is backend_main.manager.bridge_projects


@pytest.fixture(autouse=True)
def reset_connection_state():
    backend_main.manager.rooms.clear()
    backend_main.manager.roles.clear()
    backend_main.manager.secrets.clear()
    backend_main.manager.ws_to_room.clear()
    backend_main.manager.connection_ids.clear()
    backend_main.manager.host_sessions.clear()
    backend_main.manager.bridge_projects.clear()
    backend_main.manager.room_project_selection.clear()
    backend_main.message_buffer.buffer.clear()
    backend_main.project_state_services.clear()
    yield
    backend_main.manager.rooms.clear()
    backend_main.manager.roles.clear()
    backend_main.manager.secrets.clear()
    backend_main.manager.ws_to_room.clear()
    backend_main.manager.connection_ids.clear()
    backend_main.manager.host_sessions.clear()
    backend_main.manager.bridge_projects.clear()
    backend_main.manager.room_project_selection.clear()
    backend_main.message_buffer.buffer.clear()
    backend_main.project_state_services.clear()


@pytest.mark.asyncio
async def test_read_file_hides_internal_os_error(monkeypatch):
    fake_path = _FakePath("permission denied: C:/secret/vault.txt")
    monkeypatch.setattr(backend_main, "_validate_read_path", lambda path, project_id=None: fake_path)

    result = await backend_main.read_file("allowed.txt")

    assert result == {"error": "Failed to read file"}
    assert "secret" not in result["error"].lower()
    assert "vault" not in result["error"].lower()


@pytest.mark.asyncio
async def test_read_file_uses_configured_size_limit(monkeypatch):
    fake_settings = type("_Settings", (), {"MAX_FILE_READ_BYTES": 8})()
    monkeypatch.setattr(backend_main, "settings", fake_settings)
    monkeypatch.setattr(backend_main, "_validate_read_path", lambda path, project_id=None: _SizedPath(9))

    result = await backend_main.read_file("allowed.txt")

    assert result == {"error": "File too large (Max 8 bytes)"}


@pytest.mark.asyncio
async def test_authenticate_rejects_expired_ephemeral_token(monkeypatch):
    websocket = _FakeWebSocket()
    monkeypatch.setattr(backend_main, "AUTH_MODE", "ephemeral")
    monkeypatch.setattr(backend_main, "TOKEN_EXPIRES_AT", time.time() - 1)

    authenticated = await backend_main._authenticate(websocket, backend_main.AUTH_TOKEN)

    assert authenticated is False
    assert websocket.accepted is True
    assert websocket.closed_code == 4003
    assert websocket.sent[-1]["type"] == "execution.event"


@pytest.mark.asyncio
async def test_send_to_room_replays_buffered_packets_with_seq_id():
    websocket = _FakeWebSocket()
    backend_main.manager.rooms["room"] = [websocket]
    backend_main.manager.roles[websocket] = "mobile"

    packet = await backend_main.manager.send_to_room(
        "room",
        {"type": "execution.event", "phase": "dispatch", "message": "prompt sent"},
        ignore_rate_limit=True,
        buffer_message=True,
    )

    assert packet is not None
    assert "seq_id" in packet
    assert websocket.sent[-1]["seq_id"] == packet["seq_id"]

    replay_socket = _FakeWebSocket()
    await backend_main.manager.replay_since(replay_socket, packet["seq_id"] - 1)
    assert replay_socket.sent[-1]["seq_id"] == packet["seq_id"]


@pytest.mark.asyncio
async def test_replay_skips_desktop_targeted_messages_for_mobile_role():
    await backend_main.message_buffer.push_and_get(
        {"type": "execution.event", "phase": "dispatch", "message": "visible-to-all"},
    )
    await backend_main.message_buffer.push_and_get(
        {
            "type": "execution.event",
            "phase": "dispatch",
            "message": "desktop-only",
            "delivery": "desktop",
            "target_role": "vscode-bridge",
        },
    )

    mobile_socket = _FakeWebSocket()
    await backend_main.manager.replay_since(mobile_socket, 0, role="mobile")

    assert [packet["message"] for packet in mobile_socket.sent] == ["visible-to-all"]


@pytest.mark.asyncio
async def test_prompt_submit_routes_to_driver_and_emits_user_event(monkeypatch):
    captured = {}
    emitted = []
    bridge = _FakeWebSocket()
    await backend_main.manager.connect(bridge, "room-1", "vscode-bridge")
    bridge_meta = backend_main.manager.update_bridge_project(
        bridge,
        project={
            "name": "Alpha",
            "root_path": "D:/AI_projects/Pocket_Vibe",
        },
        runtime_catalog=[{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        active_runtime="codex-cli",
    )

    async def fake_dispatch(payload):
        captured["payload"] = payload

    async def fake_emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    async def fake_ensure(room_token):
        captured["room_token"] = room_token

    monkeypatch.setattr(backend_main.driver, "dispatch_command", fake_dispatch)
    monkeypatch.setattr(backend_main, "_emit_room_event", fake_emit)
    monkeypatch.setattr(backend_main, "_ensure_driver_running", fake_ensure)

    await backend_main._route_prompt_submit(
        {"type": "prompt.submit", "prompt": "summarize the latest diff"},
        "room-1",
        _FakeWebSocket(),
    )

    assert captured["room_token"] == "room-1"
    assert captured["payload"]["type"] == "prompt.submit"
    assert captured["payload"]["prompt"] == "summarize the latest diff"
    assert captured["payload"]["project_id"] == bridge_meta["project_id"]
    assert captured["payload"]["target_connection_id"] == bridge_meta["connection_id"]
    assert any(packet["type"] == "user" for _, packet, _ in emitted)


@pytest.mark.asyncio
async def test_initial_snapshot_includes_project_registry_for_connected_bridge():
    bridge = _FakeWebSocket()
    mobile = _FakeWebSocket()
    await backend_main.manager.connect(bridge, "room-projects", "vscode-bridge")
    backend_main.manager.update_bridge_project(
        bridge,
        project={
            "name": "Pocket_Vibe",
            "root_path": "D:/AI_projects/Pocket_Vibe",
        },
        runtime_catalog=[{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        active_runtime="codex-cli",
    )

    await backend_main._send_initial_snapshot(mobile, "room-projects", "mobile")

    session_packet = mobile.sent[0]
    capabilities_packet = mobile.sent[1]

    assert session_packet["type"] == "session.state"
    assert session_packet["host_connected"] is True
    assert session_packet["host_registry"][0]["host_label"] == "VS Code Host"
    assert session_packet["host_registry"][0]["label"] == "VS Code Host"
    assert session_packet["host_registry"][0]["health"] == "ready"
    assert session_packet["active_host_id"] == session_packet["host_registry"][0]["host_id"]
    assert session_packet["project_registry"][0]["project_name"] == "Pocket_Vibe"
    assert session_packet["project_registry"][0]["host_id"] == session_packet["active_host_id"]
    assert session_packet["active_project_id"] == session_packet["project_registry"][0]["project_id"]
    assert capabilities_packet["type"] == "capabilities"
    assert capabilities_packet["host"]["label"] == "VS Code Host"
    assert capabilities_packet["host"]["health"] == "ready"
    assert capabilities_packet["active_host_id"] == session_packet["active_host_id"]
    assert capabilities_packet["active_project_id"] == session_packet["active_project_id"]


@pytest.mark.asyncio
async def test_initial_snapshot_supports_generic_desktop_host_role():
    desktop_host = _FakeWebSocket()
    mobile = _FakeWebSocket()
    await backend_main.manager.connect(desktop_host, "room-hosts", "desktop-host")
    backend_main.manager.update_host_session(
        desktop_host,
        bridge={
            "id": "codex-app-host-1",
            "label": "Codex App Host",
            "platform": "codex-app",
            "kind": "native-app",
            "version": "0.9.0",
        },
        project={
            "name": "NativeProject",
            "root_path": "D:/AI_projects/Pocket_Vibe",
        },
        session_capabilities=["prompt", "kill"],
        runtime_catalog=[{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        active_runtime="codex-cli",
    )

    await backend_main._send_initial_snapshot(mobile, "room-hosts", "mobile")

    session_packet = mobile.sent[0]
    capabilities_packet = mobile.sent[1]

    assert session_packet["host_connected"] is True
    assert session_packet["host_registry"][0]["id"] == "codex-app-host-1"
    assert session_packet["host_registry"][0]["platform"] == "codex-app"
    assert session_packet["host_registry"][0]["kind"] == "native-app"
    assert session_packet["host_registry"][0]["capabilities"] == ["prompt", "kill"]
    assert session_packet["host_registry"][0]["health"] == "ready"
    assert session_packet["host_registry"][0]["host_platform"] == "codex-app"
    assert session_packet["host_registry"][0]["host_kind"] == "native-app"
    assert session_packet["active_host_id"] == "codex-app-host-1"
    assert session_packet["project_registry"][0]["host_label"] == "Codex App Host"
    assert capabilities_packet["host"]["platform"] == "codex-app"
    assert capabilities_packet["host"]["kind"] == "native-app"
    assert capabilities_packet["host"]["capabilities"] == ["prompt", "kill"]
    assert capabilities_packet["host"]["health"] == "ready"


@pytest.mark.asyncio
async def test_read_only_native_host_probe_registers_project_and_degraded_host():
    probe_host = _FakeWebSocket()
    mobile = _FakeWebSocket()
    room_token = "room-probe"
    await backend_main.manager.connect(probe_host, room_token, "desktop-host")
    await backend_main.manager.connect(mobile, room_token, "mobile")

    await backend_main._sync_bridge_metadata(
        {
            "type": "capabilities",
            "host": {
                "id": "native-probe-1",
                "label": "Native App Probe",
                "platform": "native-app-probe",
                "kind": "native-app",
                "version": "probe-0.1",
                "capabilities": [],
                "health": "degraded",
                "last_error": "Read-only host probe; dispatch is unsupported.",
            },
            "project": {
                "project_id": "native-probe-1::project",
                "project_name": "SyntheticProject",
                "root_path": "D:/AI_projects/Pocket_Vibe",
            },
            "session_capabilities": [],
            "runtime_catalog": [],
            "active_runtime": None,
        },
        room_token,
        probe_host,
    )

    snapshot = backend_main._room_snapshot_payload(room_token)

    assert snapshot["host"]["id"] == "native-probe-1"
    assert snapshot["host"]["kind"] == "native-app"
    assert snapshot["host"]["health"] == "degraded"
    assert snapshot["host"]["capabilities"] == []
    assert snapshot["host"]["last_error"] == "Read-only host probe; dispatch is unsupported."
    assert snapshot["host_registry"][0]["platform"] == "native-app-probe"
    assert snapshot["project_registry"][0]["project_name"] == "SyntheticProject"
    assert snapshot["runtime_catalog"] == []
    assert snapshot["active_runtime"] is None


@pytest.mark.asyncio
async def test_send_to_room_desktop_host_role_filter_reaches_vscode_bridge():
    bridge = _FakeWebSocket()
    mobile = _FakeWebSocket()
    await backend_main.manager.connect(bridge, "room-filter", "vscode-bridge")
    await backend_main.manager.connect(mobile, "room-filter", "mobile")

    await backend_main.manager.send_to_room(
        "room-filter",
        {"type": "execution.event", "phase": "dispatch", "message": "desktop-target"},
        role_filter="desktop-host",
        ignore_rate_limit=True,
        buffer_message=False,
    )

    assert bridge.sent[-1]["message"] == "desktop-target"
    assert mobile.sent == []


@pytest.mark.asyncio
async def test_project_select_changes_target_bridge_for_prompt(monkeypatch):
    room_token = "room-switch"
    bridge_one = _FakeWebSocket()
    bridge_two = _FakeWebSocket()
    mobile = _FakeWebSocket()
    await backend_main.manager.connect(bridge_one, room_token, "vscode-bridge")
    await backend_main.manager.connect(bridge_two, room_token, "vscode-bridge")
    alpha = backend_main.manager.update_bridge_project(
        bridge_one,
        project={"name": "Alpha", "root_path": "D:/AI_projects/Pocket_Vibe"},
        runtime_catalog=[{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        active_runtime="codex-cli",
    )
    beta = backend_main.manager.update_bridge_project(
        bridge_two,
        project={"name": "Beta", "root_path": "D:/AI_projects/Pocket_Vibe/frontend"},
        runtime_catalog=[{"id": "antigravity", "label": "Antigravity", "health": "ready"}],
        active_runtime="antigravity",
    )

    captured = {}

    async def fake_dispatch(payload):
        captured["payload"] = payload

    async def fake_emit(*args, **kwargs):
        return None

    async def fake_ensure(room_token_arg):
        captured["room_token"] = room_token_arg

    monkeypatch.setattr(backend_main.driver, "dispatch_command", fake_dispatch)
    monkeypatch.setattr(backend_main, "_emit_room_event", fake_emit)
    monkeypatch.setattr(backend_main, "_ensure_driver_running", fake_ensure)

    assert backend_main.manager.select_project(room_token, beta["project_id"]) is True

    await backend_main._route_prompt_submit(
        {"type": "prompt.submit", "prompt": "switch to beta"},
        room_token,
        mobile,
    )

    assert captured["room_token"] == room_token
    assert captured["payload"]["project_id"] == beta["project_id"]
    assert captured["payload"]["target_connection_id"] == beta["connection_id"]
    assert captured["payload"]["target_connection_id"] != alpha["connection_id"]


@pytest.mark.asyncio
async def test_bridge_assistant_message_is_forwarded_to_room(monkeypatch):
    emitted = []

    async def fake_emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    monkeypatch.setattr(backend_main, "_emit_room_event", fake_emit)

    await backend_main._handle_protocol_message(
        {"type": "assistant", "content": "POCKET_VIBE_Codex_OK", "target_runtime": "codex-cli"},
        _FakeWebSocket(),
        "room-1",
        "vscode-bridge",
    )

    assert len(emitted) == 1
    assert emitted[0][0] == "room-1"
    assert emitted[0][1]["type"] == "assistant"
    assert emitted[0][1]["content"] == "POCKET_VIBE_Codex_OK"


@pytest.mark.asyncio
async def test_bridge_command_message_is_forwarded_to_room(monkeypatch):
    emitted = []

    async def fake_emit(room_token, packet, **kwargs):
        emitted.append((room_token, packet, kwargs))

    monkeypatch.setattr(backend_main, "_emit_room_event", fake_emit)

    await backend_main._handle_protocol_message(
        {"type": "command", "content": "vite build finished", "target_runtime": "codex-cli"},
        _FakeWebSocket(),
        "room-1",
        "vscode-bridge",
    )

    assert len(emitted) == 1
    assert emitted[0][0] == "room-1"
    assert emitted[0][1]["type"] == "command"
    assert emitted[0][1]["content"] == "vite build finished"


@pytest.mark.asyncio
async def test_kill_request_returns_error_when_no_bridge(monkeypatch):
    emitted = []

    async def fake_emit(room_token, packet, **kwargs):
        emitted.append(packet)

    monkeypatch.setattr(backend_main.manager, "room_has_desktop_host", lambda room_token: False)
    monkeypatch.setattr(backend_main, "_emit_room_event", fake_emit)

    await backend_main._route_kill_request({"type": "kill.request"}, "room-1")

    assert emitted[-1]["type"] == "kill.result"
    assert emitted[-1]["ok"] is False


@pytest.mark.asyncio
async def test_encrypted_resume_replays_only_visible_packets():
    room_token = "room-secure"
    websocket = _FakeWebSocket()
    backend_main.manager.rooms[room_token] = [websocket]
    backend_main.manager.roles[websocket] = "mobile"
    backend_main.manager.ws_to_room[websocket] = room_token

    peer = Crypto()
    await backend_main._handle_socket_message(
        websocket,
        json.dumps({"type": "key_exchange", "public_key": peer.public_key_b64}),
        room_token,
        "mobile",
    )
    peer_secret = peer.derive_shared_secret(websocket.sent[-1]["public_key"])
    websocket.sent.clear()

    await backend_main.message_buffer.push_and_get(
        {"type": "execution.event", "phase": "dispatch", "message": "visible-packet"},
    )
    await backend_main.message_buffer.push_and_get(
        {
            "type": "execution.event",
            "phase": "dispatch",
            "message": "desktop-only",
            "delivery": "desktop",
            "target_role": "vscode-bridge",
        },
    )

    encrypted_resume = Crypto.encrypt(json.dumps({"type": "resume", "last_seq_id": 0}), peer_secret)
    await backend_main._handle_socket_message(
        websocket,
        json.dumps({"type": "encrypted", **encrypted_resume}),
        room_token,
        "mobile",
    )

    replayed = _decrypt_sent_payloads(peer_secret, websocket.sent)
    assert [packet["message"] for packet in replayed] == ["visible-packet"]


@pytest.mark.asyncio
async def test_encrypted_approval_response_routes_to_driver(monkeypatch):
    room_token = "room-approval"
    websocket = _FakeWebSocket()
    backend_main.manager.rooms[room_token] = [websocket]
    backend_main.manager.roles[websocket] = "mobile"
    backend_main.manager.ws_to_room[websocket] = room_token

    peer = Crypto()
    await backend_main._handle_socket_message(
        websocket,
        json.dumps({"type": "key_exchange", "public_key": peer.public_key_b64}),
        room_token,
        "mobile",
    )
    peer_secret = peer.derive_shared_secret(websocket.sent[-1]["public_key"])
    websocket.sent.clear()

    captured = {}

    async def fake_dispatch_command(payload):
        captured["payload"] = payload

    monkeypatch.setattr(backend_main.driver, "dispatch_command", fake_dispatch_command)
    monkeypatch.setattr(backend_main.manager, "room_has_desktop_host", lambda room: True)

    encrypted_payload = Crypto.encrypt(
        json.dumps({"type": "approval.response", "approval_id": "a-1", "decision": "approved"}),
        peer_secret,
    )
    await backend_main._handle_socket_message(
        websocket,
        json.dumps({"type": "encrypted", **encrypted_payload}),
        room_token,
        "mobile",
    )

    assert captured["payload"]["type"] == "approval.response"
    assert captured["payload"]["approval_id"] == "a-1"
    assert captured["payload"]["decision"] == "approved"


@pytest.mark.asyncio
async def test_encrypted_kill_request_routes_to_driver(monkeypatch):
    room_token = "room-kill"
    websocket = _FakeWebSocket()
    backend_main.manager.rooms[room_token] = [websocket]
    backend_main.manager.roles[websocket] = "mobile"
    backend_main.manager.ws_to_room[websocket] = room_token

    peer = Crypto()
    await backend_main._handle_socket_message(
        websocket,
        json.dumps({"type": "key_exchange", "public_key": peer.public_key_b64}),
        room_token,
        "mobile",
    )
    peer_secret = peer.derive_shared_secret(websocket.sent[-1]["public_key"])
    websocket.sent.clear()

    captured = {}

    async def fake_dispatch_command(payload):
        captured["payload"] = payload

    async def fake_ensure_driver_running(room_token_arg):
        captured["room_token"] = room_token_arg

    monkeypatch.setattr(backend_main.driver, "dispatch_command", fake_dispatch_command)
    monkeypatch.setattr(backend_main, "_ensure_driver_running", fake_ensure_driver_running)
    monkeypatch.setattr(backend_main.manager, "room_has_desktop_host", lambda room: True)

    encrypted_payload = Crypto.encrypt(
        json.dumps({"type": "kill.request", "target_runtime": "codex-cli", "reason": "manual-test"}),
        peer_secret,
    )
    await backend_main._handle_socket_message(
        websocket,
        json.dumps({"type": "encrypted", **encrypted_payload}),
        room_token,
        "mobile",
    )

    assert captured["room_token"] == room_token
    assert captured["payload"]["type"] == "kill.request"
    assert captured["payload"]["target_runtime"] == "codex-cli"


def test_resolve_mobile_base_url_rewrites_loopback(monkeypatch):
    monkeypatch.setenv("VITE_FRONTEND_URL", "http://127.0.0.1:5173")

    resolved = backend_main._resolve_mobile_base_url("192.168.1.55")

    assert resolved == "http://192.168.1.55:5173/"


def test_env_flag_defaults_true_and_can_be_disabled(monkeypatch):
    monkeypatch.delenv("AUTO_OPEN_PAIRING_PAGE", raising=False)
    assert backend_main._env_flag("AUTO_OPEN_PAIRING_PAGE", True) is True

    monkeypatch.setenv("AUTO_OPEN_PAIRING_PAGE", "false")
    assert backend_main._env_flag("AUTO_OPEN_PAIRING_PAGE", True) is False


def test_connection_preflight_rejects_token_mismatch(monkeypatch):
    monkeypatch.setattr(backend_main, "AUTH_TOKEN", "expected-token")
    monkeypatch.setattr(backend_main, "AUTH_MODE", "configured")
    monkeypatch.setattr(backend_main, "TOKEN_EXPIRES_AT", None)

    result = backend_main._build_connection_preflight("wrong-token")

    assert result["ok"] is False
    assert result["reason"] == "token_mismatch"
    assert result["host_connected"] is False


@pytest.mark.asyncio
async def test_connection_preflight_reports_valid_room_state(monkeypatch):
    monkeypatch.setattr(backend_main, "AUTH_TOKEN", "room-token")
    monkeypatch.setattr(backend_main, "AUTH_MODE", "configured")
    monkeypatch.setattr(backend_main, "TOKEN_EXPIRES_AT", None)
    bridge = _FakeWebSocket()
    await backend_main.manager.connect(bridge, "room-token", "vscode-bridge")
    backend_main.manager.update_bridge_project(
        bridge,
        project={
            "name": "Pocket_Vibe",
            "root_path": "D:/AI_projects/Pocket_Vibe",
        },
        runtime_catalog=[{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        active_runtime="codex-cli",
    )

    result = backend_main._build_connection_preflight("room-token")

    assert result["ok"] is True
    assert result["reason"] == "ok"
    assert result["host_connected"] is True
    assert result["project_count"] == 1
    assert result["active_project_name"] == "Pocket_Vibe"
    assert result["active_runtime"] == "codex-cli"


@pytest.mark.asyncio
async def test_build_pairing_context_includes_tokenized_mobile_link(monkeypatch):
    async def fake_get_local_ip():
        return {"ip": "192.168.1.55"}

    monkeypatch.setattr(backend_main, "get_local_ip", fake_get_local_ip)
    monkeypatch.setenv("VITE_FRONTEND_URL", "http://127.0.0.1:5173")
    monkeypatch.delenv("PUBLIC_FRONTEND_URL", raising=False)
    monkeypatch.delenv("PUBLIC_API_BASE_URL", raising=False)
    monkeypatch.delenv("PUBLIC_BACKEND_WS_URL", raising=False)

    pairing = await backend_main._build_pairing_context()
    parsed = urlparse(pairing["target_url"])
    query = parse_qs(parsed.query)

    assert parsed.netloc == "192.168.1.55:5173"
    assert query["token"] == [backend_main.AUTH_TOKEN]
    assert query["mode"] == ["remote"]
    assert query["api_base_url"] == [f"http://192.168.1.55:{backend_main.settings.PORT}"]
    assert query["backend_ws_url"] == [f"ws://192.168.1.55:{backend_main.settings.PORT}/ws"]
    assert pairing["pairing_page_url"] == f"http://192.168.1.55:{backend_main.settings.PORT}/"


@pytest.mark.asyncio
async def test_build_pairing_context_prefers_public_urls_for_remote_mode(monkeypatch):
    async def fake_get_local_ip():
        return {"ip": "192.168.1.55"}

    monkeypatch.setattr(backend_main, "get_local_ip", fake_get_local_ip)
    monkeypatch.setenv("PUBLIC_FRONTEND_URL", "https://phone.example.com")
    monkeypatch.setenv("PUBLIC_API_BASE_URL", "https://relay.example.com")
    monkeypatch.setenv("PUBLIC_BACKEND_WS_URL", "wss://relay.example.com/ws")

    pairing = await backend_main._build_pairing_context()
    parsed = urlparse(pairing["target_url"])
    query = parse_qs(parsed.query)

    assert parsed.scheme == "https"
    assert parsed.netloc == "phone.example.com"
    assert query["api_base_url"] == ["https://relay.example.com"]
    assert query["backend_ws_url"] == ["wss://relay.example.com/ws"]
    assert pairing["connection_mode"] == "public"
