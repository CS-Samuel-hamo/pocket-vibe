# Pocket Vibe v1 Done Definition

Updated: 2026-05-01

## Product Boundary

Pocket Vibe v1 is a phone-first remote control layer for AI coding sessions running on a desktop PC.

v1 is not a mobile IDE, a cloud relay, or a general host platform. The reference path is:

`phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli terminal`

Other runtimes and host families may be visible as degraded or unsupported, but they do not block v1 completion.

## Target User

A developer who is away from the keyboard but still wants to observe, prompt, approve, interrupt, and inspect a desktop AI coding session from a phone.

## Five Minute Demo

The demo is successful only if a fresh reviewer can complete this flow in five minutes after dependencies are installed:

1. Start Pocket Vibe from the repo root.
2. Open the pairing page and connect the phone by QR or direct URL.
3. Confirm the phone shows `Host ready`, active project `Pocket_Vibe`, and runtime `Codex CLI` or a clear degraded reason.
4. Send a prompt from the phone and see the assistant reply in the console.
5. Open `Search Files`, find a known project file, and read it on the phone.
6. Open `Vibe Skills`, send `Project Brief`, and receive a useful response or a clear runtime failure.
7. Press `Kill` only if runtime capability is available; otherwise the button must be disabled with a reason.

## v1 Supported Scope

- LAN phone-to-desktop pairing through the generated mobile link.
- Manual connection profile for VPN or tunnel addresses.
- Connection preflight for API reachability, token mismatch, token expiry, bridge status, project count, and active runtime.
- VS Code bridge as the reference desktop host.
- `codex-cli` as the reference runtime.
- Capability-driven UI states for prompt, approval, script execution, and kill.
- Project registry and project-aware prompt/search/script routing.
- Chat-first mobile surface with secondary controls in the `+` tools sheet.
- Vibe Skills as reusable prompt templates, not new protocol actions.

## Explicitly Out Of Scope For v1

- Native adapters for Codex App, Claude Desktop, JetBrains IDEs, or other AI IDEs.
- Cloud-hosted relay service.
- Full mobile file editing.
- Full autonomous approval of high-risk actions.
- Complete parity across `claude-code`, `opencode`, `antigravity`, Continue, Cline, Roo Code, or Copilot.
- A general workflow/dashboard platform.

## Completion Gate

v1 can be called complete when all items below are true:

- `pytest tests -q` passes.
- `cd frontend && npm run test:capabilities` passes.
- `cd frontend && npm run build` passes.
- `cd vscode-bridge && npm run compile` passes.
- The five minute demo passes on a real phone.
- `docs/runtime_联调结果.md` records the observed `codex-cli` result.
- README and QUICKSTART describe the exact same startup path.
- Git status has no accidental runtime artifacts, logs, local databases, screenshots, VS Code user data, or generated scratch files staged for release.

## Stop Rule

After the completion gate passes, do not add host families, runtime features, dashboards, or workflow automation until a `v0.1.0-mobile-codex-mvp` tag or equivalent baseline commit exists.

The only allowed post-gate changes before the tag are:

- documentation corrections;
- test fixes for the v1 demo path;
- blocker fixes for pairing, prompt dispatch, file search, Vibe Skills, capability display, or Kill state.

## Next Single Action

Create a clean Git baseline for v1:

1. Expand `.gitignore` so runtime artifacts stay out of source control.
2. Review the remaining untracked files by category.
3. Stage only source, tests, docs, scripts, and steward planning files needed for v1.
4. Run the completion gate.
5. Commit as `chore: establish pocket vibe v1 baseline`.
