import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any
from src.core.config import settings

logger = logging.getLogger(__name__)

class ProjectStateService:
    """Service to track project context, active files, and available commands."""

    def __init__(self, target_dir: str = None) -> None:
        self.target_dir = Path(target_dir or settings.TARGET_DIR).resolve()
        self.ignore_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build'}
        self.command_scan_depth = 2

    def get_active_files(self, limit: int = 10) -> List[str]:
        """Return the most recently modified files in the project."""
        files_with_mtime = []
        try:
            for root, dirs, files in os.walk(self.target_dir):
                dirs[:] = [d for d in dirs if d not in self.ignore_dirs]
                self._collect_files(root, files, files_with_mtime)

            files_with_mtime.sort(key=lambda x: x[1], reverse=True)
            return [f[0] for f in files_with_mtime[:limit]]
        except Exception as e:
            logger.error(f"Error scanning active files: {e}")
            return []

    def get_all_files(self, limit: int = 2000) -> List[str]:
        """Return a flat list of all files in the project for omni-search."""
        all_files = []
        try:
            for root, dirs, files in os.walk(self.target_dir):
                dirs[:] = [d for d in dirs if d not in self.ignore_dirs]
                for f in files:
                    full_path = Path(root) / f
                    try:
                        rel_path = str(full_path.relative_to(self.target_dir))
                        # Use forward slashes for cross-platform UI consistency
                        all_files.append(rel_path.replace('\\', '/'))
                        if len(all_files) >= limit:
                            return all_files
                    except ValueError:
                        continue
            return all_files
        except Exception as e:
            logger.error(f"Error scanning all files: {e}")
            return []

    def _collect_files(self, root: str, files: List[str], target_list: List):
        """Helper to collect files with their mtime."""
        for f in files:
            full_path = Path(root) / f
            try:
                mtime = os.path.getmtime(full_path)
                rel_path = str(full_path.relative_to(self.target_dir))
                target_list.append((rel_path, mtime))
            except (OSError, ValueError):
                continue

    def get_available_commands(self) -> List[Dict[str, str]]:
        """Extract runnable commands from supported package.json or Makefile manifests."""
        commands = []
        seen_commands = set()
        for command_dir in self._iter_command_dirs():
            self._add_npm_scripts(command_dir, commands, seen_commands)
            self._add_make_targets(command_dir, commands, seen_commands)
        return commands

    def _iter_command_dirs(self) -> List[Path]:
        """Collect directories that can contribute runnable commands."""
        command_dirs: List[Path] = []
        seen: set[Path] = set()

        for root, dirs, files in os.walk(self.target_dir):
            root_path = Path(root)
            rel_root = root_path.relative_to(self.target_dir)
            depth = 0 if rel_root == Path('.') else len(rel_root.parts)
            dirs[:] = [
                directory
                for directory in dirs
                if self._should_scan_command_dir(directory, depth + 1)
            ]

            if "package.json" in files or "Makefile" in files:
                if root_path not in seen:
                    seen.add(root_path)
                    command_dirs.append(root_path)

        return sorted(
            command_dirs,
            key=lambda candidate: (
                0 if candidate == self.target_dir else 1,
                len(candidate.relative_to(self.target_dir).parts),
                str(candidate).lower(),
            ),
        )

    def _should_scan_command_dir(self, directory_name: str, depth: int) -> bool:
        """Keep command discovery focused on first-party workspace folders."""
        if depth > self.command_scan_depth:
            return False
        if directory_name in self.ignore_dirs:
            return False
        return not directory_name.startswith('.')

    def _relative_dir(self, command_dir: Path) -> str:
        """Return a normalized relative path for user-facing labels."""
        rel_dir = command_dir.relative_to(self.target_dir)
        return "." if rel_dir == Path(".") else rel_dir.as_posix()

    def _record_command(
        self,
        commands: List[Dict[str, str]],
        seen_commands: set[str],
        *,
        name: str,
        command: str,
        source: str,
    ) -> None:
        """Deduplicate commands while preserving discovery order."""
        if command in seen_commands:
            return
        seen_commands.add(command)
        commands.append({"name": name, "command": command, "source": source})

    def _add_npm_scripts(self, command_dir: Path, commands: List, seen_commands: set[str]):
        """Extract scripts from package.json manifests in supported workspaces."""
        pkg_json = command_dir / "package.json"
        if not pkg_json.exists():
            return
        try:
            with open(pkg_json, 'r', encoding='utf-8') as f:
                scripts = json.load(f).get("scripts", {})
                scope = self._relative_dir(command_dir)
                source = pkg_json.relative_to(self.target_dir).as_posix()
                for name in scripts:
                    if scope == ".":
                        label = f"npm run {name}"
                        command = f"npm run {name}"
                    else:
                        label = f"{scope}: {name}"
                        command = f"npm --prefix {scope} run {name}"
                    self._record_command(
                        commands,
                        seen_commands,
                        name=label,
                        command=command,
                        source=source,
                    )
        except Exception:
            pass

    def _add_make_targets(self, command_dir: Path, commands: List, seen_commands: set[str]):
        """Extract targets from Makefiles in supported workspaces."""
        makefile = command_dir / "Makefile"
        if not makefile.exists():
            return
        try:
            scope = self._relative_dir(command_dir)
            source = makefile.relative_to(self.target_dir).as_posix()
            with open(makefile, 'r', encoding='utf-8') as f:
                for line in f:
                    target = self._parse_makefile_line(line)
                    if not target:
                        continue

                    if scope == ".":
                        label = f"make {target}"
                        command = f"make {target}"
                    else:
                        label = f"{scope}: make {target}"
                        command = f"make -C {scope} {target}"
                    self._record_command(
                        commands,
                        seen_commands,
                        name=label,
                        command=command,
                        source=source,
                    )
        except Exception:
            pass

    def _parse_makefile_line(self, line: str) -> str | None:
        """Parse a single line from a Makefile."""
        if line.startswith(tuple('abcdefghijklmnopqrstuvwxyz')) and ':' in line:
            if not line.startswith(('.', '#')):
                target = line.split(':')[0].strip()
                if target and not target.startswith('_'):
                    return target
        return None

    def get_state(self) -> Dict[str, Any]:
        """Combine all project state into a single dictionary."""
        return {
            "type": "project_state",
            "active_files": self.get_active_files(),
            "all_files": self.get_all_files(),
            "available_commands": self.get_available_commands(),
            "project_name": self.target_dir.name
        }
