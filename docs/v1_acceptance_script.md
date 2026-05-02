# Pocket Vibe v1 Acceptance Script

Updated: 2026-05-02

This is the single v1 acceptance path. It validates the reference route:

`phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli`

Do not use this script to validate extra runtimes, native desktop apps, dashboards, or new host families.

## 1. Desktop Automated Gate

Run from the repo root:

```powershell
.\scripts\v1_desktop_gate.ps1
```

The script must pass:

- Backend tests: `python -m pytest tests -q`
- Frontend capability tests: `npm run test:capabilities`
- Frontend production build: `npm run build`
- VS Code bridge runtime tests: `npm run test:runtime`
- Repository quality gate: `python scripts\quality_gate.py <tracked code files>`

If a dependency is already known to be unavailable on the current machine, use the skip flags only for local triage, not for release acceptance:

```powershell
.\scripts\v1_desktop_gate.ps1 -SkipFrontendBuild
```

## 2. Start The Reference Stack

From the repo root:

```powershell
.\start.ps1
```

Expected desktop evidence:

- Frontend starts on `0.0.0.0:5173`.
- Backend starts on port `8000`.
- Backend prints the token, mobile URL, and pairing page URL.
- The desktop pairing page opens or can be opened manually.

Do not scan terminal ASCII QR output. Use the browser pairing page QR or the direct mobile URL.

## 3. Connect The VS Code Bridge

In VS Code:

1. Open this workspace.
2. Start the Pocket Vibe bridge extension.
3. Set `pocketVibe.backendWsUrl` to `ws://127.0.0.1:8000/ws`.
4. Set `pocketVibe.authToken` to the token printed by the backend.
5. Ensure `pocketVibe.preferredRuntime` is `codex-cli`.
6. Open or attach a `codex-cli` runtime.

Expected evidence:

- Phone home screen shows `Host ready`.
- Active project is `Pocket_Vibe`.
- Active runtime is `Codex CLI`.
- If runtime is degraded, the UI shows a reason. Silent failure is not acceptable.

## 4. Phone Demo Steps

Run these steps on a real phone:

1. Open the mobile URL or scan the browser QR.
2. Send this prompt from the phone:

```text
reply with exactly: POCKET_VIBE_V1_OK
```

3. Confirm the phone console shows an AI reply containing `POCKET_VIBE_V1_OK`.
4. Open `Search Files`.
5. Search for `README.md`.
6. Open the file reader and confirm the file content appears on the phone.
7. Open `Vibe Skills`.
8. Send `Project Brief`.
9. Confirm the phone shows either a useful Codex reply or a clear runtime failure reason.
10. Open the tools/actions sheet.
11. If `Kill` is available, press it and confirm a `kill.result` or visible interruption result.
12. If `Kill` is unavailable, confirm the button is disabled and shows a reason.

## 5. Pass Criteria

The v1 acceptance passes only when all conditions are true:

- Desktop automated gate passes without skip flags.
- Phone prompt round trip succeeds with the exact token phrase.
- File search and file reader work from the phone.
- Vibe Skill dispatch returns either a useful response or explicit failure.
- Kill state is capability-correct: available actions execute, unavailable actions are disabled with a reason.
- No action silently fails.
- Git staged release scope does not include logs, local databases, screenshots, temporary files, or VS Code user data.

## 6. Evidence To Record

Record the result in `docs/runtime_联调结果.md` or the current runtime evidence file:

- Date and machine.
- Phone network path: LAN, VPN, Tailscale, Cloudflare tunnel, or other.
- Backend URL and frontend URL shape, without secrets.
- Active runtime shown on phone.
- Prompt result.
- File reader result.
- Vibe Skill result.
- Kill result or disabled reason.
- Any failure reason copied from the UI.

## 7. Stop Rule

If this reference path fails, do not add more platforms or UI panels. Fix the blocker in the reference path first.
