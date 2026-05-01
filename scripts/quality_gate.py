import ast
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

MAX_FILE_LINES = 800
MAX_FUNC_LINES = 30
MAX_NESTING = 3
MAX_BRANCHES = 3

PYTHON_EXTS = {".py"}
JS_EXTS = {".js", ".jsx", ".ts", ".tsx"}
BRANCH_NODES = (ast.IfExp, ast.If, ast.For, ast.While, ast.Try, ast.Match)
NESTING_NODES = (ast.If, ast.For, ast.While, ast.Try, ast.With, ast.Match)
FUNCTION_NODES = (ast.FunctionDef, ast.AsyncFunctionDef)
NATIVE_TAGS = re.compile(r"<\s*(button|input|select|table|textarea)\b[^>]*>")


@dataclass(frozen=True)
class Violation:
    key: str
    message: str
    value: int = 1


def repo_root():
    return Path(__file__).resolve().parents[1]


def default_baseline_path():
    return repo_root() / ".steward" / "quality_gate_baseline.json"


def read_source(file_path):
    return Path(file_path).read_text(encoding="utf-8-sig")


def line_count(content):
    return len(content.splitlines())


def file_length_errors(file_path, total_lines):
    if total_lines <= MAX_FILE_LINES:
        return []
    message = f"{file_path}: File too long ({total_lines} lines > {MAX_FILE_LINES})"
    return [Violation(f"{file_path}|file-lines", message, total_lines)]


def function_length(node):
    return node.end_lineno - node.lineno


def branch_count(node):
    return sum(1 for child in ast.walk(node) if isinstance(child, BRANCH_NODES))


def child_nesting_depth(node, current_depth):
    next_depth = current_depth + int(isinstance(node, NESTING_NODES))
    return get_nesting_depth(node, next_depth)


def get_nesting_depth(node, current_depth=0):
    depths = [child_nesting_depth(child, current_depth) for child in ast.iter_child_nodes(node)]
    return max([current_depth, *depths])


def function_key(file_path, node, kind):
    return f"{file_path}|function-{kind}|{node.name}"


def function_violation(file_path, node, kind, value, limit):
    message = f"{file_path}:{node.lineno}: Function '{node.name}' {kind} ({value} > {limit})"
    return Violation(function_key(file_path, node, kind), message, value)


def function_errors(file_path, node):
    errors = []
    length = function_length(node)
    branches = branch_count(node)
    nesting = get_nesting_depth(node)
    if length > MAX_FUNC_LINES:
        errors.append(function_violation(file_path, node, "too long", length, MAX_FUNC_LINES))
    if branches > MAX_BRANCHES:
        errors.append(function_violation(file_path, node, "has too many branches", branches, MAX_BRANCHES))
    if nesting > MAX_NESTING:
        errors.append(function_violation(file_path, node, "has too deep nesting", nesting, MAX_NESTING))
    return errors


def parse_python(file_path, content):
    try:
        return ast.parse(content), []
    except SyntaxError as exc:
        return None, [Violation(f"{file_path}|syntax-error", f"{file_path}: Syntax error: {exc}")]


def function_nodes(tree):
    if tree is None:
        return []
    return [node for node in ast.walk(tree) if isinstance(node, FUNCTION_NODES)]


def check_python(file_path):
    content = read_source(file_path)
    errors = file_length_errors(file_path, line_count(content))
    tree, parse_errors = parse_python(file_path, content)
    errors.extend(parse_errors)
    for node in function_nodes(tree):
        errors.extend(function_errors(file_path, node))
    return errors


def native_tag_errors(file_path, lines):
    return [
        Violation(f"{file_path}|native-ui|{line_number}", native_tag_message(file_path, line_number))
        for line_number, line in enumerate(lines, 1)
        if NATIVE_TAGS.search(line)
    ]


def native_tag_message(file_path, line_number):
    return f"{file_path}:{line_number}: Native UI elements forbidden. Use antd-mobile / ArcoDesign components."


def js_nesting_error(file_path, lines):
    nesting = 0
    for line_number, line in enumerate(lines, 1):
        nesting = max(0, nesting + line.count("{") - line.count("}"))
        if nesting > MAX_NESTING:
            message = f"{file_path}:{line_number}: JS/JSX block nesting deeper than {MAX_NESTING}"
            return Violation(f"{file_path}|js-nesting", message, nesting)
    return None


def check_js_jsx(file_path):
    lines = read_source(file_path).splitlines()
    errors = file_length_errors(file_path, len(lines))
    errors.extend(native_tag_errors(file_path, lines))
    nesting_error = js_nesting_error(file_path, lines)
    if nesting_error:
        errors.append(nesting_error)
    return errors


def check_file(file_path):
    path = Path(file_path)
    normalized_path = path.as_posix()
    suffix = path.suffix
    if not path.exists():
        return []
    if suffix in PYTHON_EXTS:
        return check_python(normalized_path)
    if suffix in JS_EXTS:
        return check_js_jsx(normalized_path)
    return []


def check_files(files):
    errors = []
    for file_path in files:
        errors.extend(check_file(file_path))
    return errors


def read_baseline(path=None):
    baseline_path = Path(path) if path else default_baseline_path()
    if not baseline_path.exists():
        return {}
    raw = json.loads(baseline_path.read_text(encoding="utf-8"))
    return {item["key"]: item["value"] for item in raw.get("violations", [])}


def is_new_or_worse(violation, baseline):
    return violation.value > baseline.get(violation.key, 0)


def filter_new_violations(violations, baseline):
    return [violation for violation in violations if is_new_or_worse(violation, baseline)]


def print_result(errors):
    if not errors:
        print("[Quality Gate] Passed.")
        return 0
    print("\n================ QUALITY GATE FAILED =================\n")
    print("\n".join(error.message for error in errors))
    print(f"\n[Error] {len(errors)} strict engineering violations found. Please refactor.")
    return 1


def main():
    files = sys.argv[1:]
    if not files:
        print("Usage: python quality_gate.py <file1> <file2> ...")
        return 0
    errors = filter_new_violations(check_files(files), read_baseline())
    return print_result(errors)


if __name__ == "__main__":
    sys.exit(main())
