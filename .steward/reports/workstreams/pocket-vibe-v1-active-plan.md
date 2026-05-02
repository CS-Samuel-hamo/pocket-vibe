# Pocket Vibe Active Plan

Updated: 2026-05-02
Stage: post-baseline stabilization
Status: in_progress

## Current Position

Pocket Vibe is being narrowed toward a v1 release baseline:
- `mobile -> backend -> desktop host -> runtime` is verified end to end for the VS Code reference host.
- Mobile pairing, runtime control, assistant replies, scripts, simplified tools, and remote/manual connection now work.
- Project registry and mobile project switching now exist, so the next gap is no longer "single project remote control".
- The v1 source baseline is now committed and tagged as `v1-baseline-2026-05-01`.
- The immediate product question is no longer "what else can be added"; it is whether the reference path can stay stable while the large backend and bridge files are split into maintainable modules.

Reference v1 path:

`phone PWA -> FastAPI backend -> VS Code bridge -> codex-cli terminal`

The v1 release gate is defined in [v1_done_definition.md](/D:/AI_projects/Pocket_Vibe/docs/v1_done_definition.md).

## Product Gaps

1. The Git baseline is not clean enough for release.
   Source, docs, local runtime state, logs, generated reports, screenshots, and VS Code user data are still mixed in one dirty worktree.
2. The five-minute demo still needs a single authoritative acceptance script.
   README and QUICKSTART describe the path, but release completion must be judged against one fixed v1 demo.
3. `codex-cli` is the only runtime that should block v1.
   Other runtimes and host families must remain degraded, unsupported, or backlog until the reference path is tagged.
4. Host platform expansion is valid but paused.
   The existing host-protocol and project-inbox work should be validated only insofar as it supports the v1 reference path.
5. Remote trust and install flows remain important, but they are not a reason to expand scope before a v1 baseline exists.

## Delivery Tracks

| Track | Goal | Status | Primary Modules |
| --- | --- | --- | --- |
| `v1-baseline` | Clean Git scope and define the release gate | active | `docs`, `mobile-pwa`, `backend-api`, `desktop-bridge` |
| `reference-demo` | Prove phone PWA -> backend -> VS Code bridge -> codex-cli in five minutes | pending-smoke | `mobile-pwa`, `desktop-bridge`, `core-runtime` |
| `host-platform` | Preserve host-agnostic contracts without expanding adapters | paused-after-validation | `backend-api`, `protocol-contract`, `desktop-bridge` |
| `quality-debt` | Make the post-baseline codebase commit-safe and split oversized modules without protocol drift | active | `backend-api`, `desktop-bridge`, `core-runtime` |

## Near-Term Sprint

### Current Gate
- Keep the v1 baseline tag intact as the rollback point.
- Make `scripts/quality_gate.py` commit-safe without weakening the documented thresholds, using `.steward/quality_gate_baseline.json` to block new or worse violations.
- Split `backend/main.py` in small route/session/protocol slices.
- First backend split completed: pairing page rendering moved to `backend/pairing_page.py`, with renderer tests.
- Second backend split completed: connection preflight payload construction moved to `backend/connection_preflight.py`, with direct preflight tests.
- Third backend split completed: host/project/session metadata normalization moved to `backend/host_session.py`, with direct metadata tests.
- Fourth backend split completed: project and host registry entry builders moved to `backend/project_registry.py`, with direct registry tests.
- Fifth backend split completed: active project fallback selection moved into tested registry helpers.
- Sixth backend split completed: host session state update moved to `backend/connection_state.py`, with direct state tests.
- Seventh backend split completed: prompt route payload builders moved to `backend/protocol_routes.py`, with direct route payload tests.
- Eighth backend split completed: workspace, context, and command route payload builders moved into tested protocol route helpers.
- Ninth backend split completed: approval and Kill route payload/audit builders moved into tested protocol route helpers.
- Tenth backend split completed: project selection events moved into tested protocol route helpers.
- Eleventh backend split completed: snapshot session/capability packet builders moved to `backend/snapshots.py`, with direct snapshot tests.
- Twelfth backend split completed: protocol message classification moved to `backend/protocol_dispatch.py`, removing `_handle_protocol_message` from the quality debt baseline.
- Thirteenth backend split completed: socket message JSON parsing, handshake/resume gating, decrypt, and normalization moved to `backend/socket_messages.py`, with direct socket envelope tests.
- Fourteenth backend split completed: desktop driver output parsing and delivery policy moved to `backend/driver_output.py`, removing `broadcast_driver_output` from the quality debt baseline.
- Fifteenth backend split completed: prompt and approval route emission sequences moved to `backend/route_flows.py`, removing `_route_prompt_submit` and `_route_approval_response` from the quality debt baseline.
- Sixteenth backend split completed: project state payload metadata normalization moved to `backend/project_state_payload.py`, removing `_project_state_payload` branch complexity from the quality debt baseline.
- Seventeenth backend split completed: room snapshot DTO assembly moved to `backend/room_snapshot_payload.py`, removing `_room_snapshot_payload` branch complexity from the quality debt baseline.
- Eighteenth backend split completed: room peer filtering moved to `backend/connection_peers.py`, removing `get_peers_in_room` branch complexity from the quality debt baseline.
- Nineteenth backend split completed: connection registry host/project lookup moved to `backend/connection_registry.py`, removing `get_project_entry`, `get_host_entry`, and `list_room_hosts` branch complexity from the quality debt baseline.
- Twentieth backend split completed: connection teardown metadata and room selection cleanup moved to `backend/connection_disconnect.py`, removing `disconnect` nesting and branch complexity from the quality debt baseline.
- Twenty-first backend split completed: websocket endpoint lifecycle orchestration moved to `backend/websocket_lifecycle.py`, removing `websocket_endpoint` length and branch complexity from the quality debt baseline.
- Twenty-second backend split completed: `ConnectionManager` moved to `backend/connection_manager.py` with explicit dependencies, reducing `backend/main.py` to 1076 lines while preserving replay, E2EE serialization, room routing, and host/project registry behavior.
- Twenty-third backend split completed: pairing context, IP detection, URL rewriting, env flags, and QR SVG rendering moved to `backend/pairing_context.py`, reducing `backend/main.py` to 912 lines.
- Twenty-fourth backend split completed: file browsing and file read helpers moved to `backend/file_api.py`, preserving existing endpoint wrappers and file access behavior.
- Twenty-fifth backend split completed: protocol routing orchestration moved to `backend/protocol_router.py`, reducing `backend/main.py` to 662 lines and removing the final `backend/main.py` quality debt entry.
- First VS Code bridge split completed: terminal and extension fallback runtime adapters moved to `vscode-bridge/src/runtimeAdapters.ts`, reducing `extension.ts` to 1413 lines while leaving remaining file-length and JS nesting debt tracked for the next bridge slices.
- Second VS Code bridge split completed: Project Shell script execution, shell integration waiting, output streaming, truncation, and exit-code reporting moved to `vscode-bridge/src/shellExecution.ts`, reducing `extension.ts` to 1195 lines.
- Continue splitting `vscode-bridge/src/extension.ts` in small activation/client/runtime/UI slices.
- After each slice, run the relevant targeted tests plus the v1 completion gate when behavior changes.

## Host Platform Progress

- Added project-aware routing to prompt, command, focus, approval, and kill flows.
- Added a backend project registry surfaced in `session.state` and `capabilities`.
- Added mobile project switching and project-aware file/context operations.
- Kept the mobile surface chat-first while moving low-frequency controls into the `+` sheet.
- Added an inline mobile project inbox strip so recent projects can be entered from the chat surface without falling back to a dashboard UI.
- Preserved approval project/host ownership on mobile so approval responses and inbox warnings stay attached to the originating desktop project.
- Updated runtime validation evidence for the observed `codex-cli` prompt round trip while leaving unverified approval, Kill, focus, and script items open.
- Added a normalized desktop host descriptor helper in the protocol layer so host identity, capabilities, health, and failure state have one canonical shape.
- Surfaced the same canonical host descriptor fields through backend `host_registry` and `capabilities.host`, preserving legacy `host_*` fields for current clients.
- Published a host capability matrix that makes full, degraded, unsupported, and planned host/runtime behavior explicit.
- Shifted backend project state to host-first naming with `host_projects`; `bridge_projects` remains as an alias for older tests and compatibility paths.
- Selected native AI coding desktop apps as the first non-reference host feasibility family and documented stop conditions before adapter work expands.
- Added a read-only `desktop-host` probe that can register a synthetic native-app project and return explicit unsupported events for all control actions.
- Preserved host-level health and failure fields for non-runtime hosts, and disabled the mobile prompt composer when a selected project has no prompt-capable runtime.
- Added a PowerShell launcher for the read-only native host probe so the non-reference project-inbox smoke can be run without composing Python arguments by hand.
- Added mobile host-level capability fallback so a future native host can support prompt dispatch without pretending to expose a runtime catalog.

## Exit Criteria For This Stage

- `docs/v1_done_definition.md` is the source of truth for release completion.
- The reference `codex-cli` path passes automated checks and real-phone smoke.
- Runtime artifacts, local logs, local databases, screenshots, and VS Code user data are excluded from the release baseline.
- A clean baseline commit can be created without mixing generated state into source history.

## Active Work Order

1. Preserve the v1 baseline commit and tag as the rollback point.
2. Fix the quality gate helper and measured baseline so small future commits can pass without bypassing hooks.
3. Split `backend/main.py` without websocket protocol drift.
4. Split `vscode-bridge/src/extension.ts` without runtime dispatch regression.
5. Re-run the real-phone reference smoke after the backend and bridge splits.

## Notes

- Do not chase platform count before the v1 reference path is tagged.
- Do not let more hosts make the phone UI feel like a desktop control panel again.
- Every host-facing action must still end in one of: success, degraded-with-reason, unsupported-with-reason, failed-with-reason.
