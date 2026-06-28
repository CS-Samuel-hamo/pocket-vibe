# Pocket Vibe Windows-First Startup Runbook

Updated: 2026-05-09

This is the current product path for a new independent developer on Windows.

The supported reference path is:

```text
phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli terminal
```

The relay exists as a default-off MVP API for the next product milestone. It is not yet a deployed public service.

## 1. Check The Desktop

Run this from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\check_windows_prereqs.ps1 -SkipFrontendPort
```

Expected result:

- `Python`, `Node.js`, `npm`, frontend dependencies, bridge dependencies, backend port, VS Code CLI, and Codex CLI are reported.
- Required failures stop startup and include an action.
- Optional warnings do not block startup, but they explain what will be degraded.

Common fixes:

| Failure | Action |
| --- | --- |
| Python missing | Install Python 3.11+ and reopen PowerShell. |
| Node/npm missing | Install Node.js LTS and reopen PowerShell. |
| `frontend\node_modules` missing | Run `npm --prefix frontend install`. |
| `vscode-bridge\node_modules` missing | Run `npm --prefix vscode-bridge install`. |
| Backend port busy | Close the existing process or start with `.\start.ps1 -BackendPort <free-port>`. |
| Codex CLI missing | Install the Codex/OpenAI extension bundle or set `POCKET_VIBE_CODEX_PATH`. |

## 2. Start The Product Stack

Run:

```powershell
.\start.ps1
```

Default startup is product mode:

- the frontend is built once;
- the backend serves the PWA under `/app/`;
- only backend port `8000` is required;
- `.pocket-vibe/desktop-connection.json` is generated for the VS Code bridge;
- the terminal prints a pairing page URL and a direct mobile URL.

For frontend development only, use:

```powershell
.\start.ps1 -Dev
```

Dev mode keeps Vite on port `5173`.

## 3. Connect VS Code Bridge

Open this repository in VS Code and run or install the `vscode-bridge` extension.

In product mode, the bridge can read the generated local profile automatically when these VS Code settings are empty:

- `pocketVibe.backendWsUrl`
- `pocketVibe.authToken`

Use `codex-cli` as the preferred runtime for the reference path:

```text
pocketVibe.preferredRuntime = codex-cli
```

If another runtime is active, it can be shown as degraded or unsupported. That is acceptable as long as the UI explains the reason.

## 4. Connect The Phone

Use one of these methods:

- Scan the browser-rendered QR code from the desktop pairing page.
- Type the printed mobile URL into the phone browser.
- Use the mobile `Link` screen and enter the token, backend WebSocket URL, and API URL manually.

Do not scan terminal ASCII QR previews. They are only diagnostic text.

For same-LAN use, the printed LAN URL is the expected path.

For VPN or non-LAN use, configure the public or VPN addresses before startup:

```powershell
.\scripts\prepare_remote_access.ps1 -Provider tailscale -AccessHost 100.88.12.34 -Token <token> -WriteEnv
```

Then merge or copy the generated profile into `.env` and restart `.\start.ps1`.

## 5. Run The Five-Minute Smoke

On the phone:

1. Confirm the home screen shows host online and `Codex CLI ready`.
2. Send: `reply with exactly: POCKET_VIBE_V1_OK`.
3. Confirm the assistant reply contains `POCKET_VIBE_V1_OK`.
4. Open file search and preview `README.md`.
5. Open Vibe Skills and send `Project Brief`.
6. Confirm Kill is either available and returns a result, or disabled with a clear reason.
7. Export or copy diagnostics if any step fails.

The longer acceptance script remains `docs/v1_acceptance_script.md`.

## 6. Failure Triage

Use this order:

1. Desktop prereq check.
2. `.\scripts\v1_desktop_gate.ps1`.
3. Backend pairing page and mobile URL.
4. VS Code bridge connection state.
5. Active runtime and capability state.
6. Phone diagnostics bundle.

Stop adding features if the reference path fails. Fix the failing layer first.

## 7. Current Product Boundary

Completed enough for local product validation:

- backend-hosted PWA;
- VS Code bridge profile auto-discovery;
- codex-cli reference runtime path;
- project inbox and simplified mobile home;
- read-only file search and preview;
- Vibe Skills as product actions;
- diagnostics and recovery error codes;
- default-off relay core and HTTP API tests;
- Windows prereq check.

Not completed yet:

- deployed public relay;
- production account system;
- DNS, TLS, cloud hosting, payment, or app-store distribution;
- native iOS/Android app;
- enterprise/team features;
- guaranteed full support for non-codex runtimes.
