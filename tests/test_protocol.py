from src.domain.models.protocol import (
    build_capabilities,
    build_host_descriptor,
    build_session_state,
    normalize_protocol_message,
)


def test_build_session_state_includes_host_registry_fields():
    payload = build_session_state(
        "room-1",
        "mobile",
        bridge_connected=True,
        auth_mode="configured",
        expires_at=None,
        project_state={"project_name": "Pocket_Vibe"},
        project_registry=[{"project_id": "project-1", "project_name": "Pocket_Vibe"}],
        active_project_id="project-1",
        host_registry=[{"host_id": "host-1", "host_label": "VS Code Host"}],
        active_host_id="host-1",
        active_runtime="codex-cli",
    )

    assert payload["bridge_connected"] is True
    assert payload["host_connected"] is True
    assert payload["host_registry"][0]["host_id"] == "host-1"
    assert payload["active_host_id"] == "host-1"


def test_build_capabilities_includes_host_descriptor_and_registry():
    payload = build_capabilities(
        [{"id": "codex-cli", "label": "Codex CLI", "health": "ready"}],
        session_capabilities=["prompt", "kill"],
        active_runtime="codex-cli",
        active_project_id="project-1",
        project_registry=[{"project_id": "project-1", "project_name": "Pocket_Vibe"}],
        host_registry=[{"host_id": "host-1", "host_label": "VS Code Host"}],
        active_host_id="host-1",
        host={
            "id": "host-1",
            "label": "VS Code Host",
            "platform": "vscode",
            "kind": "ide-host",
            "version": "0.1.0",
        },
    )

    assert payload["bridge"]["id"] == "host-1"
    assert payload["host"]["platform"] == "vscode"
    assert payload["host"]["kind"] == "ide-host"
    assert payload["host"]["capabilities"] == ["prompt", "kill"]
    assert payload["host"]["health"] == "ready"
    assert payload["host_registry"][0]["host_id"] == "host-1"
    assert payload["active_host_id"] == "host-1"


def test_build_host_descriptor_normalizes_legacy_aliases():
    payload = build_host_descriptor(
        {
            "host_id": "native-1",
            "host_label": "Codex App Host",
            "host_platform": "codex-app",
            "host_kind": "native-app",
            "host_version": "1.2.3",
            "session_capabilities": ["prompt"],
            "runtime_health": "degraded",
            "last_error": "approval unsupported",
        }
    )

    assert payload == {
        "id": "native-1",
        "label": "Codex App Host",
        "platform": "codex-app",
        "kind": "native-app",
        "version": "1.2.3",
        "capabilities": ["prompt"],
        "health": "degraded",
        "last_error": "approval unsupported",
    }


def test_legacy_user_input_maps_to_prompt_submit():
    normalized = normalize_protocol_message({"type": "user_input", "content": "hello"})

    assert normalized == {
        "type": "prompt.submit",
        "prompt": "hello",
        "target_runtime": None,
        "source_type": "user_input",
    }


def test_legacy_sniper_action_maps_to_command_dispatch():
    normalized = normalize_protocol_message(
        {
            "type": "sniper_action",
            "file": "src/app.py",
            "lines": [12],
            "action": "rewrite",
            "instruction": "refactor this block",
        }
    )

    assert normalized["type"] == "command.dispatch"
    assert normalized["action"] == "rewrite"
    assert normalized["file"] == "src/app.py"
    assert normalized["lines"] == [12]
