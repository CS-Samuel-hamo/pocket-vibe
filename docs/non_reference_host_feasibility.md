# First Non-Reference Host Feasibility Plan

Updated: 2026-04-24

## Decision

The first non-reference host family should be a native AI coding desktop app.

Reasoning:
- It best matches the product promise: the phone should show and control existing desktop AI coding projects, not only VS Code terminals.
- It validates whether the host contract can survive outside the VS Code extension model.
- It has higher product and commercial leverage than niche editor support.

This is a feasibility target, not a commitment to full support. If the native app cannot expose project/session identity and user-visible action results, it should remain unsupported instead of being forced through fragile UI automation.

## Candidate Probe Order

| Order | Candidate Family | Why First | Exit Decision |
| --- | --- | --- | --- |
| 1 | Native AI coding desktop app | Highest strategic fit for users who already work in dedicated AI coding apps. | Continue only if stable project/session discovery and prompt/result routing are possible. |
| 2 | AI IDE variant | Likely adapter leverage if the host keeps VS Code-compatible extension semantics. | Use the existing VS Code bridge contract when possible; avoid forking the mobile UI. |
| 3 | JetBrains-family host | Enterprise value, but higher plugin and support cost. | Defer until the first non-reference adapter proves the shared contract. |

## Feasibility Questions

The first probe must answer these questions before implementation work expands:

1. Can the host report stable project identity?
   Required fields: `project_id`, `project_name`, `workspace_path` or equivalent, `host_id`.

2. Can the host report session/runtime state?
   Required fields: `active_runtime`, `runtime_catalog`, `health`, `last_error`.

3. Can Pocket Vibe dispatch a prompt and receive a clear result?
   Acceptable outcomes: `success`, `degraded`, `unsupported`, or `failed`, always with a visible reason.

4. Can the host support context and focus without pretending to be an IDE?
   If file focus or context fetch is not stable, mark it `unsupported`.

5. Can approval and interrupt be made reliable?
   If not, mark `approval` and `kill` as `unsupported`; do not guess keyboard sequences.

## Minimum Adapter Contract

A non-reference host adapter must connect to the existing backend WebSocket as role `desktop-host` and send:

```json
{
  "type": "capabilities",
  "host": {
    "id": "stable-host-id",
    "label": "Host Label",
    "platform": "native-app",
    "kind": "native-app",
    "version": "adapter-version",
    "capabilities": ["prompt"],
    "health": "degraded",
    "last_error": null
  },
  "project": {
    "project_id": "host-project-id",
    "project_name": "Project Name",
    "root_path": "D:/path/to/project"
  },
  "runtime_catalog": [],
  "active_runtime": null
}
```

It must handle these existing message types where supported:

| Message | Required For Probe | Notes |
| --- | --- | --- |
| `prompt.submit` | yes | Must return `execution.event` and assistant output or failure reason. |
| `workspace.focus` | no | May be unsupported if the host has no reliable file-focus API. |
| `context.request` | no | May be implemented by backend file read if `root_path` is known. |
| `approval.response` | no | Only support if the host has a deterministic approval channel. |
| `kill.request` | no | Only support if interrupt is deterministic. |
| `command.dispatch` / `run_script` | no | Prefer dedicated shell execution rather than host UI automation. |

## Stop Conditions

Stop the adapter and document `unsupported` if any of these are true:

- Project identity cannot be discovered without manual scraping.
- Prompt dispatch cannot return a deterministic status.
- The only possible integration is brittle screen scraping with no clear failure signal.
- The adapter would force new top-level mobile UI concepts instead of fitting the project inbox.

## Next Engineering Step

Build a read-only probe before a real adapter:

1. Create a small local host probe that connects as `desktop-host`.
2. Report a synthetic native-app host and one project.
3. Verify the mobile project inbox shows it next to the VS Code host.
4. Do not implement prompt dispatch until project/session registration is proven.

The first probe is available at:

- [host_probe.py](/D:/AI_projects/Pocket_Vibe/scripts/host_probe.py)
- [start_host_probe.ps1](/D:/AI_projects/Pocket_Vibe/scripts/start_host_probe.ps1)

Example:

```powershell
.\scripts\start_host_probe.ps1 `
  -BackendWsUrl ws://127.0.0.1:8000/ws `
  -Token vibe-safe `
  -HostId native-probe-1 `
  -Label "Native App Probe" `
  -Platform native-app-probe `
  -ProjectRoot .
```

Use `-PrintOnly` to preview the command without opening the WebSocket connection.

Expected result:

- The probe appears in `host_registry` as a `native-app` host with `health = degraded`.
- The project appears in the mobile project inbox.
- The phone prompt composer is disabled while the selected probe project has no active runtime.
- Any attempted prompt, command, focus, approval, or kill action returns `execution.event` with `reason = host_probe.read_only`.

When a future real native host reports `capabilities: ["prompt"]` at the host level without a runtime catalog, the phone should allow prompt dispatch and show the host's degraded/ready reason from `capabilities.host`.
