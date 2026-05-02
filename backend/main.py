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
from uuid import uuid4

import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response

from backend.connection_preflight import build_connection_preflight
from backend.connection_state import update_host_session_state
from backend.pairing_page import build_pairing_page_html as _build_pairing_page_html
from backend.project_registry import (
    active_project_candidate,
    host_registry_entry,
    project_registry_entry,
    should_update_project_selection,
    sort_host_registry,
    sort_project_registry,
)
from backend.protocol_routes import (
    build_bridge_offline_event,
    build_command_dispatch_event,
    build_command_dispatch_payload,
    build_context_request_payload,
    build_prompt_dispatch_event,
    build_prompt_submit_payload,
    build_user_prompt_event,
    build_workspace_focus_event,
    build_workspace_focus_payload,
)


project_root = str(Path(__file__).parent.parent.absolute())
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from src.core.config import settings
from src.core.crypto import Crypto
from src.core.message_buffer import MessageBuffer, TokenBucket
from src.domain.models.protocol import (
    approval_result_from_response,
    build_audit_event,
    build_capabilities,
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
    payload = dict(service.get_state())
    payload.pop("type", None)
    if project_id:
        payload["project_id"] = project_id
    if project_name:
        payload["project_name"] = project_name
    if workspace_path:
        payload["workspace_path"] = workspace_path
    if host_label:
        payload["host_label"] = host_label
    if host_id:
        payload["host_id"] = host_id
    return payload


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


class ConnectionManager:
    def __init__(self) -> None:
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.roles: Dict[WebSocket, str] = {}
        self.secrets: Dict[WebSocket, bytes] = {}
        self.ws_to_room: Dict[WebSocket, str] = {}
        self.connection_ids: Dict[WebSocket, str] = {}
        self.host_sessions: Dict[WebSocket, Dict[str, Any]] = {}
        self.host_projects: Dict[WebSocket, Dict[str, Any]] = {}
        self.bridge_projects = self.host_projects
        self.room_project_selection: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, token: str, role: str) -> None:
        await websocket.accept()
        self.rooms.setdefault(token, []).append(websocket)
        self.roles[websocket] = role
        self.ws_to_room[websocket] = token
        self.connection_ids[websocket] = f"host-{uuid4().hex[:10]}"

    def disconnect(self, websocket: WebSocket) -> Optional[str]:
        token = self.ws_to_room.pop(websocket, None)
        self.roles.pop(websocket, None)
        self.secrets.pop(websocket, None)
        removed_connection_id = self.connection_ids.pop(websocket, None)
        self.host_sessions.pop(websocket, None)
        removed_project_id = self.host_projects.pop(websocket, {}).get("project_id")
        if token and token in self.rooms:
            if websocket in self.rooms[token]:
                self.rooms[token].remove(websocket)
            if not self.rooms[token]:
                self.rooms.pop(token)
                self.room_project_selection.pop(token, None)
            else:
                selected_project_id = self.room_project_selection.get(token)
                if selected_project_id and selected_project_id == removed_project_id:
                    replacement = self.get_active_host_project(token, preferred_project_id=None)
                    if replacement:
                        self.room_project_selection[token] = replacement["project_id"]
                    else:
                        self.room_project_selection.pop(token, None)
        elif token and removed_connection_id:
            self.room_project_selection.pop(token, None)
        return token

    async def get_peers_in_room(
        self,
        room_token: str,
        *,
        exclude_ws: Optional[WebSocket] = None,
        role_filter: Optional[str] = None,
        target_connection_id: Optional[str] = None,
    ) -> List[WebSocket]:
        peers = list(self.rooms.get(room_token, []))
        if exclude_ws:
            peers = [peer for peer in peers if peer != exclude_ws]
        if role_filter:
            peers = [
                peer
                for peer in peers
                if (
                    _is_desktop_host_role(self.roles.get(peer))
                    if role_filter == DESKTOP_TARGET_ROLE
                    else self.roles.get(peer) == role_filter
                )
            ]
        if target_connection_id:
            peers = [
                peer
                for peer in peers
                if self.connection_ids.get(peer) == target_connection_id
            ]
        return peers

    def room_has_role(self, room_token: str, role: str) -> bool:
        return any(self.roles.get(peer) == role for peer in self.rooms.get(room_token, []))

    def room_has_desktop_host(self, room_token: str) -> bool:
        return any(_is_desktop_host_role(self.roles.get(peer)) for peer in self.rooms.get(room_token, []))

    def get_connection_id(self, websocket: WebSocket) -> Optional[str]:
        return self.connection_ids.get(websocket)

    def update_host_session(
        self,
        websocket: WebSocket,
        *,
        bridge: Optional[Dict[str, Any]] = None,
        project: Optional[Dict[str, Any]] = None,
        session_capabilities: Optional[List[str]] = None,
        runtime_catalog: Optional[List[Dict[str, Any]]] = None,
        active_runtime: Optional[str] = None,
        bridge_label: str = DEFAULT_HOST_LABEL,
    ) -> Optional[Dict[str, Any]]:
        return update_host_session_state(
            self,
            websocket,
            payload_options={
                "bridge": bridge,
                "project": project,
                "session_capabilities": session_capabilities,
                "runtime_catalog": runtime_catalog,
                "active_runtime": active_runtime,
                "bridge_label": bridge_label,
            },
            default_platform=DEFAULT_HOST_PLATFORM,
            is_desktop_host_role=_is_desktop_host_role,
        )

    def update_bridge_project(
        self,
        websocket: WebSocket,
        *,
        project: Optional[Dict[str, Any]] = None,
        runtime_catalog: Optional[List[Dict[str, Any]]] = None,
        active_runtime: Optional[str] = None,
        bridge_label: str = "VS Code Host",
    ) -> Optional[Dict[str, Any]]:
        return self.update_host_session(
            websocket,
            bridge={"label": bridge_label},
            project=project,
            runtime_catalog=runtime_catalog,
            active_runtime=active_runtime,
            bridge_label=bridge_label,
        )

    def list_room_projects(self, room_token: str) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        selected_id = self.room_project_selection.get(room_token)

        for peer in self.rooms.get(room_token, []):
            if not _is_desktop_host_role(self.roles.get(peer)):
                continue
            metadata = self.host_projects.get(peer)
            if not metadata:
                continue
            entries.append(
                project_registry_entry(
                    metadata,
                    selected_id=selected_id,
                    default_host_label=DEFAULT_HOST_LABEL,
                    default_platform=DEFAULT_HOST_PLATFORM,
                )
            )

        return sort_project_registry(entries)

    def get_project_entry(
        self,
        room_token: str,
        project_id: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        if not project_id:
            return None
        for peer in self.rooms.get(room_token, []):
            if not _is_desktop_host_role(self.roles.get(peer)):
                continue
            metadata = self.host_projects.get(peer)
            if metadata and metadata.get("project_id") == project_id:
                return dict(metadata)
        return None

    def get_active_host_project(
        self,
        room_token: str,
        preferred_project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        projects = [
            dict(self.host_projects[peer])
            for peer in self.rooms.get(room_token, [])
            if _is_desktop_host_role(self.roles.get(peer)) and peer in self.host_projects
        ]
        if not projects:
            return None

        selected_id = preferred_project_id or self.room_project_selection.get(room_token)
        selected = self.get_project_entry(room_token, selected_id)
        fallback = active_project_candidate(projects, selected)
        if should_update_project_selection(selected_id, selected):
            self.room_project_selection[room_token] = fallback["project_id"]
        return fallback

    def get_active_bridge_project(
        self,
        room_token: str,
        preferred_project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        return self.get_active_host_project(room_token, preferred_project_id=preferred_project_id)

    def select_project(self, room_token: str, project_id: str) -> bool:
        if not self.get_project_entry(room_token, project_id):
            return False
        self.room_project_selection[room_token] = project_id
        return True

    def find_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        for metadata in self.host_projects.values():
            if metadata.get("project_id") == project_id:
                return dict(metadata)
        return None

    def list_room_hosts(self, room_token: str) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []
        active_project = self.get_active_host_project(room_token)
        active_host_id = active_project.get("host_id") if active_project else None

        for peer in self.rooms.get(room_token, []):
            if not _is_desktop_host_role(self.roles.get(peer)):
                continue
            metadata = self.host_sessions.get(peer)
            if not metadata:
                continue
            descriptor = _host_descriptor_from_metadata(metadata)
            entries.append(
                host_registry_entry(
                    metadata,
                    descriptor,
                    active_host_id=active_host_id,
                    default_host_label=DEFAULT_HOST_LABEL,
                    default_platform=DEFAULT_HOST_PLATFORM,
                )
            )

        return sort_host_registry(entries)

    def get_host_entry(self, room_token: str, host_id: Optional[str]) -> Optional[Dict[str, Any]]:
        if not host_id:
            return None
        for peer in self.rooms.get(room_token, []):
            if not _is_desktop_host_role(self.roles.get(peer)):
                continue
            metadata = self.host_sessions.get(peer)
            if metadata and metadata.get("host_id") == host_id:
                return dict(metadata)
        return None

    def get_active_host(self, room_token: str) -> Optional[Dict[str, Any]]:
        active_project = self.get_active_host_project(room_token)
        if active_project:
            active_host = self.get_host_entry(room_token, active_project.get("host_id"))
            if active_host:
                return active_host
        hosts = self.list_room_hosts(room_token)
        return hosts[0] if hosts else None

    def get_active_host_id(self, room_token: str) -> Optional[str]:
        active_host = self.get_active_host(room_token)
        return active_host.get("host_id") if active_host else None

    def get_project_connection_id(
        self,
        room_token: str,
        project_id: Optional[str] = None,
    ) -> Optional[str]:
        project = self.get_active_host_project(room_token, preferred_project_id=project_id)
        if not project:
            return None
        return project.get("connection_id")

    async def replay_since(
        self,
        websocket: WebSocket,
        last_seq_id: int,
        role: Optional[str] = None,
    ) -> None:
        current_role = role or self.roles.get(websocket)
        for packet in await message_buffer.get_since(last_seq_id):
            if not self._packet_visible_to_role(packet, current_role):
                continue
            await websocket.send_text(await self._serialize_for_connection(packet, websocket))

    async def send_packet(
        self,
        websocket: WebSocket,
        packet: Dict[str, Any],
        *,
        buffer_message: bool = False,
    ) -> Optional[Dict[str, Any]]:
        buffered = await self._buffer_packet(packet, buffer_message)
        try:
            await websocket.send_text(await self._serialize_for_connection(buffered, websocket))
            return buffered
        except Exception as exc:
            logger.warning("Send failed for client: %s", exc)
            self.disconnect(websocket)
            return None

    async def send_to_room(
        self,
        room_token: str,
        packet: Dict[str, Any],
        *,
        role_filter: Optional[str] = None,
        exclude_ws: Optional[WebSocket] = None,
        target_connection_id: Optional[str] = None,
        ignore_rate_limit: bool = False,
        buffer_message: bool = True,
    ) -> Optional[Dict[str, Any]]:
        if not await self._can_deliver(packet, ignore_rate_limit):
            return None

        buffered = await self._buffer_packet(packet, buffer_message)
        peers = await self.get_peers_in_room(
            room_token,
            exclude_ws=exclude_ws,
            role_filter=role_filter,
            target_connection_id=target_connection_id,
        )
        for peer in peers:
            try:
                await peer.send_text(await self._serialize_for_connection(buffered, peer))
            except Exception as exc:
                logger.warning("Broadcast failed for client: %s", exc)
                self.disconnect(peer)
        return buffered

    async def _can_deliver(self, packet: Dict[str, Any], ignore_rate_limit: bool) -> bool:
        if ignore_rate_limit:
            return True
        packet_type = packet.get("type")
        if packet_type == "log":
            return await rate_limiter.consume()
        if packet_type == "execution.event" and packet.get("phase") in {"thinking", "output"}:
            return await rate_limiter.consume()
        return True

    async def _buffer_packet(
        self, packet: Dict[str, Any], buffer_message: bool
    ) -> Dict[str, Any]:
        if not buffer_message:
            return dict(packet)
        if "seq_id" in packet and "timestamp" in packet:
            return dict(packet)
        return await message_buffer.push_and_get(packet)

    async def _serialize_for_connection(
        self, packet: Dict[str, Any], websocket: WebSocket
    ) -> str:
        if packet.get("type") in {"key_exchange", "pong"}:
            return _json_dumps(packet)
        if settings.E2EE_ENABLED and websocket in self.secrets:
            encrypted = Crypto.encrypt(_json_dumps(packet), self.secrets[websocket])
            return _json_dumps({"type": "encrypted", **encrypted})
        return _json_dumps(packet)

    def _packet_visible_to_role(
        self,
        packet: Dict[str, Any],
        role: Optional[str],
    ) -> bool:
        target_role = packet.get("target_role")
        if target_role:
            if target_role == DESKTOP_TARGET_ROLE:
                return _is_desktop_host_role(role)
            return role == target_role
        if packet.get("delivery") == "desktop":
            return role == "desktop" or _is_desktop_host_role(role)
        return True


manager = ConnectionManager()


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
    active_project = manager.get_active_host_project(room_token)
    active_host = manager.get_active_host(room_token)
    project_registry = manager.list_room_projects(room_token)
    session_capabilities = (
        active_host.get("session_capabilities")
        if active_host
        else driver.get_session_capabilities()
    )
    host_descriptor = _host_descriptor_from_metadata(
        active_host,
        capabilities=session_capabilities,
        health=active_host.get("runtime_health") if active_host else "offline",
    )
    return {
        "project_registry": project_registry,
        "active_project_id": active_project.get("project_id") if active_project else None,
        "host_registry": manager.list_room_hosts(room_token),
        "active_host_id": active_host.get("host_id") if active_host else None,
        "project_state": _selected_project_state(room_token),
        "active_runtime": active_project.get("active_runtime") if active_project else driver.get_active_runtime(),
        "runtime_catalog": active_project.get("runtime_catalog") if active_project else driver.get_runtime_catalog(),
        "host": host_descriptor,
        "bridge_label": active_host.get("host_label") if active_host else DEFAULT_HOST_LABEL,
        "session_capabilities": session_capabilities,
    }


async def _broadcast_room_snapshot(room_token: str) -> None:
    snapshot = _room_snapshot_payload(room_token)
    session_packet = build_session_state(
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
    )
    await manager.send_to_room(
        room_token,
        session_packet,
        ignore_rate_limit=True,
        buffer_message=True,
    )
    await manager.send_to_room(
        room_token,
        build_capabilities(
            snapshot["runtime_catalog"],
            session_capabilities=snapshot["session_capabilities"],
            active_runtime=snapshot["active_runtime"],
            active_project_id=snapshot["active_project_id"],
            project_registry=snapshot["project_registry"],
            host_registry=snapshot["host_registry"],
            active_host_id=snapshot["active_host_id"],
            bridge_label=snapshot["bridge_label"],
            host=snapshot["host"],
        ),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _send_initial_snapshot(websocket: WebSocket, room_token: str, role: str) -> None:
    snapshot = _room_snapshot_payload(room_token)
    await manager.send_packet(
        websocket,
        build_session_state(
            room_token,
            role,
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
        buffer_message=False,
    )
    await manager.send_packet(
        websocket,
        build_capabilities(
            snapshot["runtime_catalog"],
            session_capabilities=snapshot["session_capabilities"],
            active_runtime=snapshot["active_runtime"],
            active_project_id=snapshot["active_project_id"],
            project_registry=snapshot["project_registry"],
            host_registry=snapshot["host_registry"],
            active_host_id=snapshot["active_host_id"],
            bridge_label=snapshot["bridge_label"],
            host=snapshot["host"],
        ),
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


def _normalize_decision(decision: Any) -> str:
    raw = str(decision or "").strip().lower()
    if raw in {"approved", "approve", "y", "yes", "true"}:
        return "approved"
    if raw in {"rejected", "reject", "n", "no", "false"}:
        return "rejected"
    return raw or "unknown"


def _resolve_target_project(room_token: str, data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    requested_project_id = str((data or {}).get("project_id") or "").strip() or None
    return manager.get_active_host_project(room_token, preferred_project_id=requested_project_id)


def _target_connection_id(room_token: str, data: Optional[Dict[str, Any]] = None) -> Optional[str]:
    project = _resolve_target_project(room_token, data)
    return project.get("connection_id") if project else None


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

    await _emit_room_event(
        room_token,
        build_user_prompt_event(prompt, target_project=target_project, target_runtime=target_runtime),
        exclude_ws=websocket,
        ignore_rate_limit=True,
        buffer_message=True,
    )
    await _emit_room_event(
        room_token,
        build_prompt_dispatch_event(target_project=target_project, target_runtime=target_runtime),
        ignore_rate_limit=True,
        buffer_message=True,
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
            {
                **approval_result_from_response(
                    str(data.get("approval_id") or ""),
                    str(data.get("decision") or ""),
                    False,
                ),
                "reason": "bridge_offline",
                "project_id": target_project.get("project_id") if target_project else None,
                "target_runtime": data.get("target_runtime"),
            },
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return
    approval_id = str(data.get("approval_id") or "")
    decision = _normalize_decision(data.get("decision"))
    await driver.dispatch_command(
        {
            "type": "approval.response",
            "approval_id": approval_id,
            "decision": decision,
            "project_id": target_project.get("project_id") if target_project else None,
            "target_connection_id": target_project.get("connection_id") if target_project else None,
            "target_runtime": data.get("target_runtime"),
        }
    )
    success = True
    await _emit_room_event(
        room_token,
        {
            **approval_result_from_response(approval_id, decision, success),
            "project_id": target_project.get("project_id") if target_project else None,
        },
        ignore_rate_limit=True,
        buffer_message=True,
    )
    await _emit_room_event(
        room_token,
        build_audit_event(
            "approval",
            "Approval response forwarded",
            approval_id=approval_id,
            decision=decision,
            ok=success,
            project_id=target_project.get("project_id") if target_project else None,
        ),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _route_kill_request(data: Dict[str, Any], room_token: str) -> None:
    target_project = _resolve_target_project(room_token, data)
    if not manager.room_has_desktop_host(room_token):
        await _emit_room_event(
            room_token,
            {
                "type": "kill.result",
                "ok": False,
                "message": "No desktop host is connected",
                "reason": "bridge_offline",
                "project_id": target_project.get("project_id") if target_project else None,
                "target_runtime": data.get("target_runtime"),
            },
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return

    await _ensure_driver_running(room_token)
    await driver.dispatch_command(
        {
            "type": "kill.request",
            "project_id": target_project.get("project_id") if target_project else None,
            "target_connection_id": target_project.get("connection_id") if target_project else None,
            "target_runtime": data.get("target_runtime"),
            "reason": data.get("reason"),
        }
    )
    await _emit_room_event(
        room_token,
        build_audit_event(
            "kill",
            "Kill request sent to desktop host",
            project_id=target_project.get("project_id") if target_project else None,
            target_runtime=data.get("target_runtime"),
            reason="desktop_dispatch",
        ),
        ignore_rate_limit=True,
        buffer_message=True,
    )


async def _route_project_select(data: Dict[str, Any], room_token: str) -> None:
    project_id = str(data.get("project_id") or "").strip()
    if not project_id:
        return
    if not manager.select_project(room_token, project_id):
        await _emit_room_event(
            room_token,
            build_execution_event(
                "error",
                "Selected project is no longer available.",
                reason="project_unavailable",
                project_id=project_id,
            ),
            ignore_rate_limit=True,
            buffer_message=True,
        )
        return
    await _broadcast_room_snapshot(room_token)
    selected_project = manager.get_active_host_project(room_token, preferred_project_id=project_id)
    await _emit_room_event(
        room_token,
        build_audit_event(
            "project",
            "Active project changed",
            project_id=project_id,
            project_name=selected_project.get("project_name") if selected_project else None,
            bridge_label=selected_project.get("bridge_label") if selected_project else None,
        ),
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


async def _handle_protocol_message(
    data: Dict[str, Any],
    websocket: WebSocket,
    room_token: str,
    role: str,
) -> None:
    msg_type = data.get("type")

    if _is_desktop_host_role(role) and msg_type in {"hello", "capabilities", "session.state"}:
        await _sync_bridge_metadata(data, room_token, websocket)
        if msg_type == "hello":
            await _send_initial_snapshot(websocket, room_token, role)
        return

    if (_is_desktop_host_role(role) or role == "desktop") and msg_type in {
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
    }:
        await _handle_bridge_room_event(data, room_token, websocket)
        return

    dispatchers = {
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

    handler = dispatchers.get(msg_type)
    if handler:
        await handler()


def _safe_json_loads(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


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


async def _decrypt_if_needed(
    data: Dict[str, Any], websocket: WebSocket
) -> Optional[Dict[str, Any]]:
    if data.get("type") != "encrypted":
        return data
    if websocket not in manager.secrets:
        return None
    decrypted = Crypto.decrypt(data, manager.secrets[websocket])
    return _safe_json_loads(decrypted)


async def _handle_socket_message(
    websocket: WebSocket, message_text: str, room_token: str, role: str
) -> None:
    data = _safe_json_loads(message_text)
    if not data:
        return
    if await _handle_handshake(data, websocket):
        return
    if await _handle_resume(data, websocket):
        return

    decrypted = await _decrypt_if_needed(data, websocket)
    if not decrypted:
        return

    normalized = normalize_protocol_message(decrypted)
    if await _handle_resume(normalized, websocket):
        return
    await _handle_protocol_message(normalized, websocket, room_token, role)


async def _ws_loop(websocket: WebSocket, room_token: str, role: str) -> None:
    while True:
        message = await websocket.receive_text()
        await _handle_socket_message(websocket, message, room_token, role)


async def broadcast_driver_output(room_token: str) -> None:
    try:
        async for packet_text in driver.start():
            packet = normalize_protocol_message(_safe_json_loads(packet_text) or {"type": "log", "content": packet_text})
            delivery = packet.get("delivery")
            role_filter = packet.get("target_role")
            if delivery == "desktop":
                await _emit_room_event(
                    room_token,
                    packet,
                    role_filter=role_filter,
                    target_connection_id=packet.get("target_connection_id"),
                    ignore_rate_limit=True,
                    buffer_message=False,
                )
            else:
                await _emit_room_event(
                    room_token,
                    packet,
                    ignore_rate_limit=True,
                    buffer_message=True,
                )
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.error("Broadcast error: %s", exc)
        await _emit_room_event(
            room_token,
            build_execution_event("error", f"Driver broadcast failed: {exc}", reason="driver_broadcast_error"),
            ignore_rate_limit=True,
            buffer_message=True,
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

    room_token = token or "default_room"
    current_role = role or "desktop"
    await manager.connect(websocket, room_token, current_role)
    await _ensure_driver_running(room_token)
    await _send_initial_snapshot(websocket, room_token, current_role)
    await _emit_room_event(
        room_token,
        build_audit_event(
            "session",
            "Client joined room",
            role=current_role,
        ),
        exclude_ws=websocket,
        ignore_rate_limit=True,
        buffer_message=True,
    )

    try:
        await _ws_loop(websocket, room_token, current_role)
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
    finally:
        disconnected_room = manager.disconnect(websocket)
        if disconnected_room:
            await _emit_room_event(
                disconnected_room,
                build_audit_event(
                    "session",
                    "Client left room",
                    role=current_role,
                ),
                ignore_rate_limit=True,
                buffer_message=True,
            )
            if disconnected_room not in manager.rooms:
                await _shutdown_room_tasks(disconnected_room)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
