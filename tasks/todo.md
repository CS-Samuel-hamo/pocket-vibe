# Pocket Vibe Todo

Updated: 2026-04-23

## Current Session

- [x] Expand mobile `Scripts` from repo-root-only discovery to supported workspace manifests.
- [x] Route mobile script execution through a dedicated desktop shell instead of the AI runtime terminal.
- [x] Remove low-signal session join/leave noise from the mobile home critical-events feed.
- [x] Make the VS Code bridge auto-reconnect after backend restarts instead of leaving mobile in `HOST OFFLINE`.
- [x] Collapse the mobile IA from multi-tab dashboard into a single chat-first remote-control surface.
- [x] Move files/scripts/runtime/support into an on-demand tools sheet instead of top-level navigation.
- [x] Hide low-frequency support and audit actions from the primary viewport.
- [x] Add a project registry so mobile can switch between active desktop projects.
- [x] Make prompt, search, open-on-desktop, and scripts project-aware.
- [x] Preserve approval `project_id` / `host_id` on mobile and route approval responses back to the originating project.
- [x] Make the mobile project inbox highlight pending approvals by project instead of only by the active project.
- [x] Update runtime validation results with the observed `codex-cli` prompt baseline and current automated checks.
- [x] Add a canonical protocol helper for normalized desktop host descriptors.
- [x] Surface canonical host descriptor fields from backend `host_registry` and `capabilities.host` while keeping legacy fields compatible.
- [x] Move backend project state toward host-first naming with `host_projects`, while preserving `bridge_projects` as a compatibility alias.
- [x] Add a read-only non-reference host probe for validating native-app project registration in the mobile inbox.
- [x] Add a PowerShell launcher for the read-only native host probe.
- [x] Preserve host-level `health` / `last_error` for non-runtime desktop hosts.
- [x] Disable the mobile prompt composer when the selected project has no active runtime or prompt capability.
- [x] Let mobile capability checks fall back to host-level capabilities when no runtime catalog exists.

## Host Platform Backlog

### Phase A: Shared Host Protocol
- [x] Define the canonical desktop host descriptor.
- [x] Remove remaining VS Code-shaped routing assumptions from backend state.
- [x] Publish a host capability matrix that is explicit about degraded and unsupported operations.

### Phase B: Project Inbox
- [x] Turn the mobile landing surface into a cross-project inbox.
- [x] Surface recent projects, pending approvals, last reply, and recent failure by project.
- [x] Preserve the chat-first interaction model while making project switching feel native.

### Phase C: Platform Expansion
- [x] Rank native AI coding apps, AI IDE variants, and JetBrains-family hosts with a shared rubric.
- [x] Pick the first non-reference host family for a feasibility adapter.
- [x] Document rollout rules so platform breadth follows leverage, not novelty.

## Active Steward Tasks

- [ ] Freeze v1 scope around the reference `phone PWA -> backend -> VS Code bridge -> codex-cli` path.
- [ ] Prepare a clean v1 Git baseline using [v1_release_manifest.md](/D:/AI_projects/Pocket_Vibe/docs/v1_release_manifest.md).
- [ ] Run the v1 completion gate from [v1_done_definition.md](/D:/AI_projects/Pocket_Vibe/docs/v1_done_definition.md).
- [ ] Tag or commit the v1 MVP baseline before resuming host-platform expansion.

## Notes

- Do not chase platform count before the host contract is explicit.
- Do not let host diversity reintroduce a dashboard-style mobile surface.
- Every user-facing action must end in one of: success, degraded with reason, unsupported with reason, failed with reason.
