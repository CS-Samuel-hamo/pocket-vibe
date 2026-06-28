"""Tests for backend file browsing helpers."""

from pathlib import Path

from backend.file_api import (
    list_files_payload,
    read_file_payload,
    resolve_project_root,
    safe_resolve,
    validate_read_path,
)


class _Logger:
    def __init__(self):
        self.warnings = []

    def warning(self, message, *args):
        self.warnings.append(message % args)

    def exception(self, message, *args):
        self.warnings.append(message % args)


def test_resolve_project_root_uses_project_workspace_when_present(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    result = resolve_project_root(
        "p1",
        target_dir=str(tmp_path),
        find_project=lambda _project_id: {"workspace_path": str(workspace)},
    )

    assert result == workspace.resolve()


def test_safe_resolve_blocks_path_traversal(tmp_path):
    try:
        safe_resolve("../escape.txt", None, resolve_project_root=lambda _project_id: tmp_path)
    except ValueError as exc:
        assert "Path traversal" in str(exc)
    else:
        raise AssertionError("path traversal should fail")


def test_list_files_payload_sorts_directories_before_files(tmp_path):
    (tmp_path / "z-file.txt").write_text("x", encoding="utf-8")
    (tmp_path / "a-dir").mkdir()

    result = list_files_payload(
        ".",
        None,
        resolve_path=lambda _path, _project_id: tmp_path,
        resolve_project_root=lambda _project_id: tmp_path,
    )

    assert [item["name"] for item in result] == ["a-dir", "z-file.txt"]


def test_validate_read_path_rejects_directories(tmp_path):
    assert validate_read_path(".", None, resolve_path=lambda _path, _project_id: tmp_path) is None


def test_read_file_payload_hides_os_errors():
    class _BadPath:
        def stat(self):
            raise OSError("C:/secret")

    result = read_file_payload(
        "secret.txt",
        None,
        validate_path=lambda _path, _project_id: _BadPath(),
        max_file_read_bytes=100,
        logger=_Logger(),
    )

    assert result == {"error": "Failed to read file"}
