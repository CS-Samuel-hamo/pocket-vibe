# Pocket Vibe v0.1.0-mobile-codex-mvp

First public open-source baseline for the reference mobile control path.

## Highlights

- Windows-first local stack via `.\start.ps1`
- Backend-hosted PWA so the phone only needs one backend URL
- VS Code bridge auto-discovery via `.pocket-vibe/desktop-connection.json`
- `codex-cli` as the reference full runtime
- Mobile product home, project inbox, read-only files, Vibe Skills, diagnostics
- Relay core MVP with pairing, replay cursor, retention cap, and error codes
- Cross-platform E2EE (Python + Web Crypto)
- 33 Python test files and frontend capability tests

## Quick start

```powershell
pip install -r backend/requirements.txt
cd frontend; npm install; cd ..
cd vscode-bridge; npm install; cd ..
.\start.ps1
```

See [QUICKSTART.md](QUICKSTART.md) and [docs/windows_first_startup.md](docs/windows_first_startup.md).

## Scope

This release is a **reference implementation**, not a finished commercial product. There is no hosted relay, installer, or app-store distribution yet.

See [docs/product_completion_status.md](docs/product_completion_status.md) for milestone tracking.
