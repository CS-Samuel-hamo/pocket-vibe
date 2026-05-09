# Pocket Vibe

Pocket Vibe is a mobile control layer for vibe-coding workflows.

The v1 architecture is:

- Phone: React PWA for remote control, audit, approvals, workspace search, and voice modes.
- Host: VS Code plus the `vscode-bridge` extension as the desktop control plane.
- Backend: FastAPI websocket router for pairing, replay, audit events, capabilities, and encrypted mobile transport.
- Runtimes: `codex-cli`, `claude-code`, `opencode`, and `antigravity` through the VS Code host, with extension fallbacks for Continue, Cline, Roo Code, and Copilot.

## What v1 supports

- Phone-to-host prompt dispatch
- Runtime discovery and capability reporting
- Workspace focus and context fetch
- Script dispatch from discovered `package.json` and `Makefile` commands
- Approval request/response plumbing
- Kill switch requests
- Session replay with `seq_id`
- Payload-level E2EE for mobile browser sessions when the browser supports secure Web Crypto

## v1 completion boundary

The v1 release target is the reference path:

`phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli terminal`

Other runtimes and host families can be reported as degraded or unsupported, but they do not block the v1 release. See [v1_done_definition.md](/D:/AI_projects/Pocket_Vibe/docs/v1_done_definition.md) for the exact demo, completion gate, and stop rule.

## Repo layout

- `backend/`: FastAPI backend entrypoint
- `src/`: shared Python domain/runtime code
- `frontend/`: React PWA
- `vscode-bridge/`: VS Code extension
- `.steward/`: project-management and review routing rules

## Quick start

1. Install Python 3.11+ and Node.js 18+.
2. Copy `.env.example` to `.env` if you want persistent configuration.
3. Run `./start.ps1` from the repo root on Windows.
   By default this builds the mobile PWA and serves it from the backend under `/app/`, so the phone link uses one desktop service instead of separate frontend and backend ports.
   For frontend development, run `./start.ps1 -Dev` to keep the Vite dev server on port `5173`.
4. Install or run the VS Code bridge from `vscode-bridge/`.
   In product mode, the backend writes `.pocket-vibe/desktop-connection.json` and the bridge can read the backend URL and token automatically when VS Code settings are empty.
   Manual settings remain available as fallback:
   - `pocketVibe.backendWsUrl`
   - `pocketVibe.authToken`
5. Open the printed pairing page URL on the desktop, or let Pocket Vibe open it automatically, then scan that browser QR with your phone.
   If the phone is not on the same LAN, configure `PUBLIC_FRONTEND_URL`, `PUBLIC_API_BASE_URL`, and `PUBLIC_BACKEND_WS_URL` so the generated mobile link uses reachable public or VPN addresses.
   You can generate the exact `.env` snippet with `.\scripts\prepare_remote_access.ps1`.

See [QUICKSTART.md](/D:/AI_projects/Pocket_Vibe/QUICKSTART.md) for the exact local workflow, [remote_access_guide.md](/D:/AI_projects/Pocket_Vibe/docs/remote_access_guide.md) for supported cross-network setups, [v1_release_manifest.md](/D:/AI_projects/Pocket_Vibe/docs/v1_release_manifest.md) for what belongs in the v1 baseline commit, and [git_baseline_plan.md](/D:/AI_projects/Pocket_Vibe/docs/git_baseline_plan.md) for the current worktree cleanup decision.
For a Windows-first product startup path, use [windows_first_startup.md](/D:/AI_projects/Pocket_Vibe/docs/windows_first_startup.md).

## Verification

- Windows prereq check: `.\scripts\check_windows_prereqs.ps1 -SkipFrontendPort`
- v1 desktop gate: `.\scripts\v1_desktop_gate.ps1`
- Backend tests: `pytest tests -q`
- Frontend capability tests: `cd frontend && npm run test:capabilities`
- Frontend build: `cd frontend && npm run build`
- Product-mode PWA build: `cd frontend && $env:VITE_PWA_BASE='/app/'; npm run build`
- Bridge compile: `cd vscode-bridge && npm run compile`

The real-phone v1 acceptance runbook is [v1_acceptance_script.md](/D:/AI_projects/Pocket_Vibe/docs/v1_acceptance_script.md).
