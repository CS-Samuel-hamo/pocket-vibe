# Pocket Vibe Host Capability Matrix

Updated: 2026-04-24

This document defines the current host and runtime capability truth for Pocket Vibe v1.
It is intentionally conservative: unsupported or degraded paths must stay visible to the phone UI instead of silently falling back.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| `full` | The action has a direct implementation and should return a clear result. |
| `degraded` | The action can be attempted through a fallback path, but the UI must show the limitation. |
| `unsupported` | The action is not reliable enough for v1; the UI must disable it or show a reason before dispatch. |
| `planned` | The contract exists, but no adapter is implemented yet. |

## Canonical Host Descriptor

Every desktop host should eventually surface this normalized shape through `host_registry[*]` and `capabilities.host`:

| Field | Meaning |
| --- | --- |
| `id` | Stable host instance id. |
| `label` | User-facing host name. |
| `platform` | Host platform family, for example `vscode`, `codex-app`, or `jetbrains`. |
| `kind` | Host kind, for example `ide-host`, `native-app`, or `desktop-host`. |
| `version` | Adapter or host integration version when available. |
| `capabilities` | Host-level supported capability buckets. |
| `health` | `ready`, `degraded`, or `offline`. |
| `last_error` | Most recent explicit failure reason. |

Legacy fields such as `host_id`, `host_label`, `host_platform`, and `session_capabilities` remain in payloads for compatibility.

## Host Family Matrix

| Host Family | Current Status | Prompt | Focus | Read Context | Approval | Kill | Run Script | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VS Code bridge host | reference | full | full | full | full for terminal runtimes | full for terminal runtimes | full | Current production reference path. Runtime limitations still apply. |
| VS Code extension fallback host | degraded | degraded | full | full | unsupported | unsupported | unsupported | Continue/Cline/Roo/Copilot-style fallback uses clipboard or host focus patterns. |
| Native AI coding desktop app | planned | planned | planned | planned | planned | planned | planned | Next feasibility family; adapter must prove stable project/session identity first. |
| AI IDE variant | planned | planned | planned | planned | planned | planned | planned | Candidate after the shared host contract is stable. |
| JetBrains-family host | planned | planned | planned | planned | planned | planned | planned | Higher support cost; do not implement before one non-reference adapter proves the contract. |
| Browser/cloud workspace | later | planned | planned | planned | planned | planned | planned | Deferred until local install, trust, and recovery flows are product-grade. |

## Runtime Matrix In VS Code Bridge

| Runtime | Source | Dispatch | Approval | Interrupt | Host Capability Result |
| --- | --- | --- | --- | --- | --- |
| `codex-cli` | terminal | `raw_prompt` | `terminal_yes_no` | `ctrl_c` | Full path when attached and healthy. |
| `claude-code` | terminal | `raw_prompt` | `terminal_yes_no` | `ctrl_c` | Same contract as terminal runtimes, pending local validation. |
| `opencode` | terminal | `raw_prompt` | `terminal_yes_no` | `ctrl_c` | Same contract as terminal runtimes, pending local validation. |
| `antigravity` | terminal | `raw_prompt` | `terminal_yes_no` | `ctrl_c` | Same contract as terminal runtimes, pending local validation. |
| `continue-ext` | extension | `clipboard_fallback` | `unsupported` | `unsupported` | Degraded prompt/focus/context only. |
| `cline-ext` | extension | `clipboard_fallback` | `unsupported` | `unsupported` | Degraded prompt/focus/context only. |
| `roo-ext` | extension | `clipboard_fallback` | `unsupported` | `unsupported` | Degraded prompt/focus/context only. |
| `copilot-ext` | extension | `clipboard_fallback` | `unsupported` | `unsupported` | Degraded prompt/focus/context only. |

## Product Rules

- The phone UI should reason from capability buckets, not vendor names.
- A button must not send a request when the active host/runtime marks the action `unsupported`.
- The prompt composer must be disabled when there is no active runtime or prompt capability for the selected project.
- A host can provide capability buckets directly when it has no runtime catalog; the mobile client should use `capabilities.host.capabilities` as a fallback.
- A degraded action must show the degraded reason before or immediately after dispatch.
- Every host-facing action must resolve to `success`, `degraded`, `unsupported`, or `failed` with a user-visible reason.
- Platform breadth should not add new top-level mobile panels; new hosts must fit the project inbox and chat-first control surface.
