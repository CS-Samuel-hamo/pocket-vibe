import asyncio
import io
import json
import logging
import os
import random
import re
import socket
import string
import sys
import time
import webbrowser
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psutil
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response

from backend.connection_manager import ConnectionManager, ConnectionManagerDependencies
from backend.connection_preflight import build_connection_preflight
from backend.driver_output import broadcast_driver_packets
from backend.pairing_page import build_pairing_page_html as _build_pairing_page_html
from backend.protocol_dispatch import is_bridge_room_event, is_host_metadata_message
from backend.project_state_payload import build_project_state_payload
from backend.protocol_routes import (
    approval_id,
    build_bridge_offline_event,
    build_approval_offline_result,
    build_approval_response_payload,
    build_command_dispatch_event,
    build_command_dispatch_payload,
    build_context_request_payload,
    build_kill_audit_event,
    build_kill_offline_result,
    build_kill_request_payload,
    build_prompt_submit_payload,
    build_project_changed_event,
    build_project_unavailable_event,
    build_workspace_focus_event,
    build_workspace_focus_payload,
    normalize_decision,
    project_id_from_data,
)
from backend.route_flows import emit_approval_completion_events, emit_prompt_submit_events
from backend.room_snapshot_payload import build_room_snapshot_payload
from backend.snapshots import build_snapshot_packets
from backend.socket_messages import (
    decrypt_if_needed,
    routeable_socket_payload,
    safe_json_loads,
)
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
    if not project_id:
        return Path(settings.TARGET_DIR).resolve()
    project_entry = manager.find_project(project_id)
    workspace_path = project_entry.get("workspace_path") if project_entry else None
    return Path(workspace_path or settings.TARGET_DIR).resolve()


def _safe_resolve(path: str, project_id: Optional[str] = None) -> Path:
    target = _resolve_project_root(project_id)
    requested = (target / path).resolve()
    try:
        requested.relative_to(target)
    except ValueError as exc:
        raise ValueError("Path traversal detected") from exc
    return requested


def _is_valid_adapter_ip(addr: Any) -> bool:
    if addr.family != socket.AF_INET:
        return False
    if addr.address.startswith("127.") or addr.address.startswith("198.18."):
        return False
    return True


def _scan_adapters() -> List[str]:
    candidates: List[str] = []
    for _, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if _is_valid_adapter_ip(addr):
                candidates.append(addr.address)
    return candidates


def _pick_best_ip(candidates: List[str]) -> Optional[str]:
    lan_ips = [ip for ip in candidates if ip.startswith("192.168.")]
    if lan_ips:
        return lan_ips[0]

    priv_ips = [
        ip
        for ip in candidates
        if ip.startswith("10.") or re.match(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.", ip)
    ]
    if priv_ips:
        return priv_ips[0]
    return candidates[0] if candidates else None


def _get_fallback_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(1)
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    finally:
        sock.close()


def _replace_loopback_host(url: str, local_ip: str) -> str:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if hostname not in {"127.0.0.1", "localhost", "0.0.0.0"}:
        return url

    port = parsed.port
    netloc = local_ip if not port else f"{local_ip}:{port}"
    return urlunparse(parsed._replace(netloc=netloc))


def _append_query_param(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k != key]
    query.append((key, value))
    return urlunparse(parsed._replace(query=urlencode(query)))


def _normalize_base_url(url: str, default_path: str = "") -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme:
        return ""
    normalized_path = parsed.path or default_path
    normalized = parsed._replace(path=normalized_path)
    return urlunparse(normalized)


def _resolve_mobile_base_url(local_ip: str) -> str:
    configured = os.getenv("PUBLIC_FRONTEND_URL", "").strip() or os.getenv("VITE_FRONTEND_URL", "").strip()
    if not configured:
        return f"http://{local_ip}:5173/"
    normalized = _replace_loopback_host(configured, local_ip)
    parsed = urlparse(normalized)
    if not parsed.scheme:
        return f"http://{local_ip}:5173/"
    if not parsed.path:
        return urlunparse(parsed._replace(path="/"))
    return normalized


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _resolve_api_base_url(local_ip: str) -> str:
    configured = os.getenv("PUBLIC_API_BASE_URL", "").strip()
    if configured:
        normalized = _normalize_base_url(configured)
        if normalized:
            return normalized.rstrip("/")
    return f"http://{local_ip}:{settings.PORT}"


def _resolve_backend_ws_url(local_ip: str) -> str:
    configured = os.getenv("PUBLIC_BACKEND_WS_URL", "").strip()
    if configured:
        normalized = _normalize_base_url(configured, "/ws")
        if normalized:
            return normalized
    return f"ws://{local_ip}:{settings.PORT}/ws"


def _build_mobile_target_url(
    mobile_base_url: str,
    *,
    token: str,
    api_base_url: str,
    backend_ws_url: str,
) -> str:
    target_url = mobile_base_url
    for key, value in (
        ("token", token),
        ("mode", "remote"),
        ("api_base_url", api_base_url),
        ("backend_ws_url", backend_ws_url),
    ):
        target_url = _append_query_param(target_url, key, value)
    return target_url


async def _build_pairing_context() -> Dict[str, Any]:
    local_ip_obj = await get_local_ip()
    local_ip = local_ip_obj.get("ip", "localhost")
    mobile_base_url = _resolve_mobile_base_url(local_ip)
    api_base_url = _resolve_api_base_url(local_ip)
    backend_ws_url = _resolve_backend_ws_url(local_ip)
    target_url = _build_mobile_target_url(
        mobile_base_url,
        token=AUTH_TOKEN,
        api_base_url=api_base_url,
        backend_ws_url=backend_ws_url,
    )
    backend_base_url = f"http://{local_ip}:{settings.PORT}"
    remote_mode = any(
        os.getenv(name, "").strip()
        for name in ("PUBLIC_FRONTEND_URL", "PUBLIC_API_BASE_URL", "PUBLIC_BACKEND_WS_URL")
    )
    return {
        "token": AUTH_TOKEN,
        "auth_mode": AUTH_MODE,
        "expires_at": TOKEN_EXPIRES_AT,
        "local_ip": local_ip,
        "mobile_base_url": mobile_base_url,
        "api_base_url": api_base_url,
        "backend_ws_url": backend_ws_url,
        "connection_mode": "public" if remote_mode else "lan",
        "target_url": target_url,
        "pairing_page_url": f"{backend_base_url}/",
        "qr_svg_url": f"{backend_base_url}/api/pairing/qr.svg",
    }


def _render_qr_svg(data: str) -> Optional[str]:
    try:
        import qrcode
        from qrcode.image.svg import SvgImage
    except ImportError:
        return None

    stream = io.BytesIO()
    image = qrcode.make(data, image_factory=SvgImage)
    image.save(stream)
    return stream.getvalue().decode("utf-8")


@app.get("/ping")
async def ping():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/api/sys/ip")
async def get_local_ip():
    try:
        candidates = _scan_adapters()
        best_ip = _pick_best_ip(candidates)
        if best_ip:
            return {"ip": best_ip}
        return {"ip": _get_fallback_ip()}
    except Exception as exc:
        logger.warning("IP detection error: %s", exc)
        return {"ip": "127.0.0.1"}


def _build_file_list(root: Path, base_target: Path) -> List[Dict[str, Any]]:
    files: List[Dict[str, Any]] = []
    for entry in root.iterdir():
        try:
            files.append(
                {
                    "name": entry.name,
                    "is_dir": entry.is_dir(),
                    "path": str(entry.relative_to(base_target)).replace("\\", "/"),
                }
            )
        except ValueError:
            continue
    return files


@app.get("/api/files/list")
async def list_files(path: str = ".", project_id: Optional[str] = None):
    try:
        root = _safe_resolve(path, project_id)
        base_target = _resolve_project_root(project_id)
    except ValueError:
        return {"error": "Invalid path"}

    if not root.exists() or not root.is_dir():
        return {"error": "Path not found or not a dir"}

    try:
        raw = _build_file_list(root, base_target)
        return sorted(raw, key=lambda item: (not item["is_dir"], item["name"]))
    except PermissionError:
        return {"error": "Permission denied"}


def _validate_read_path(path: str, project_id: Optional[str] = None) -> Optional[Path]:
    try:
        full_path = _safe_resolve(path, project_id)
        if not full_path.exists() or full_path.is_dir():
            return None
        return full_path
    except ValueError:
        return None


@app.get("/api/files/read")
async def read_file(path: str, project_id: Optional[str] = None):
    full_path = _validate_read_path(path, project_id)
    if not full_path:
        return {"error": "Invalid file access"}

    try:
        if full_path.stat().st_size > settings.MAX_FILE_READ_BYTES:
            return {"error": f"File too large (Max {settings.MAX_FILE_READ_BYTES} bytes)"}
        return {"content": full_path.read_text(encoding="utf-8")}
    except UnicodeDecodeError:
        return {"error": "Invalid text encoding"}
    except OSError as exc:
        logger.warning("File read failed for %s: %s", full_path, exc)
        return {"error": "Failed to read file"}
    except Exception:
        logger.exception("Unexpected file read failure for %s", full_path)
        return {"error": "Failed to read file"}


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


def _resolve_target_project(room_token: str, data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    requested_project_id = str((data or {}).get("project_id") or "").strip() or None
    return manager.get_active_host_project(room_token, preferred_project_id=requested_project_id)


async def _sync_bridge_metadata(data: Dict[str, Any], room_token: str, websocket: WebSocket) -> None:
    runtime_catalog = data.get("runtime_catalog")
    active_runtime = data.get("active_runtime")
    bridge_payload = (
        data.get("host")
        if isinstance(data.get("host"), dict)
        else data.get("bridge")
        if isinstance(data.get("bridge"), dict)
        else {}
    )
    bridge_label = bridge_payload.get("label") or data.get("bridge_label") or DEFAULT_HOST_LABEL
    manager.update_host_session(
        websocket,
        bridge={
            **bridge_payload,
            "label": bridge_label,
            "version": bridge_payload.get("version") or data.get("bridge_version"),
            "session_capabilities": data.get("session_capabilities"),
        },
        project=data.get("project"),
        session_capabilities=data.get("session_capabilities"),
        runtime_catalog=runtime_catalog,
        active_runtime=active_runtime,
        bridge_label=bridge_label,
    )
    await driver.update_runtime_catalog(runtime_catalog, active_runtime=active_runtime)
    await _broadcast_room_snapshot(room_token)


async def _route_prompt_submit(
    data: Dict[str, Any], room_token: str, websocket: WebSocket
) -> None:
    prompt = str(data.get("prompt") or "").strip()
    if not prompt:
        return
    target_project = _resolve_target_project(room_token, data)
    target_runtime = data.get("target_runtime")

    await emit_prompt_submit_events(
        room_token=room_token,
        prompt=prompt,
        target_project=target_project,
        target_runtime=target_runtime,
        exclude_ws=websocket,
        emit_room_event=_emit_room_event,
    )

    if not manager.room_has_desktop_host(room_token):
        await _emit_room_event(
            room_token,
            build_bridge_offline_event(),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return

    await _ensure_driver_running(room_token)
    await driver.dispatch_command(build_prompt_submit_payload(prompt, target_project=target_project, target_runtime=target_runtime))


async def _route_workspace_focus(
    data: Dict[str, Any], room_token: str
) -> None:
    target_project = _resolve_target_project(room_token, data)
    if not manager.room_has_desktop_host(room_token):
        await _emit_room_event(
            room_token,
            build_bridge_offline_event(),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return
    await _ensure_driver_running(room_token)
    await driver.dispatch_command(build_workspace_focus_payload(data, target_project=target_project))
    await _emit_room_event(
        room_token,
        build_workspace_focus_event(
            data,
            target_project=target_project,
            target_runtime=target_project.get("active_runtime") if target_project else driver.get_active_runtime(),
        ),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _route_context_request(
    data: Dict[str, Any], room_token: str
) -> None:
    target_project = _resolve_target_project(room_token, data)
    if not manager.room_has_desktop_host(room_token):
        await _emit_room_event(
            room_token,
            build_bridge_offline_event(),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return
    await _ensure_driver_running(room_token)
    await driver.dispatch_command(build_context_request_payload(data, target_project=target_project))


async def _route_command_dispatch(
    data: Dict[str, Any], room_token: str
) -> None:
    target_project = _resolve_target_project(room_token, data)
    if not manager.room_has_desktop_host(room_token):
        await _emit_room_event(
            room_token,
            build_bridge_offline_event(),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return

    await _ensure_driver_running(room_token)
    await driver.dispatch_command(build_command_dispatch_payload(data, target_project=target_project))
    await _emit_room_event(
        room_token,
        build_command_dispatch_event(data, target_project=target_project),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _route_approval_response(
    data: Dict[str, Any], room_token: str
) -> None:
    target_project = _resolve_target_project(room_token, data)
    if not manager.room_has_desktop_host(room_token):
        await _emit_room_event(
            room_token,
            build_approval_offline_result(data, target_project=target_project),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return
    approval_id_value = approval_id(data)
    decision = normalize_decision(data.get("decision"))
    await driver.dispatch_command(
        build_approval_response_payload(
            approval_id_value,
            decision,
            data,
            target_project=target_project,
        )
    )
    await emit_approval_completion_events(
        room_token=room_token,
        approval_id_value=approval_id_value,
        decision=decision,
        target_project=target_project,
        emit_room_event=_emit_room_event,
    )


async def _route_kill_request(data: Dict[str, Any], room_token: str) -> None:
    target_project = _resolve_target_project(room_token, data)
    if not manager.room_has_desktop_host(room_token):
        await _emit_room_event(
            room_token,
            build_kill_offline_result(data, target_project=target_project),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return

    await _ensure_driver_running(room_token)
    await driver.dispatch_command(build_kill_request_payload(data, target_project=target_project))
    await _emit_room_event(
        room_token,
        build_kill_audit_event(data, target_project=target_project),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _route_project_select(data: Dict[str, Any], room_token: str) -> None:
    project_id = project_id_from_data(data)
    if not project_id:
        return
    if not manager.select_project(room_token, project_id):
        await _emit_room_event(
            room_token,
            build_project_unavailable_event(project_id),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return
    await _broadcast_room_snapshot(room_token)
    selected_project = manager.get_active_host_project(room_token, preferred_project_id=project_id)
    await _emit_room_event(
        room_token,
        build_project_changed_event(project_id, selected_project),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _handle_bridge_room_event(
    data: Dict[str, Any], room_token: str, websocket: WebSocket
) -> None:
    host_project = manager.host_projects.get(websocket)
    packet = dict(data)
    if host_project:
        packet.setdefault("project_id", host_project.get("project_id"))
        packet.setdefault("project_name", host_project.get("project_name"))
        packet.setdefault("host_id", host_project.get("host_id"))
        packet.setdefault("host_label", host_project.get("host_label"))
        packet.setdefault("host_platform", host_project.get("host_platform"))
        packet.setdefault("bridge_label", host_project.get("bridge_label"))
    await _emit_room_event(
        room_token,
        packet,
        exclude_ws=websocket,
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _skip_initial_snapshot(*_args: Any) -> None: return None
async def _handle_protocol_message(
    data: Dict[str, Any],
    websocket: WebSocket,
    room_token: str,
    role: str,
) -> None:
    msg_type = data.get("type")

    if is_host_metadata_message(role, msg_type, _is_desktop_host_role):
        await _sync_bridge_metadata(data, room_token, websocket)
        await {"hello": _send_initial_snapshot}.get(msg_type, _skip_initial_snapshot)(websocket, room_token, role)
        return

    if is_bridge_room_event(role, msg_type, _is_desktop_host_role):
        await _handle_bridge_room_event(data, room_token, websocket)
        return

    handler = _protocol_dispatchers(data, websocket, room_token, role).get(msg_type)
    if handler:
        await handler()


def _protocol_dispatchers(data: Dict[str, Any], websocket: WebSocket, room_token: str, role: str):
    return {
        "hello": lambda: _send_initial_snapshot(websocket, room_token, role),
        "prompt.submit": lambda: _route_prompt_submit(data, room_token, websocket),
        "command.dispatch": lambda: _route_command_dispatch(data, room_token),
        "workspace.focus": lambda: _route_workspace_focus(data, room_token),
        "context.request": lambda: _route_context_request(data, room_token),
        "approval.response": lambda: _route_approval_response(data, room_token),
        "project.select": lambda: _route_project_select(data, room_token),
        "kill.request": lambda: _route_kill_request(data, room_token),
        "ping": lambda: manager.send_packet(websocket, {"type": "pong"}, buffer_message=False),
    }


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
    target_url = pairing["target_url"]
    print("-" * 56)
    print("Pocket Vibe Session Ready")
    print(f"Token: {AUTH_TOKEN}")
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
