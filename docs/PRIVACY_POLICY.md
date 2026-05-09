# Pocket Vibe Privacy Policy

Last updated: 2026-05-09

Pocket Vibe is a PWA-first mobile control layer for desktop AI coding sessions. The current v1 reference path is:

`phone PWA -> local FastAPI backend -> VS Code bridge -> codex-cli`

This policy describes the current local product and the planned metadata-first relay path. It is a product privacy baseline, not a substitute for legal review before public launch.

## Current Local Mode

In local/LAN mode, Pocket Vibe runs on your desktop machine. Your phone connects to the backend started from your project workspace.

Pocket Vibe may process locally:

- pairing token and session state;
- WebSocket routing state;
- project names and workspace paths;
- runtime capability and health state;
- prompts and assistant replies needed to render the mobile console;
- file names and file contents you explicitly preview from the phone;
- audit events for prompt dispatch, approvals, Kill requests, scripts, failures, and reconnects.

This local data stays on your devices unless you copy it, export diagnostics, or configure a remote/tunnel path.

## Planned Relay Mode

The planned Pocket Vibe relay is intended to route phone and desktop sessions across networks without requiring LAN, VPN, Tailscale, or Cloudflare setup.

The relay should store only the minimum metadata needed to operate the service:

- account and device identifiers;
- pairing and device authorization state;
- session routing metadata;
- online/offline state;
- message replay cursors;
- coarse error codes and service diagnostics.

Prompt text, assistant output, source code, and file contents should be end-to-end encrypted by default when routed through the relay. Any diagnostic upload that includes message content must require explicit user opt-in.

## Data We Do Not Want By Default

Pocket Vibe should not collect these by default:

- source code content;
- full prompt or assistant-response plaintext;
- terminal output plaintext;
- private repository secrets;
- local environment files;
- screenshots or recordings;
- payment data beyond what a payment processor requires.

## Diagnostics

Support diagnostics should be opt-in and minimized. The default diagnostic bundle should include:

- app, backend, bridge, and runtime versions;
- connection mode and endpoint shape without secrets;
- device and host health state;
- runtime capability matrix;
- error codes and timestamps;
- redacted event summaries.

Diagnostics must not include source code, prompt text, assistant output, full terminal output, or secrets unless the user explicitly approves that content for a support case.

## User Controls

Pocket Vibe should provide controls to:

- revoke paired devices;
- reset local connection profiles;
- clear saved mobile connection profiles;
- export a redacted diagnostic bundle;
- delete relay account/device metadata when relay mode exists.

## Contact

This repository currently uses placeholder distribution materials. Replace this section with the product support contact before public release.
