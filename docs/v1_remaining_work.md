# Pocket Vibe v1 Remaining Work

Updated: 2026-05-04

This file tracks the gap between the current demoable prototype and a stable v1 release.

## Already Improved

- Mobile default view is now chat-first; project switching, runtime switching, scripts, and debug tools are secondary actions.
- `MobileControllerView.jsx` was split into `MobileHomeSummary.jsx` and `MobileToolsSheet.jsx`.
- Core mobile control labels are localized into Chinese.
- Vibe skills, runtime action feedback, file search, script panel, desktop QR panel, and connection preflight states are localized or explained in Chinese.
- Runtime pending-state CSS classes remain stable while the visible labels are localized.
- VS Code workspace-folder based project switching is implemented through `Tools -> Projects -> Open Picker`.
- Frontend capability tests and production build pass after the latest UI changes.
- The v1 desktop gate passed on 2026-05-04 after the latest localization and recovery UX commits.

## Must Finish Before v1 Tag

- Run the real-phone five-minute demo from `docs/v1_acceptance_script.md`.
- Record phone evidence in the runtime validation notes.
- Decide what to do with the untracked local backlog files before release.
- Re-run `scripts/v1_desktop_gate.ps1` after any further source changes and record the result here.
- Tag the baseline only after the real-phone demo and cleanup decision are complete.

## Needs User Decision

- Local backlog cleanup: root-level planning files, marketing drafts, old scaffold scripts, and historical migration notes should be archived, ignored, staged, or deleted deliberately.
- Cross-network product path: choose one blessed option for non-LAN use, such as Tailscale, Cloudflare Tunnel, or another HTTPS/WSS tunnel.
- Release scope: keep v1 focused on `phone PWA -> backend -> VS Code bridge -> codex-cli`.

## Known Product Debt

- First-run setup still requires the user to understand frontend URL, backend URL, token, VS Code bridge, and runtime readiness.
- Cross-network and VPN use is documented but not one-click.
- Non-`codex-cli` runtimes remain best-effort and should be shown as degraded or unsupported when unreliable.
- Audit history is still system-event oriented and should become user-readable operation history later.

## Known Engineering Debt

- `vscode-bridge/src/extension.ts` and `backend/main.py` remain large and should be split after the v1 baseline.
- `MobileToolsSheet.jsx` is a new consolidation point and may need further extraction if it grows.
- The release machine still shows post-command Conda GBK shell-hook noise after a passing gate; this is an environment issue, not a project test failure.
