# Pocket Vibe Quickstart

## 1. Start the local product stack

From the repo root:

```powershell
./start.ps1
```

Default startup is product mode. It:

- builds the mobile PWA with base path `/app/`;
- serves the built PWA from the FastAPI backend;
- starts the backend on port `8000`;
- opens or prints the desktop pairing page.

The backend prints:

- the active pairing token;
- the direct mobile URL;
- the desktop pairing page URL;
- the backend WebSocket and API URLs.

Do not scan terminal `#` matrix previews. Use the browser-rendered QR from the pairing page, or type the printed mobile URL on the phone.

For frontend development, use:

```powershell
./start.ps1 -Dev
```

Developer mode keeps the Vite dev server on port `5173` and points the phone link there.

## 2. Remote / VPN mode

If the phone and desktop are not on the same LAN, or one side uses a VPN, set these in `.env` before starting:

```env
PUBLIC_FRONTEND_URL=https://your-frontend.example.com
PUBLIC_API_BASE_URL=https://your-backend.example.com
PUBLIC_BACKEND_WS_URL=wss://your-backend.example.com/ws
```

Then restart `./start.ps1`. The pairing page and mobile link will use those explicit addresses instead of LAN auto-discovery.

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

## 3. Configure the VS Code bridge

Open the `vscode-bridge/` project in VS Code, then build or run the extension.

In product mode, the backend writes `.pocket-vibe/desktop-connection.json` in the repo root. The bridge reads that ignored local profile automatically when VS Code settings are empty.

Manual settings remain available as fallback:

- `pocketVibe.backendWsUrl`
  Example: `ws://127.0.0.1:8000/ws`
- `pocketVibe.authToken`
  Use the same token printed by the backend.
- `pocketVibe.preferredRuntime`
  Use `codex-cli` for the v1 reference path.

The bridge auto-detects these runtimes from open terminals:

- `codex-cli`
- `claude-code`
- `opencode`
- `antigravity`

If those are not running, the bridge reports explicit degraded or unsupported states instead of silently pretending full support.

## 4. Connect from the phone

- Scan the browser QR from the desktop pairing page.
- Or open the printed mobile URL in the mobile browser.
- Or use the mobile `Link` button and enter the token / backend WS / API base manually.

The PWA will connect to the backend, bootstrap the session, then show:

- current project and runtime state;
- latest assistant reply;
- prompt input;
- file search;
- Vibe Skills;
- approval and Kill state when supported.

## 5. Verify the stack

For the full desktop-side v1 gate, run:

```powershell
.\scripts\v1_desktop_gate.ps1
```

This does not replace the real-phone smoke. It only verifies the automated desktop checks.

Targeted checks:

```powershell
pytest tests -q
```

```powershell
cd frontend
npm run test:capabilities
npm run build
```

```powershell
cd ..\vscode-bridge
npm run compile
```

## 6. v1 acceptance path

For v1, validate the reference path before testing other runtimes or hosts:

```text
phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli terminal
```

The five-minute acceptance demo is defined in [docs/v1_acceptance_script.md](/D:/AI_projects/Pocket_Vibe/docs/v1_acceptance_script.md) and governed by [docs/v1_done_definition.md](/D:/AI_projects/Pocket_Vibe/docs/v1_done_definition.md).

If this path is not stable, do not expand native host adapters, dashboards, or extra runtime features.
