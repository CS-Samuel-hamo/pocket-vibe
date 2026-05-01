"""CLI launcher for OpenVibe."""

import os
import sys
import uuid
import socket
import qrcode
import subprocess
import time
import argparse
from typing import Optional


def get_ip_address() -> str:
    """Get the local IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip_address: str = s.getsockname()[0]
        s.close()
        return ip_address
    except Exception:
        return "127.0.0.1"


def print_separator() -> None:
    """Print a separator line."""
    print("-" * 50)


def main() -> None:
    """Main entry point for the launcher."""
    parser = argparse.ArgumentParser(description="OpenVibe Link Launcher")
    parser.add_argument("--target-dir", default=".", help="Directory for Aider to act upon")
    parser.add_argument("--port", default=8000, type=int, help="Backend Port")
    parser.add_argument("--frontend-port", default=5173, type=int, help="Frontend Port (for QR link)")
    args = parser.parse_args()

    target_dir: str = os.path.abspath(args.target_dir)

    # 1. Disclaimer
    print_separator()
    print("\033[91mWARNING: You are about to launch a REMOTE CODE EXECUTION tool.\033[0m")
    print("\033[93mAnyone with access to the QR Code/Link can execute code on your machine.\033[0m")
    print("Use ONLY on trusted private networks.")
    print_separator()
    input("Press ENTER to acknowledge and continue...")

    # 2. Generate Security Token
    token: str = str(uuid.uuid4())[:8]  # Short token for Vibe ease, usage UUID4 normally

    # 3. Network Info
    ip_address: str = get_ip_address()
    backend_url: str = f"ws://{ip_address}:{args.port}/ws?token={token}"
    frontend_url: str = f"http://{ip_address}:{args.frontend_port}/?token={token}&ws_port={args.port}"

    # 4. Generate QR
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(frontend_url)
    qr.make(fit=True)

    print_separator()
    print("Scan this QR code with your mobile:")
    qr.print_ascii(invert=True)
    print_separator()
    print(f"Token: \033[92m{token}\033[0m")
    print(f"Direct Link: {frontend_url}")
    print(f"Target Directory: {target_dir}")
    print_separator()

    # 5. Launch Backend
    env = os.environ.copy()
    env["POCKET_VIBE_TOKEN"] = token
    env["TARGET_DIR"] = target_dir
    env["PORT"] = str(args.port)
    env["PYTHONPATH"] = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))  # Set to project root

    print("Starting Backend Server...")
    try:
        # Run from project root
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        cmd: list[str] = [sys.executable, "-m", "src.interfaces.api.main"]

        # We start it as a child process and wait
        subprocess.run(cmd, env=env, check=True, timeout=300, cwd=project_root)
    except KeyboardInterrupt:
        print("\nShutting down OpenVibe...")


if __name__ == "__main__":
    main()
