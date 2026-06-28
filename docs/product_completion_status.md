# Pocket Vibe Product Completion Status

Updated: 2026-05-09

This document tracks the completion-product plan against the current repository state.

Status vocabulary:

- `done`: implemented and covered by automated gates or documented manual evidence.
- `partial`: useful implementation exists, but the milestone is not complete.
- `blocked`: requires external infrastructure, accounts, credentials, or real-device validation.
- `not started`: not materially implemented.

## Current Milestone State

| Milestone | Status | Evidence | Remaining Gate |
| --- | --- | --- | --- |
| M0 Freeze current v1 | `partial` | Desktop gate passes; release manifest exists; reference path has prior phone evidence. | Run final real-phone five-minute acceptance after latest commits, then create `v0.1.0-mobile-codex-mvp` tag. |
| M1 Local finished product | `partial` | Backend-hosted PWA, `start.ps1`, bridge local profile, simplified mobile home, project inbox, read-only files, skills. | Fresh-machine install and real-phone acceptance must be repeated. |
| M2 Relay MVP | `partial` | Default-off in-memory relay core/API, pairing, device revoke, encrypted envelope requirement, replay cursor, retention cap, error codes. | WebSocket relay path, durable device/session store, account model, hosted relay, HTTPS/WSS deployment. |
| M3 Trust and recovery | `partial` | Security docs, privacy policy, error codes, redacted diagnostics, mobile recovery codes. | Field diagnostics from real weak-network sessions; production data deletion and retention implementation. |
| M4 AI Coding product experience | `partial` | Project inbox, conversation-first label, read-only files, Vibe Skills, capability-driven action visibility. | More mobile UX testing with keyboard, lock screen, reconnect, long replies, and multiple projects. |
| M5 Release and commercial loop | `not started` | Windows prereq checker and startup runbook exist. | Installer/package, update path, hosted relay billing, pricing enforcement, support workflow, public landing/onboarding. |

## What Is Now Product-Useful

- A developer can run a local Windows-first stack with `.\start.ps1`.
- The phone can connect to the backend-hosted PWA without understanding separate `5173` and `8000` services.
- VS Code bridge can auto-discover the generated local backend profile.
- `codex-cli` remains the reference full runtime.
- Other runtimes can be visible as degraded or unsupported without blocking the reference path.
- The mobile UI has a product-oriented home, project inbox, read-only file preview, Vibe Skills, and diagnostics.
- The relay core has enough state-machine coverage to continue toward a hosted relay without changing the product vocabulary.

## What Is Not Complete

- Pocket Vibe is not yet a finished public product.
- There is no deployed public relay.
- There is no durable account, device, or subscription system.
- There is no packaged Windows installer.
- There is no production update path.
- There is no app-store distribution.
- There is no payment integration.
- There is no final release tag for the current completion-plan baseline.

## Next Engineering Sequence

1. Run the latest real-phone acceptance script on LAN.
2. If it passes, tag the current baseline as `v0.1.0-mobile-codex-mvp`.
3. Build relay WebSocket routing as a separate task with tests.
4. Add durable relay storage behind an interface, not directly inside `RelayCore`.
5. Add hosted relay deployment only after DNS, TLS, abuse controls, and support ownership are chosen.
6. Package Windows startup only after the fresh-machine install script passes.

## Manual Gates Codex Cannot Complete Alone

- Real-phone LAN acceptance.
- Real-phone cellular-to-desktop acceptance.
- VPN/Tailscale/Cloudflare acceptance.
- DNS and TLS ownership.
- Cloud relay account and deployment.
- Payment account and pricing enforcement.
- App-store or public distribution account.

## Stop Rule

Do not expand additional AI coding platforms until the reference product path is reliable:

```text
Windows desktop -> VS Code bridge -> codex-cli -> backend-hosted PWA -> phone
```

Every action should either succeed, degrade visibly, be unsupported with a reason, or fail with a recovery code.
