"""Backend-hosted production PWA support."""

import os
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles


MOBILE_PWA_ROUTE = "/app"


def frontend_dist_dir(repo_root: Optional[Path] = None) -> Path:
    root = repo_root or Path(__file__).resolve().parent.parent
    return root / "frontend" / "dist"


def should_serve_frontend_from_backend(env_get: Callable[[str, str], str] = os.getenv) -> bool:
    return env_get("SERVE_FRONTEND_FROM_BACKEND", "").strip().lower() in {"1", "true", "yes", "on"}


def pwa_dist_ready(dist_dir: Path) -> bool:
    return dist_dir.is_dir() and (dist_dir / "index.html").is_file()


def backend_mobile_base_url(local_ip: str, port: int, route_prefix: str = MOBILE_PWA_ROUTE) -> str:
    normalized_prefix = "/" + route_prefix.strip("/")
    return f"http://{local_ip}:{port}{normalized_prefix}/"


def _mount_result(
    *,
    enabled: bool,
    mounted: bool,
    route_prefix: str,
    dist_dir: Path,
) -> Dict[str, Any]:
    return {
        "enabled": enabled,
        "mounted": mounted,
        "route_prefix": route_prefix,
        "dist_dir": str(dist_dir),
    }


def _mount_ready_pwa(app: FastAPI, *, dist_dir: Path, route_prefix: str) -> None:
    app.mount(
        route_prefix,
        StaticFiles(directory=str(dist_dir), html=True),
        name="mobile-pwa",
    )


def _register_missing_pwa_routes(app: FastAPI, *, route_prefix: str) -> None:
    @app.get(route_prefix)
    @app.get(f"{route_prefix}/{{path:path}}")
    async def mobile_pwa_missing(path: str = "") -> HTMLResponse:
        return HTMLResponse(
            "<h1>Pocket Vibe mobile app is not built</h1>"
            "<p>Run <code>cd frontend && npm run build</code>, then restart the backend.</p>",
            status_code=503,
        )


def mount_mobile_pwa(
    app: FastAPI,
    *,
    enabled: bool,
    dist_dir: Optional[Path] = None,
    route_prefix: str = MOBILE_PWA_ROUTE,
) -> Dict[str, Any]:
    resolved_dist = dist_dir or frontend_dist_dir()
    normalized_prefix = "/" + route_prefix.strip("/")

    if enabled and pwa_dist_ready(resolved_dist):
        _mount_ready_pwa(app, dist_dir=resolved_dist, route_prefix=normalized_prefix)
        return _mount_result(
            enabled=True,
            mounted=True,
            route_prefix=normalized_prefix,
            dist_dir=resolved_dist,
        )

    if enabled:
        _register_missing_pwa_routes(app, route_prefix=normalized_prefix)

    return _mount_result(
        enabled=enabled,
        mounted=False,
        route_prefix=normalized_prefix,
        dist_dir=resolved_dist,
    )
