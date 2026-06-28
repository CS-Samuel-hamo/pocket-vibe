# Pocket Vibe Security And Trust Baseline

Updated: 2026-05-09

This document defines the security posture required for a usable Pocket Vibe product. It is written to guide implementation and review.

## Product Trust Boundary

Pocket Vibe controls desktop AI coding sessions from a phone. That means it can route sensitive actions:

- prompts to AI coding tools;
- file context reads;
- script execution requests;
- approvals or rejections;
- Kill/interrupt requests.

The product must therefore prefer explicit capability states over silent fallback. Every action must resolve to `success`, `degraded`, `unsupported`, or `failed` with a user-visible reason.

## Data Classes

| Class | Examples | Default Handling |
| --- | --- | --- |
| Account metadata | email, account id, subscription status | Relay-only when account mode exists |
| Device metadata | phone id, desktop id, pairing state | Relay/local profile |
| Session metadata | online state, replay cursor, host id, project id | Relay/local backend |
| Capability metadata | runtime health, supported actions, last error | Safe to route and display |
| Sensitive payload | prompts, AI replies, terminal output, file content | Local or E2EE by default |
| Diagnostics | versions, endpoint shapes, error codes, redacted events | Opt-in export |
| Secrets | tokens, API keys, env files | Never committed, never included in default diagnostics |

## Current Local Architecture

In current local mode:

```text
Phone PWA -> local FastAPI backend -> VS Code bridge -> runtime terminal
```

The backend may see prompt and output plaintext because it is running on the user's desktop. Local runtime artifacts such as `.env`, logs, databases, screenshots, and generated profiles must remain ignored by Git.

## Planned Relay Architecture

In planned relay mode:

```text
Phone PWA -> Pocket Vibe Relay -> desktop host -> runtime
```

The relay should not need prompt or output plaintext to route sessions. Relay implementation must be metadata-first and should keep payload-level E2EE enabled by default.

## Required Security Behaviors

- Pairing uses short-lived QR/short-code flow plus desktop confirmation.
- Long-lived URL query tokens are not used as durable credentials.
- Device revocation takes effect on the next relay/backend action.
- Expired or mismatched tokens fail closed with user-visible error codes.
- Unsupported runtime actions are blocked before dispatch where possible.
- High-risk actions such as approvals, scripts, and Kill are audited.
- Diagnostic bundles are redacted by default.

## Threat Model

| Threat | Required Response |
| --- | --- |
| Phone is lost | Allow device revocation and clear saved mobile profile |
| Desktop profile leaks | Profile lives in ignored local directory and token expires when ephemeral |
| Relay is unavailable | Show relay offline and offer LAN/fallback instructions |
| Runtime changes behavior | Mark capability degraded/unsupported instead of guessing |
| User clicks dangerous action | Route through approval state and audit result |
| Support asks for logs | Export redacted diagnostics unless user explicitly opts into payload content |

## Release Blockers

Do not call the product complete if any of these are true:

- source code, prompts, assistant replies, or secrets appear in default diagnostics;
- generated tokens or `.pocket-vibe/` profiles can be committed accidentally;
- connection failures are shown only as generic errors;
- relay mode stores plaintext payloads by default;
- unsupported runtime actions are still dispatchable from the phone UI.
