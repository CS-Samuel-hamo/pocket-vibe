# Pocket Vibe: From Demo To Product

Updated: 2026-04-23

Current completion status is tracked in [product_completion_status.md](/D:/AI_projects/Pocket_Vibe/docs/product_completion_status.md).

## Current Assessment

Pocket Vibe already proves the core idea:
- phone-to-PC control is viable
- VS Code can serve as the host plane
- `codex-cli` can be dispatched from mobile and return replies

What it does not yet prove is product readiness across desktop host types.

The remaining work is not mainly "more features". It is:
- reliability
- clarity
- remote access
- recovery
- operator experience
- host-platform leverage

## Stage 1: Usable

Goal: one user can rely on Pocket Vibe away from the desk.

### Required outcomes
- `codex-cli` is stable end to end
- mobile can always tell the user what state the host is in
- kill, approval, and reply delivery are dependable
- session reconnect does not require source-level intervention

### What to build
- explicit runtime launch and attach flow
- runtime health and support matrix
- better assistant/system message separation
- reconnect and relaunch guidance in the UI

## Stage 2: Beta

Goal: a small set of external users can install, connect, and recover.

### Required outcomes
- one supported remote-access path beyond same-LAN use
- pairing works without asking users to understand backend internals
- diagnostics are easy to export and inspect
- runtime limitations are visible before the user clicks

### What to build
- remote-access mode using a documented tunnel or relay path
- improved pairing screen and recovery flow
- support diagnostics panel
- release packaging and upgrade path for the bridge

## Stage 3: Product

Goal: Pocket Vibe becomes a durable mobile control plane for AI coding workflows.

### Required outcomes
- install and upgrade are routine
- connection, runtime, and audit state are always legible
- the mobile UI is decision-first, not terminal-first
- support and operations can debug failed sessions from logs and state

### What to build
- better mobile home dashboard
- richer audit history and critical event stream
- safer approval/risk model
- release engineering, crash recovery, and field diagnostics

## Stage 4: Host Platform Expansion

Goal: Pocket Vibe becomes the mobile entry point across multiple desktop AI coding hosts, not just one VS Code-shaped session.

### Required outcomes
- host registration and project routing are host-agnostic
- project registry is the canonical product surface across hosts
- the phone can switch projects from different hosts without exposing transport complexity
- at least one non-reference host family has a validated adapter path

### What to build
- a shared desktop host adapter contract
- a platform priority matrix and rollout order
- a project inbox on mobile
- one feasibility adapter path beyond the VS Code reference host

## Immediate Next Backlog

### Current Phase
- formalize the desktop host protocol
- make project registry and routing host-agnostic
- add a mobile project inbox
- validate one non-VS Code host family before expanding further

## Platform Expansion Rules

- Do not add platforms just because they are popular.
- Do not let host diversity make the mobile UI more complex.
- Expand to new hosts only when the adapter contract stays explicit about `success`, `degraded`, `unsupported`, and `failed`.
- Choose the next host family by user leverage, adapter leverage, and support cost, not by novelty.

## Product Standard

Pocket Vibe stops being a toy when a user can:
- connect without debugging
- tell what is happening at a glance
- trust the system to either complete, degrade clearly, or fail clearly
- recover without touching the codebase
- move between active desktop projects without caring which host family produced them
