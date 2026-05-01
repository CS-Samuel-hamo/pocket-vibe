import os

def rename_and_replace(start_dir):
    ignores = {'.git', 'node_modules', 'dist', '.venv', '__pycache__', '.pytest_cache', '.antigravity', '.aider.tags.cache.v4'}
    ext_ignores = {'.png', '.jpg', '.jpeg', '.sqlite3', '.db', '.pyc', '.ico'}

    # 1. Replace content
    updates = 0
    for root, dirs, files in os.walk(start_dir):
        dirs[:] = [d for d in dirs if d not in ignores]
        for f in files:
            ext = os.path.splitext(f)[1]
            if ext in ext_ignores:
                continue
            file_path = os.path.join(root, f)
            try:
                with open(file_path, 'r', encoding='utf-8') as file:
                    content = file.read()

                new_content = content.replace("OpenVibe", "OpenVibe")
                new_content = new_content.replace("openvibe", "openvibe")
                new_content = new_content.replace("OpenVibe", "OpenVibe")
                new_content = new_content.replace("OpenVibe", "OpenVibe")
                new_content = new_content.replace("openvibe", "openvibe")

                if new_content != content:
                    with open(file_path, 'w', encoding='utf-8') as file:
                        file.write(new_content)
                    updates += 1
            except Exception as e:
                pass
    print(f"Updated {updates} files with text replacement.")

    # 2. Rename files
    renames = 0
    for root, dirs, files in os.walk(start_dir):
        dirs[:] = [d for d in dirs if d not in ignores]
        for f in files:
            lower_name = f.lower()
            if "pocket" in lower_name and "vibe" in lower_name:
                new_name = f.replace("OpenVibe", "OpenVibe").replace("openvibe", "openvibe").replace("openvibe", "openvibe")

                if new_name != f:
                    old_path = os.path.join(root, f)
                    new_path = os.path.join(root, new_name)
                    os.rename(old_path, new_path)
                    renames += 1
                    print(f"Renamed: {f} -> {new_name}")
    print(f"Renamed {renames} files.")

if __name__ == '__main__':
    rename_and_replace('.')
