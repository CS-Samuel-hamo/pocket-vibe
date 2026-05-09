import asyncio
import json
import logging
import os
import random
import string
import sys
import time
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response

from backend.connection_manager import ConnectionManager, ConnectionManagerDependencies
from backend.connection_preflight import build_connection_preflight
from backend.desktop_connection_profile import (
    build_desktop_connection_profile,
    write_desktop_connection_profile,
)
from backend.driver_output import broadcast_driver_packets
from backend.file_api import (
    list_files_payload,
    read_file_payload,
    resolve_project_root,
    safe_resolve,
    validate_read_path,
)
from backend.pairing_page import build_pairing_page_html as _build_pairing_page_html
from backend.pairing_context import (
    build_pairing_context_payload,
    env_flag as _env_flag,
    get_local_ip_payload,
    render_qr_svg as _render_qr_svg,
    resolve_mobile_base_url as _resolve_mobile_base_url,
)
from backend.protocol_router import (
    ProtocolRouter,
    ProtocolRouterDependencies,
)
from backend.project_state_payload import build_project_state_payload
from backend.room_snapshot_payload import build_room_snapshot_payload
from backend.snapshots import build_snapshot_packets
from backend.socket_messages import (
    decrypt_if_needed,
    routeable_socket_payload,
    safe_json_loads,
)
from backend.static_pwa import mount_mobile_pwa, should_serve_frontend_from_backend
from backend.websocket_lifecycle import (
    WebSocketLifecycleDependencies,
    run_websocket_lifecycle,
    websocket_session,
)


project_root = str(Path(__file__).parent.parent.absolute())
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from src.core.config import settings
from src.core.crypto import Crypto
from src.core.message_buffer import MessageBuffer, TokenBucket
from src.domain.models.protocol import (
    build_execution_event,
    build_host_descriptor,
    build_session_state,
    normalize_protocol_message,
)
from src.domain.services.project_state import ProjectStateService
from src.domain.services.vscode_driver import VSCodeDriver
from src.infra.db.sqlite import db


logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await _print_startup_qr()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
MOBILE_PWA_MOUNT = mount_mobile_pwa(
    app,
    enabled=should_serve_frontend_from_backend(),
)

crypto = Crypto()
message_buffer = MessageBuffer(settings.MESSAGE_BUFFER_SIZE)
rate_limiter = TokenBucket(settings.RATE_LIMIT_PER_SEC)
project_state = ProjectStateService()
driver = VSCodeDriver()

TOKEN_LIFETIME_SECONDS = 600
TOKEN_CREATED_AT = time.time()


def _generate_token(length: int = 12) -> str:
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))


raw_token = getattr(settings, "AUTH_TOKEN", None)
if not raw_token or raw_token == "change_this_to_a_secure_random_string":
    AUTH_TOKEN = _generate_token()
    AUTH_MODE = "ephemeral"
    TOKEN_EXPIRES_AT = TOKEN_CREATED_AT + TOKEN_LIFETIME_SECONDS
    logger.info("Generated dynamic AUTH_TOKEN for this session")
else:
    AUTH_TOKEN = raw_token
    AUTH_MODE = "configured"
    TOKEN_EXPIRES_AT = None
    logger.info("Using configured AUTH_TOKEN")

active_broadcast_tasks: Dict[str, asyncio.Task] = {}
state_sync_tasks: Dict[str, asyncio.Task] = {}
project_state_services: Dict[str, ProjectStateService] = {}
DESKTOP_HOST_ROLES = {"vscode-bridge", "desktop-host"}
DESKTOP_TARGET_ROLE = "desktop-host"
DEFAULT_HOST_LABEL = "Desktop Host"
DEFAULT_HOST_PLATFORM = "desktop"


def _host_descriptor_from_metadata(
    metadata: Optional[Dict[str, Any]],
    *,
    capabilities: Optional[List[str]] = None,
    health: Optional[str] = None,
) -> Dict[str, Any]:
    metadata_payload = dict(metadata or {})
    session_capabilities = capabilities or list(metadata_payload.get("session_capabilities") or [])
    return build_host_descriptor(
        metadata_payload,
        bridge_label=metadata_payload.get("host_label", DEFAULT_HOST_LABEL),
        capabilities=session_capabilities,
        health=health or metadata_payload.get("runtime_health") or metadata_payload.get("health"),
        last_error=metadata_payload.get("last_error"),
    )


def _json_dumps(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _get_project_state_service(target_dir: Optional[str] = None) -> ProjectStateService:
    resolved_target = str(Path(target_dir or settings.TARGET_DIR).resolve())
    service = project_state_services.get(resolved_target)
    if service:
        return service
    service = ProjectStateService(resolved_target)
    project_state_services[resolved_target] = service
    return service


def _project_state_payload(
    target_dir: Optional[str] = None,
    *,
    project_id: Optional[str] = None,
    project_name: Optional[str] = None,
    workspace_path: Optional[str] = None,
    host_label: Optional[str] = None,
    host_id: Optional[str] = None,
) -> Dict[str, Any]:
    service = _get_project_state_service(target_dir) if target_dir else project_state
    return build_project_state_payload(
        service.get_state(),
        project_id=project_id,
        project_name=project_name,
        workspace_path=workspace_path,
        host_label=host_label,
        host_id=host_id,
    )


def _is_desktop_host_role(role: Optional[str]) -> bool:
    return role in DESKTOP_HOST_ROLES


async def _authenticate(websocket: WebSocket, token: Optional[str]) -> bool:
    if AUTH_TOKEN and token != AUTH_TOKEN:
        logger.warning("Auth failed due to token mismatch")
        await websocket.accept()
        await websocket.send_text(
            _json_dumps(build_execution_event("error", "Authentication failed", reason="token_mismatch"))
        )
        await websocket.close(code=4003)
        return False

    if AUTH_MODE == "ephemeral" and TOKEN_EXPIRES_AT and time.time() > TOKEN_EXPIRES_AT:
        logger.warning("Auth failed because session token expired")
        await websocket.accept()
        await websocket.send_text(
            _json_dumps(
                build_execution_event(
                    "error",
                    "Token expired. Restart the desktop host.",
                    reason="token_expired",
                )
            )
        )
        await websocket.close(code=4003)
        return False

    return True


def _build_connection_preflight(token: Optional[str]) -> Dict[str, Any]:
    return build_connection_preflight(
        token,
        auth_token=AUTH_TOKEN,
        auth_mode=AUTH_MODE,
        expires_at=TOKEN_EXPIRES_AT,
        manager=manager,
    )


def _resolve_project_root(project_id: Optional[str] = None) -> Path:
    return resolve_project_root(
        project_id,
        target_dir=settings.TARGET_DIR,
        find_project=manager.find_project,
    )


def _safe_resolve(path: str, project_id: Optional[str] = None) -> Path:
    return safe_resolve(path, project_id, resolve_project_root=_resolve_project_root)


async def _build_pairing_context() -> Dict[str, Any]:
    local_ip_obj = await get_local_ip()
    local_ip = local_ip_obj.get("ip", "localhost")
    return build_pairing_context_payload(
        local_ip,
        auth_token=AUTH_TOKEN,
        auth_mode=AUTH_MODE,
        expires_at=TOKEN_EXPIRES_AT,
        port=settings.PORT,
    )


@app.get("/ping")
async def ping():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/api/sys/ip")
async def get_local_ip():
    return get_local_ip_payload(logger)


@app.get("/api/files/list")
async def list_files(path: str = ".", project_id: Optional[str] = None):
    return list_files_payload(
        path,
        project_id,
        resolve_path=_safe_resolve,
        resolve_project_root=_resolve_project_root,
    )


def _validate_read_path(path: str, project_id: Optional[str] = None) -> Optional[Path]:
    return validate_read_path(path, project_id, resolve_path=_safe_resolve)


@app.get("/api/files/read")
async def read_file(path: str, project_id: Optional[str] = None):
    return read_file_payload(
        path,
        project_id,
        validate_path=_validate_read_path,
        max_file_read_bytes=settings.MAX_FILE_READ_BYTES,
        logger=logger,
    )


@app.get("/api/phrases")
async def get_phrases():
    return db.get_phrases()


@app.post("/api/phrases")
async def add_phrase(data: Dict[str, str]):
    db.add_phrase(data["label"], data["content"], data.get("category", "general"))
    return {"status": "success"}


manager = ConnectionManager(
    ConnectionManagerDependencies(
        desktop_target_role=DESKTOP_TARGET_ROLE,
        default_host_label=DEFAULT_HOST_LABEL,
        default_host_platform=DEFAULT_HOST_PLATFORM,
        is_desktop_host_role=_is_desktop_host_role,
        host_descriptor_from_metadata=_host_descriptor_from_metadata,
        message_buffer=message_buffer,
        rate_limiter=rate_limiter,
        json_dumps=_json_dumps,
        e2ee_enabled=lambda: settings.E2EE_ENABLED,
        encrypt=Crypto.encrypt,
        logger=logger,
    )
)


def _selected_project_state(room_token: str) -> Dict[str, Any]:
    active_project = manager.get_active_host_project(room_token)
    if not active_project:
        return _project_state_payload()

    return _project_state_payload(
        active_project.get("workspace_path"),
        project_id=active_project.get("project_id"),
        project_name=active_project.get("project_name"),
        workspace_path=active_project.get("workspace_path"),
        host_label=active_project.get("host_label") or active_project.get("bridge_label"),
        host_id=active_project.get("host_id"),
    )


def _room_snapshot_payload(room_token: str) -> Dict[str, Any]:
    return build_room_snapshot_payload(
        active_project=manager.get_active_host_project(room_token),
        active_host=manager.get_active_host(room_token),
        project_registry=manager.list_room_projects(room_token),
        host_registry=manager.list_room_hosts(room_token),
        project_state=_selected_project_state(room_token),
        driver_active_runtime=driver.get_active_runtime(),
        driver_runtime_catalog=driver.get_runtime_catalog(),
        driver_session_capabilities=driver.get_session_capabilities(),
        default_host_label=DEFAULT_HOST_LABEL,
        host_descriptor_from_metadata=_host_descriptor_from_metadata,
    )


async def _broadcast_room_snapshot(room_token: str) -> None:
    snapshot = _room_snapshot_payload(room_token)
    session_packet, capabilities_packet = build_snapshot_packets(
        room_token,
        "room",
        snapshot,
        host_connected=manager.room_has_desktop_host(room_token),
        auth_mode=AUTH_MODE,
        expires_at=TOKEN_EXPIRES_AT,
    )
    await manager.send_to_room(
        room_token,
        session_packet,
        ignore_rate_limit=True,
        buffer_message=True,
    )
    await manager.send_to_room(
        room_token,
        capabilities_packet,
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _send_initial_snapshot(websocket: WebSocket, room_token: str, role: str) -> None:
    snapshot = _room_snapshot_payload(room_token)
    session_packet, capabilities_packet = build_snapshot_packets(
        room_token,
        role,
        snapshot,
        host_connected=manager.room_has_desktop_host(room_token),
        auth_mode=AUTH_MODE,
        expires_at=TOKEN_EXPIRES_AT,
    )
    await manager.send_packet(
        websocket,
        session_packet,
        buffer_message=False,
    )
    await manager.send_packet(
        websocket,
        capabilities_packet,
        buffer_message=False,
    )


async def _emit_room_event(
    room_token: str,
    packet: Dict[str, Any],
    *,
    exclude_ws: Optional[WebSocket] = None,
    ignore_rate_limit: bool = False,
    role_filter: Optional[str] = None,
    target_connection_id: Optional[str] = None,
    buffer_message: bool = True,
) -> None:
    await manager.send_to_room(
        room_token,
        packet,
        exclude_ws=exclude_ws,
        ignore_rate_limit=ignore_rate_limit,
        role_filter=role_filter,
        target_connection_id=target_connection_id,
        buffer_message=buffer_message,
    )


async def _ensure_driver_running(room_token: str) -> None:
    broadcast_task = active_broadcast_tasks.get(room_token)
    if broadcast_task and not broadcast_task.done():
        return

    active_broadcast_tasks[room_token] = asyncio.create_task(broadcast_driver_output(room_token))
    state_sync_tasks[room_token] = asyncio.create_task(_periodic_state_sync(room_token))

    for _ in range(10):
        if driver.running:
            return
        await asyncio.sleep(0.1)


async def _shutdown_room_tasks(room_token: str) -> None:
    task = active_broadcast_tasks.pop(room_token, None)
    if task:
        task.cancel()
    state_task = state_sync_tasks.pop(room_token, None)
    if state_task:
        state_task.cancel()
    if not manager.rooms:
        await driver.stop()


protocol_router = ProtocolRouter(
    ProtocolRouterDependencies(
        manager=manager,
        driver=driver,
        default_host_label=DEFAULT_HOST_LABEL,
        is_desktop_host_role=_is_desktop_host_role,
        emit_room_event=lambda *args, **kwargs: _emit_room_event(*args, **kwargs),
        ensure_driver_running=lambda room_token: _ensure_driver_running(room_token),
        broadcast_room_snapshot=lambda room_token: _broadcast_room_snapshot(room_token),
        send_initial_snapshot=lambda websocket, room_token, role: _send_initial_snapshot(websocket, room_token, role),
    )
)


def _resolve_target_project(room_token: str, data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    return protocol_router.resolve_target_project(room_token, data)


async def _sync_bridge_metadata(data: Dict[str, Any], room_token: str, websocket: WebSocket) -> None:
    await protocol_router.sync_bridge_metadata(data, room_token, websocket)


async def _route_prompt_submit(data: Dict[str, Any], room_token: str, websocket: WebSocket) -> None:
    await protocol_router.route_prompt_submit(data, room_token, websocket)


async def _route_workspace_focus(data: Dict[str, Any], room_token: str) -> None:
    await protocol_router.route_workspace_focus(data, room_token)


async def _route_context_request(data: Dict[str, Any], room_token: str) -> None:
    await protocol_router.route_context_request(data, room_token)


async def _route_command_dispatch(data: Dict[str, Any], room_token: str) -> None:
    await protocol_router.route_command_dispatch(data, room_token)


async def _route_approval_response(data: Dict[str, Any], room_token: str) -> None:
    await protocol_router.route_approval_response(data, room_token)


async def _route_kill_request(data: Dict[str, Any], room_token: str) -> None:
    await protocol_router.route_kill_request(data, room_token)


async def _route_project_select(data: Dict[str, Any], room_token: str) -> None:
    await protocol_router.route_project_select(data, room_token)


async def _handle_bridge_room_event(data: Dict[str, Any], room_token: str, websocket: WebSocket) -> None:
    await protocol_router.handle_bridge_room_event(data, room_token, websocket)


async def _handle_protocol_message(
    data: Dict[str, Any],
    websocket: WebSocket,
    room_token: str,
    role: str,
) -> None:
    await protocol_router.handle_protocol_message(data, websocket, room_token, role)


def _protocol_dispatchers(data: Dict[str, Any], websocket: WebSocket, room_token: str, role: str):
    return protocol_router.protocol_dispatchers(data, websocket, room_token, role)


async def _handle_handshake(data: Dict[str, Any], websocket: WebSocket) -> bool:
    if data.get("type") != "key_exchange":
        return False
    manager.secrets[websocket] = crypto.derive_shared_secret(data.get("public_key"))
    await manager.send_packet(
        websocket,
        {"type": "key_exchange", "public_key": crypto.public_key_b64},
        buffer_message=False,
    )
    return True


async def _handle_resume(data: Dict[str, Any], websocket: WebSocket) -> bool:
    if data.get("type") != "resume":
        return False
    await manager.replay_since(websocket, int(data.get("last_seq_id", 0)))
    return True


def _decrypt_socket_payload(data: Dict[str, Any], websocket: WebSocket) -> Optional[Dict[str, Any]]:
    return decrypt_if_needed(data, websocket, manager.secrets, Crypto.decrypt)


async def _handle_socket_message(
    websocket: WebSocket, message_text: str, room_token: str, role: str
) -> None:
    normalized = await routeable_socket_payload(
        message_text,
        websocket,
        handle_handshake=_handle_handshake,
        handle_resume=_handle_resume,
        decrypt_payload=_decrypt_socket_payload,
        normalize_message=normalize_protocol_message,
    )
    if not normalized:
        return
    await _handle_protocol_message(normalized, websocket, room_token, role)


async def _ws_loop(websocket: WebSocket, room_token: str, role: str) -> None:
    while True:
        message = await websocket.receive_text()
        await _handle_socket_message(websocket, message, room_token, role)


async def broadcast_driver_output(room_token: str) -> None:
    await broadcast_driver_packets(
        room_token,
        packet_source=driver,
        emit_room_event=_emit_room_event,
        parse_json=safe_json_loads,
        normalize_message=normalize_protocol_message,
        logger=logger,
    )


async def _periodic_state_sync(room_token: str) -> None:
    try:
        while room_token in manager.rooms:
            await asyncio.sleep(10)
            snapshot = _room_snapshot_payload(room_token)
            await _emit_room_event(
                room_token,
                build_session_state(
                    room_token,
                    "room",
                    bridge_connected=manager.room_has_desktop_host(room_token),
                    host_connected=manager.room_has_desktop_host(room_token),
                    auth_mode=AUTH_MODE,
                    expires_at=TOKEN_EXPIRES_AT,
                    project_state=snapshot["project_state"],
                    project_registry=snapshot["project_registry"],
                    active_project_id=snapshot["active_project_id"],
                    host_registry=snapshot["host_registry"],
                    active_host_id=snapshot["active_host_id"],
                    active_runtime=snapshot["active_runtime"],
                ),
                ignore_rate_limit=True,
                buffer_message=True,
            )
    except asyncio.CancelledError:
        pass


async def _print_startup_qr() -> None:
    if os.name == "nt":
        os.system("")

    pairing = await _build_pairing_context()
    profile = build_desktop_connection_profile(
        pairing,
        token=AUTH_TOKEN,
        auth_mode=AUTH_MODE,
        expires_at=TOKEN_EXPIRES_AT,
    )
    profile_path = write_desktop_connection_profile(Path(project_root), profile)
    target_url = pairing["target_url"]
    print("-" * 56)
    print("Pocket Vibe Session Ready")
    print(f"Token: {AUTH_TOKEN}")
    print(f"Desktop Profile: {profile_path}")
    print(f"Primary Link: {target_url}")
    print(f"Pairing Page: {pairing['pairing_page_url']}")
    print("Do not scan the terminal '#' preview. Open the Pairing Page in your desktop browser.")
    print("-" * 56)

    if _env_flag("AUTO_OPEN_PAIRING_PAGE", True):
        try:
            webbrowser.open(pairing["pairing_page_url"], new=1, autoraise=True)
            print("Opened the desktop Pairing Page in your default browser.")
        except Exception as exc:
            logger.warning("Failed to auto-open pairing page: %s", exc)




@app.get("/api/pairing")
async def get_pairing() -> Dict[str, Any]:
    return await _build_pairing_context()


@app.get("/api/connection/preflight")
async def connection_preflight(token: Optional[str] = None) -> JSONResponse:
    payload = _build_connection_preflight(token)
    return JSONResponse(payload, status_code=200 if payload["ok"] else 401)


@app.get("/api/pairing/qr.svg")
async def get_pairing_qr() -> Response:
    pairing = await _build_pairing_context()
    qr_svg = _render_qr_svg(pairing["target_url"])
    if not qr_svg:
        return Response("QR generation unavailable", media_type="text/plain", status_code=503)
    return Response(qr_svg, media_type="image/svg+xml")


@app.get("/")
async def get() -> HTMLResponse:
    pairing = await _build_pairing_context()
    qr_svg = _render_qr_svg(pairing["target_url"])
    return HTMLResponse(_build_pairing_page_html(pairing, qr_svg))


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = None,
    role: Optional[str] = "desktop",
) -> None:
    if not await _authenticate(websocket, token):
        return

    await run_websocket_lifecycle(
        websocket,
        websocket_session(token, role),
        WebSocketLifecycleDependencies(
            manager=manager,
            ensure_driver_running=_ensure_driver_running,
            send_initial_snapshot=_send_initial_snapshot,
            emit_room_event=_emit_room_event,
            shutdown_room_tasks=_shutdown_room_tasks,
            ws_loop=_ws_loop,
            logger=logger,
        ),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
