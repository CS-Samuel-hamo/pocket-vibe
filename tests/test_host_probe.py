import importlib.util
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "host_probe.py"
SPEC = importlib.util.spec_from_file_location("host_probe", SCRIPT_PATH)
host_probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(host_probe)


def test_build_probe_capabilities_registers_read_only_native_host(tmp_path):
    payload = host_probe.build_probe_capabilities(
        host_id="native-probe-test",
        label="Native Probe",
        platform="native-app-probe",
        project_root=str(tmp_path),
    )

    assert payload["type"] == "capabilities"
    assert payload["host"]["id"] == "native-probe-test"
    assert payload["host"]["kind"] == "native-app"
    assert payload["host"]["capabilities"] == []
    assert payload["host"]["health"] == "degraded"
    assert payload["project"]["project_name"] == tmp_path.name
    assert payload["project"]["project_id"].startswith("native-probe-test::")
    assert payload["runtime_catalog"] == []
    assert payload["active_runtime"] is None


def test_build_unsupported_event_preserves_project_and_runtime():
    event = host_probe.build_unsupported_event(
        {
            "type": "prompt.submit",
            "project_id": "project-1",
            "target_runtime": "codex-cli",
        },
        "fallback-project",
    )

    assert event == {
        "type": "execution.event",
        "phase": "error",
        "message": "Host probe does not support prompt.submit.",
        "reason": "host_probe.read_only",
        "project_id": "project-1",
        "target_runtime": "codex-cli",
    }


def test_build_backend_url_adds_desktop_host_role():
    url = host_probe.build_backend_url("ws://127.0.0.1:8000/ws", "vibe-safe")

    assert url == "ws://127.0.0.1:8000/ws?token=vibe-safe&role=desktop-host"
