"""Tests for the repository quality gate helper."""

import importlib.util
from pathlib import Path


def load_quality_gate():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "quality_gate.py"
    spec = importlib.util.spec_from_file_location("quality_gate", script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_quality_gate_accepts_utf8_bom_python(tmp_path):
    quality_gate = load_quality_gate()
    target = tmp_path / "bom.py"
    target.write_text("\ufeffdef ok():\n    return True\n", encoding="utf-8")

    assert quality_gate.check_python(str(target)) == []


def test_quality_gate_reports_long_function(tmp_path):
    quality_gate = load_quality_gate()
    target = tmp_path / "long_function.py"
    target.write_text("def bad():\n" + ("    x = 1\n" * 31), encoding="utf-8")

    errors = quality_gate.check_python(str(target))

    assert any("too long" in error.message for error in errors)


def test_quality_gate_suppresses_existing_baseline_violation():
    quality_gate = load_quality_gate()
    violation = quality_gate.Violation("legacy.py|file-lines", "legacy too long", 900)
    baseline = {"legacy.py|file-lines": 900}

    assert quality_gate.filter_new_violations([violation], baseline) == []


def test_quality_gate_reports_worse_baseline_violation():
    quality_gate = load_quality_gate()
    violation = quality_gate.Violation("legacy.py|file-lines", "legacy too long", 901)
    baseline = {"legacy.py|file-lines": 900}

    assert quality_gate.filter_new_violations([violation], baseline) == [violation]
