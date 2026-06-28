"""Local desktop connection profile for bridge auto-discovery."""

import json
import time
from pathlib import Path
from typing import Any, Dict, Optional


PROFILE_DIR_NAME = ".pocket-vibe"
PROFILE_FILE_NAME = "desktop-connection.json"


def desktop_connection_profile_path(repo_root: Path) -> Path:
    return repo_root / PROFILE_DIR_NAME / PROFILE_FILE_NAME


def build_desktop_connection_profile(
    pairing: Dict[str, Any],
    *,
    token: str,
    auth_mode: str,
    expires_at: Optional[float],
    updated_at: Optional[float] = None,
) -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "backend_ws_url": str(pairing["backend_ws_url"]),
        "api_base_url": str(pairing["api_base_url"]),
        "token": token,
        "auth_mode": auth_mode,
        "expires_at": expires_at,
        "pairing_page_url": str(pairing["pairing_page_url"]),
        "mobile_url": str(pairing["target_url"]),
        "connection_mode": str(pairing["connection_mode"]),
        "updated_at": updated_at or time.time(),
    }


def write_desktop_connection_profile(repo_root: Path, profile: Dict[str, Any]) -> Path:
    profile_path = desktop_connection_profile_path(repo_root)
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    profile_path.write_text(
        json.dumps(profile, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return profile_path
