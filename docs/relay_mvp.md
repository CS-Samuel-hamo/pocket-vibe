# Pocket Vibe Relay MVP

Updated: 2026-05-09

This document describes the relay work that now exists in the repository. It is not a claim that a public hosted relay is deployed.

## Current State

- The local LAN path remains the default product path.
- Relay HTTP routes are disabled by default.
- The relay core is in-memory and transport-light. It is suitable for automated tests and the next integration slice, not production persistence.
- The relay accepts only encrypted envelopes for message append. It rejects plaintext prompt/output/source payloads.
- Replay history is capped per in-memory session. This protects the MVP from unbounded memory growth, but it is not durable history.
- Consumed and expired pairing codes can be cleaned from the in-memory relay core.
- No cloud DNS, TLS certificate, account system, payment system, or app-store distribution path is configured by this repository.

## Enable Locally

Set the feature flag before starting the backend:

```powershell
$env:POCKET_VIBE_RELAY_API="1"
.\start.ps1
```

When enabled, the backend mounts the relay routes under `/api/relay`.

## HTTP Surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/relay/hosts` | Register a desktop host session. |
| `POST` | `/api/relay/hosts/{host_id}/pairing-code` | Create a short-lived mobile pairing code. |
| `POST` | `/api/relay/pair` | Pair a mobile device with a code. |
| `POST` | `/api/relay/sessions/{session_id}/devices/{device_id}/online` | Update device presence. |
| `DELETE` | `/api/relay/sessions/{session_id}/devices/{device_id}` | Revoke a paired device. |
| `GET` | `/api/relay/sessions/{session_id}/presence` | Read host/mobile online state. |
| `POST` | `/api/relay/sessions/{session_id}/messages` | Append an encrypted message envelope. |
| `GET` | `/api/relay/sessions/{session_id}/messages` | Replay encrypted envelopes after a cursor. |

All operation results use the product result vocabulary: `success` or `failed` in the current MVP. Future relay slices can add `degraded` or `unsupported` where appropriate.

## Security Boundary

The current relay API is intentionally not a public production service:

- It has no durable account model.
- It has no rate limiting beyond the existing backend process boundary.
- It has no persistent device registry.
- It does not terminate or issue production TLS.
- It must not be exposed to the public internet without adding authentication, persistence, abuse controls, and HTTPS/WSS deployment hardening.

The tested invariant is narrower but important: relay message append requires an encrypted envelope with `ciphertext` and `nonce`. The relay should route and replay opaque encrypted payloads, not inspect prompt text, assistant output, source code, or terminal output.

## Remaining Work

- Add WebSocket relay routing for desktop host and mobile clients.
- Add durable account/device/session persistence.
- Add per-device authorization tokens after pairing confirmation.
- Add relay E2E tests for disconnected mobile, disconnected desktop, revoked device, and invalid replay cursor.
- Add a public deployment guide only after DNS, TLS, observability, and support ownership are chosen.
