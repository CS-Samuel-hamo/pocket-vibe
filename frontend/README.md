# Pocket Vibe Frontend

React PWA for the phone control surface.

The v1 frontend is chat-first and runtime-agnostic. It connects to the FastAPI backend, reads capability state, and exposes:

- prompt dispatch;
- project inbox and workspace search;
- file reader/context view;
- Vibe Skills prompt templates;
- approval and Kill state based on runtime capabilities;
- manual connection profile for LAN, VPN, or tunnel mode.

## Start

Use the repo-level launcher for normal development:

```powershell
.\start.ps1
```

Direct frontend startup:

```powershell
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

## Verify

```powershell
cd frontend
npm run test:capabilities
npm run build
```

For the full v1 desktop gate:

```powershell
cd ..
.\scripts\v1_desktop_gate.ps1
```

## Connection Notes

Use the backend pairing page QR for normal LAN pairing.

For cross-network setups, configure:

- `PUBLIC_FRONTEND_URL`
- `PUBLIC_API_BASE_URL`
- `PUBLIC_BACKEND_WS_URL`

See `docs/remote_access_guide.md` and `docs/v1_acceptance_script.md`.
