"""Read-only desktop-host probe for non-reference host feasibility.

This probe registers a synthetic native-app host with the Pocket Vibe backend.
It is intentionally read-only: every control message returns an explicit
unsupported execution event instead of pretending to control a real app.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlencode


PROBE_VERSION = "probe-0.1"
UNSUPPORTED_REASON = "host_probe.read_only"


def _project_id(host_id: str, project_root: str) -> str:
    resolved_root = str(Path(project_root).resolve())
    return f"{host_id}::{resolved_root.lower()}"


def build_probe_capabilities(
    *,
    host_id: str,
    label: str,
    platform: str,
    project_root: str,
) -> Dict[str, Any]:
    resolved_root = str(Path(project_root).resolve())
    return {
        "type": "capabilities",
        "host": {
            "id": host_id,
            "label": label,
            "platform": platform,
            "kind": "native-app",
            "version": PROBE_VERSION,
            "capabilities": [],
            "health": "degraded",
            "last_error": "Read-only host probe; dispatch is unsupported.",
        },
        "project": {
            "project_id": _project_id(host_id, resolved_root),
            "project_name": Path(resolved_root).name,
            "root_path": resolved_root,
        },
        "session_capabilities": [],
        "runtime_catalog": [],
        "active_runtime": None,
    }


def build_unsupported_event(message: Dict[str, Any], project_id: str) -> Dict[str, Any]:
    message_type = message.get("type") or "unknown"
    return {
        "type": "execution.event",
        "phase": "error",
        "message": f"Host probe does not support {message_type}.",
        "reason": UNSUPPORTED_REASON,
        "project_id": message.get("project_id") or project_id,
        "target_runtime": message.get("target_runtime"),
    }


def build_backend_url(backend_ws_url: str, token: str) -> str:
    separator = "&" if "?" in backend_ws_url else "?"
    return f"{backend_ws_url}{separator}{urlencode({'token': token, 'role': 'desktop-host'})}"


async def run_probe(args: argparse.Namespace) -> None:
    import websockets

    payload = build_probe_capabilities(
        host_id=args.host_id,
        label=args.label,
        platform=args.platform,
        project_root=args.project_root,
    )
    project_id = payload["project"]["project_id"]
    url = build_backend_url(args.backend_ws_url, args.token)

    async with websockets.connect(url) as websocket:
        await websocket.send(json.dumps(payload, ensure_ascii=False))
        print(f"Registered read-only host probe: {payload['host']['label']} -> {project_id}")

        while True:
            raw_message = await websocket.recv()
            try:
                message = json.loads(raw_message)
            except json.JSONDecodeError:
                continue
            if message.get("type") in {
                "prompt.submit",
                "command.dispatch",
                "workspace.focus",
                "approval.response",
                "kill.request",
            }:
                await websocket.send(
                    json.dumps(build_unsupported_event(message, project_id), ensure_ascii=False)
                )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Register a read-only Pocket Vibe desktop-host probe.")
    parser.add_argument("--backend-ws-url", default="ws://127.0.0.1:8000/ws")
    parser.add_argument("--token", default="vibe-safe")
    parser.add_argument("--host-id", default="native-probe-1")
    parser.add_argument("--label", default="Native App Probe")
    parser.add_argument("--platform", default="native-app-probe")
    parser.add_argument("--project-root", default=".")
    return parser.parse_args()


def main() -> None:
    asyncio.run(run_probe(parse_args()))


if __name__ == "__main__":
    main()
