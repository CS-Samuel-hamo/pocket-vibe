import json

from src.domain.services.project_state import ProjectStateService


def test_get_available_commands_discovers_supported_workspace_scripts(tmp_path):
    (tmp_path / "frontend").mkdir()
    (tmp_path / "vscode-bridge").mkdir()
    (tmp_path / ".pv-vscode-extensions").mkdir()

    (tmp_path / "package.json").write_text(
        json.dumps({"scripts": {"lint": "eslint ."}}),
        encoding="utf-8",
    )
    (tmp_path / "frontend" / "package.json").write_text(
        json.dumps({"scripts": {"build": "vite build", "test:capabilities": "node --test"}}),
        encoding="utf-8",
    )
    (tmp_path / "vscode-bridge" / "package.json").write_text(
        json.dumps({"scripts": {"compile": "tsc -p ./"}}),
        encoding="utf-8",
    )
    (tmp_path / ".pv-vscode-extensions" / "package.json").write_text(
        json.dumps({"scripts": {"ignored": "echo should-not-appear"}}),
        encoding="utf-8",
    )

    service = ProjectStateService(str(tmp_path))

    commands = service.get_available_commands()

    assert {"name": "npm run lint", "command": "npm run lint", "source": "package.json"} in commands
    assert {
        "name": "frontend: build",
        "command": "npm --prefix frontend run build",
        "source": "frontend/package.json",
    } in commands
    assert {
        "name": "frontend: test:capabilities",
        "command": "npm --prefix frontend run test:capabilities",
        "source": "frontend/package.json",
    } in commands
    assert {
        "name": "vscode-bridge: compile",
        "command": "npm --prefix vscode-bridge run compile",
        "source": "vscode-bridge/package.json",
    } in commands
    assert all("ignored" not in command["name"] for command in commands)
