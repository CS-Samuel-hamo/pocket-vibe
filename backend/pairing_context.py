"""Pairing context, local IP detection, and QR rendering helpers."""

import io
import os
import re
import socket
from typing import Any, Callable, Dict, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import psutil

from backend.static_pwa import backend_mobile_base_url, should_serve_frontend_from_backend


def is_valid_adapter_ip(addr: Any) -> bool:
    if addr.family != socket.AF_INET:
        return False
    if addr.address.startswith("127.") or addr.address.startswith("198.18."):
        return False
    return True


def scan_adapters() -> list[str]:
    candidates: list[str] = []
    for _, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if is_valid_adapter_ip(addr):
                candidates.append(addr.address)
    return candidates


def pick_best_ip(candidates: list[str]) -> Optional[str]:
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


def get_fallback_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.settimeout(1)
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    finally:
        sock.close()


def get_local_ip_payload(logger: Any) -> Dict[str, str]:
    try:
        best_ip = pick_best_ip(scan_adapters())
        return {"ip": best_ip or get_fallback_ip()}
    except Exception as exc:
        logger.warning("IP detection error: %s", exc)
        return {"ip": "127.0.0.1"}


def replace_loopback_host(url: str, local_ip: str) -> str:
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    if hostname not in {"127.0.0.1", "localhost", "0.0.0.0"}:
        return url
    netloc = local_ip if not parsed.port else f"{local_ip}:{parsed.port}"
    return urlunparse(parsed._replace(netloc=netloc))


def append_query_param(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k != key]
    query.append((key, value))
    return urlunparse(parsed._replace(query=urlencode(query)))


def normalize_base_url(url: str, default_path: str = "") -> str:
    parsed = urlparse(url.strip())
    if not parsed.scheme:
        return ""
    normalized = parsed._replace(path=parsed.path or default_path)
    return urlunparse(normalized)


def _configured_mobile_base_url(local_ip: str) -> str:
    configured = os.getenv("PUBLIC_FRONTEND_URL", "").strip() or os.getenv("VITE_FRONTEND_URL", "").strip()
    if not configured:
        return ""
    normalized = replace_loopback_host(configured, local_ip)
    parsed = urlparse(normalized)
    if not parsed.scheme:
        return ""
    return urlunparse(parsed._replace(path="/")) if not parsed.path else normalized


def _default_mobile_base_url(local_ip: str, port: int) -> str:
    if should_serve_frontend_from_backend():
        return backend_mobile_base_url(local_ip, port)
    return f"http://{local_ip}:5173/"


def resolve_mobile_base_url(local_ip: str, port: int = 5173) -> str:
    return _configured_mobile_base_url(local_ip) or _default_mobile_base_url(local_ip, port)


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def resolve_api_base_url(local_ip: str, port: int) -> str:
    configured = os.getenv("PUBLIC_API_BASE_URL", "").strip()
    if configured:
        normalized = normalize_base_url(configured)
        if normalized:
            return normalized.rstrip("/")
    return f"http://{local_ip}:{port}"


def resolve_backend_ws_url(local_ip: str, port: int) -> str:
    configured = os.getenv("PUBLIC_BACKEND_WS_URL", "").strip()
    if configured:
        normalized = normalize_base_url(configured, "/ws")
        if normalized:
            return normalized
    return f"ws://{local_ip}:{port}/ws"


def build_mobile_target_url(
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
        target_url = append_query_param(target_url, key, value)
    return target_url


def remote_mode_enabled(env_get: Callable[[str, str], str] = os.getenv) -> bool:
    return any(env_get(name, "").strip() for name in ("PUBLIC_FRONTEND_URL", "PUBLIC_API_BASE_URL", "PUBLIC_BACKEND_WS_URL"))


def build_pairing_context_payload(
    local_ip: str,
    *,
    auth_token: str,
    auth_mode: str,
    expires_at: Optional[float],
    port: int,
) -> Dict[str, Any]:
    mobile_base_url = resolve_mobile_base_url(local_ip, port)
    api_base_url = resolve_api_base_url(local_ip, port)
    backend_ws_url = resolve_backend_ws_url(local_ip, port)
    target_url = build_mobile_target_url(
        mobile_base_url,
        token=auth_token,
        api_base_url=api_base_url,
        backend_ws_url=backend_ws_url,
    )
    backend_base_url = f"http://{local_ip}:{port}"
    return {
        "token": auth_token,
        "auth_mode": auth_mode,
        "expires_at": expires_at,
        "local_ip": local_ip,
        "mobile_base_url": mobile_base_url,
        "api_base_url": api_base_url,
        "backend_ws_url": backend_ws_url,
        "connection_mode": "public" if remote_mode_enabled() else "lan",
        "target_url": target_url,
        "pairing_page_url": f"{backend_base_url}/",
        "qr_svg_url": f"{backend_base_url}/api/pairing/qr.svg",
    }


def render_qr_svg(data: str) -> Optional[str]:
    try:
        import qrcode
        from qrcode.image.svg import SvgImage
    except ImportError:
        return None
    stream = io.BytesIO()
    image = qrcode.make(data, image_factory=SvgImage)
    image.save(stream)
    return stream.getvalue().decode("utf-8")
