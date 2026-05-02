# Pocket Vibe Backend

FastAPI backend for the v1 reference path:

`phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli`

The backend is responsible for:

- pairing page and mobile link generation;
- WebSocket session routing;
- token validation and connection preflight;
- message replay, audit events, and project registry state;
- forwarding protocol messages between the phone and desktop host.

## Start

Use the repo-level launcher for normal development:

```powershell
.\start.ps1
```

Direct backend startup from the repo root:

```powershell
$env:PYTHONPATH="."
python backend\main.py
```

## Configuration

Common environment variables:

- `POCKET_VIBE_TOKEN`: pairing/auth token.
- `PORT`: backend port, default `8000`.
- `TARGET_DIR`: workspace root exposed to the phone.
- `PUBLIC_FRONTEND_URL`: externally reachable frontend URL for VPN/tunnel mode.
- `PUBLIC_API_BASE_URL`: externally reachable backend API base URL.
- `PUBLIC_BACKEND_WS_URL`: externally reachable backend WebSocket URL.

## Verify

From the repo root:

```powershell
python -m pytest tests -q
```

For the full v1 desktop gate:

```powershell
.\scripts\v1_desktop_gate.ps1
```
