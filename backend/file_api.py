"""File browsing and reading helpers for the backend API."""

from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


def resolve_project_root(
    project_id: Optional[str],
    *,
    target_dir: str,
    find_project: Callable[[str], Optional[Dict[str, Any]]],
) -> Path:
    if not project_id:
        return Path(target_dir).resolve()
    project_entry = find_project(project_id)
    workspace_path = project_entry.get("workspace_path") if project_entry else None
    return Path(workspace_path or target_dir).resolve()


def safe_resolve(
    path: str,
    project_id: Optional[str],
    *,
    resolve_project_root: Callable[[Optional[str]], Path],
) -> Path:
    target = resolve_project_root(project_id)
    requested = (target / path).resolve()
    try:
        requested.relative_to(target)
    except ValueError as exc:
        raise ValueError("Path traversal detected") from exc
    return requested


def build_file_list(root: Path, base_target: Path) -> List[Dict[str, Any]]:
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


def list_files_payload(
    path: str,
    project_id: Optional[str],
    *,
    resolve_path: Callable[[str, Optional[str]], Path],
    resolve_project_root: Callable[[Optional[str]], Path],
) -> Dict[str, Any] | List[Dict[str, Any]]:
    try:
        root = resolve_path(path, project_id)
        base_target = resolve_project_root(project_id)
    except ValueError:
        return {"error": "Invalid path"}
    if not root.exists() or not root.is_dir():
        return {"error": "Path not found or not a dir"}
    try:
        raw = build_file_list(root, base_target)
        return sorted(raw, key=lambda item: (not item["is_dir"], item["name"]))
    except PermissionError:
        return {"error": "Permission denied"}


def validate_read_path(
    path: str,
    project_id: Optional[str],
    *,
    resolve_path: Callable[[str, Optional[str]], Path],
) -> Optional[Path]:
    try:
        full_path = resolve_path(path, project_id)
        if not full_path.exists() or full_path.is_dir():
            return None
        return full_path
    except ValueError:
        return None


def read_file_payload(
    path: str,
    project_id: Optional[str],
    *,
    validate_path: Callable[[str, Optional[str]], Optional[Path]],
    max_file_read_bytes: int,
    logger: Any,
) -> Dict[str, str]:
    full_path = validate_path(path, project_id)
    if not full_path:
        return {"error": "Invalid file access"}
    try:
        if full_path.stat().st_size > max_file_read_bytes:
            return {"error": f"File too large (Max {max_file_read_bytes} bytes)"}
        return {"content": full_path.read_text(encoding="utf-8")}
    except UnicodeDecodeError:
        return {"error": "Invalid text encoding"}
    except OSError as exc:
        logger.warning("File read failed for %s: %s", full_path, exc)
        return {"error": "Failed to read file"}
    except Exception:
        logger.exception("Unexpected file read failure for %s", full_path)
        return {"error": "Failed to read file"}
