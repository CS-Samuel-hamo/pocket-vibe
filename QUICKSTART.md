# Pocket Vibe Quickstart

## 1. Start the local services

From the repo root:

```powershell
./start.ps1
```

This starts:

- the frontend dev server on port `5173`
- the FastAPI backend on port `8000`

The backend prints:

- the active pairing token
- the direct mobile URL
- a desktop pairing page URL

The backend also tries to open the desktop pairing page automatically.
Do not scan the terminal `#` matrix preview. Use the browser-rendered QR from the pairing page instead.

## Remote / VPN mode

If the phone and desktop are not on the same LAN, or one side uses a VPN, set these in `.env` before starting:

```env
PUBLIC_FRONTEND_URL=https://your-frontend.example.com
PUBLIC_API_BASE_URL=https://your-backend.example.com
PUBLIC_BACKEND_WS_URL=wss://your-backend.example.com/ws
```

Then restart `./start.ps1`. The pairing page and mobile link will use those explicit addresses instead of `192.168.x.x`.

To generate that `.env` snippet instead of composing it by hand, use:

```powershell
.\scripts\prepare_remote_access.ps1 -Provider tailscale -AccessHost 100.88.12.34 -Token vibe-safe
```

or:

```powershell
.\scripts\prepare_remote_access.ps1 `
  -Provider cloudflare `
  -FrontendUrl https://pocket-vibe-ui.example.com `
  -ApiBaseUrl https://pocket-vibe-api.example.com `
  -Token vibe-safe
```

For the supported remote access paths and failure checklist, see [docs/remote_access_guide.md](/D:/AI_projects/Pocket_Vibe/docs/remote_access_guide.md).

## 2. Configure the VS Code bridge

Open the `vscode-bridge/` project in VS Code, build or run the extension, then set:

- `pocketVibe.backendWsUrl`
  Example: `ws://127.0.0.1:8000/ws`
- `pocketVibe.authToken`
  Use the same token printed by the backend

The bridge auto-detects these runtimes from open terminals:

- `codex-cli`
- `claude-code`
- `opencode`
- `antigravity`

If those are not running, the bridge falls back to supported VS Code agent extensions when available.

## 3. Connect from the phone

- Scan the QR code from the backend terminal
- Or open the printed URL in the mobile browser
- Or use the mobile `Link` button and enter the token / backend WS / API base manually
- Keep the phone and host on the same network

The PWA will connect to the backend, bootstrap the session, then show:

- console output
- workspace search
- audit/approval events
- vibe modes

## 4. Verify the stack

Run these from the repo root:

```powershell
pytest tests -q
```

```powershell
cd frontend
npm run build
```

```powershell
cd ..\vscode-bridge
npm run compile
```

## 5. Expected flow

1. Open a supported runtime terminal in VS Code.
2. Connect the VS Code bridge to the backend token.
3. Send a prompt from the phone.
4. The bridge chooses the active runtime and dispatches the prompt.
5. Use workspace search, focus, explain/rewrite commands, approvals, and the kill switch from the phone.

## 6. v1 acceptance path

For v1, validate the reference path before testing other runtimes or hosts:

```text
phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli terminal
```

The five-minute acceptance demo is defined in [docs/v1_done_definition.md](/D:/AI_projects/Pocket_Vibe/docs/v1_done_definition.md). If this path is not stable, do not expand native host adapters, dashboards, or extra runtime features.
