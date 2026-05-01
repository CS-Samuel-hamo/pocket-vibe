import sys
import os
import ast
import re

MAX_FILE_LINES = 800
MAX_FUNC_LINES = 30
MAX_NESTING = 3
MAX_BRANCHES = 3

def check_python(file_path):
    errors = []
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')

    if len(lines) > MAX_FILE_LINES:
        errors.append(f"{file_path}: File too long ({len(lines)} lines > {MAX_FILE_LINES})")

    try:
        tree = ast.parse(content)
    except SyntaxError as e:
        errors.append(f"{file_path}: Syntax error: {e}")
        return errors

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Func length
            length = node.end_lineno - node.lineno
            if length > MAX_FUNC_LINES:
                errors.append(f"{file_path}:{node.lineno}: Function '{node.name}' too long ({length} lines > {MAX_FUNC_LINES})")

            # Branches count
            branches = 0
            for child in ast.walk(node):
                if isinstance(child, (ast.IfExp, ast.If, ast.For, ast.While, ast.Try, ast.Match)):
                    branches += 1
            if branches > MAX_BRANCHES:
                errors.append(f"{file_path}:{node.lineno}: Function '{node.name}' has too many branches ({branches} > {MAX_BRANCHES})")

            # Nesting calculation
            def get_nesting_depth(current_node, current_depth=0):
                max_depth = current_depth
                for child in ast.iter_child_nodes(current_node):
                    if isinstance(child, (ast.If, ast.For, ast.While, ast.Try, ast.With, ast.Match)):
                        depth = get_nesting_depth(child, current_depth + 1)
                        if depth > max_depth: max_depth = depth
                    else:
                        depth = get_nesting_depth(child, current_depth)
                        if depth > max_depth: max_depth = depth
                return max_depth

            nesting = get_nesting_depth(node)
            if nesting > MAX_NESTING:
                errors.append(f"{file_path}:{node.lineno}: Function '{node.name}' has too deep nesting ({nesting} > {MAX_NESTING})")

    return errors

def check_js_jsx(file_path):
    errors = []
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if len(lines) > MAX_FILE_LINES:
        errors.append(f"{file_path}: File too long ({len(lines)} lines > {MAX_FILE_LINES})")

    # Native UI component ban ("零逃逸")
    # Using strict rules to catch <button>, <input>, <textarea>, <select>, <table>.
    native_tags = re.compile(r'<\s*(button|input|select|table|textarea)\b[^>]*>')

    nesting = 0
    nesting_error_logged = False

    for i, line in enumerate(lines):
        line_num = i + 1
        # UI component check
        if native_tags.search(line):
            errors.append(f"{file_path}:{line_num}: Native UI elements forbidden. Use antd-mobile / ArcoDesign components.")

        # Very rough nesting heuristic for JS
        nesting += line.count('{') - line.count('}')
        if nesting < 0: nesting = 0
        if nesting > MAX_NESTING and not nesting_error_logged:
            errors.append(f"{file_path}:{line_num}: JS/JSX block nesting deeper than {MAX_NESTING}")
            nesting_error_logged = True

    return errors

def main():
    if len(sys.argv) < 2:
        print("Usage: python quality_gate.py <file1> <file2> ...")
        sys.exit(0)

    files = sys.argv[1:]
    all_errors = []

    for file_path in files:
        if not os.path.exists(file_path): continue
        if file_path.endswith('.py'):
            all_errors.extend(check_python(file_path))
        elif file_path.endswith('.js') or file_path.endswith('.jsx') or file_path.endswith('.ts') or file_path.endswith('.tsx'):
            all_errors.extend(check_js_jsx(file_path))

    if all_errors:
        print("\n================ QUALITY GATE FAILED =================\n")
        print("\n".join(all_errors))
        print(f"\n[Error] {len(all_errors)} strict engineering violations found. Please refactor.")
        sys.exit(1)

    print("[Quality Gate] Passed.")
    sys.exit(0)

if __name__ == '__main__':
    main()
