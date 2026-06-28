# Pocket Vibe Error Code Dictionary

Updated: 2026-05-09

Error codes are user-facing recovery categories. They are not stack traces. Implementations should surface the closest code plus a short reason.

## Connection

| Code | Meaning | User Action |
| --- | --- | --- |
| `PV-CONN-001` | Phone cannot reach backend API | Check LAN/VPN/relay URL and open the pairing page again |
| `PV-CONN-002` | WebSocket cannot connect | Confirm backend or relay is online |
| `PV-CONN-003` | Desktop host is offline | Start VS Code bridge or desktop host |
| `PV-CONN-004` | Saved mobile profile is stale | Use `Link` to reset connection settings |

## Authentication And Pairing

| Code | Meaning | User Action |
| --- | --- | --- |
| `PV-AUTH-001` | Token mismatch | Reopen the current pairing page and reconnect |
| `PV-AUTH-002` | Token expired | Restart desktop host or generate a new pairing code |
| `PV-AUTH-003` | Device not authorized | Confirm pairing on the desktop |
| `PV-AUTH-004` | Device revoked | Pair the device again |

## Runtime

| Code | Meaning | User Action |
| --- | --- | --- |
| `PV-RUN-001` | No active runtime | Launch or attach `codex-cli` or another supported runtime |
| `PV-RUN-002` | Runtime is degraded | Read the displayed limitation before continuing |
| `PV-RUN-003` | Action unsupported by runtime | Choose another runtime or skip that action |
| `PV-RUN-004` | Runtime failed to execute action | Check desktop terminal and retry after recovery |

## Relay

| Code | Meaning | User Action |
| --- | --- | --- |
| `PV-RELAY-001` | Relay unavailable | Wait or switch to LAN/fallback mode |
| `PV-RELAY-002` | Relay session expired | Reconnect both phone and desktop |
| `PV-RELAY-003` | Replay cursor invalid | Refresh the phone session |
| `PV-RELAY-004` | Device route missing | Confirm the desktop host is online |

## Diagnostics

| Code | Meaning | User Action |
| --- | --- | --- |
| `PV-DIAG-001` | Clipboard export failed | Use manual copy or browser share sheet |
| `PV-DIAG-002` | Diagnostic bundle redacted payload | Opt in only if support needs message content |
| `PV-DIAG-003` | Logs unavailable | Reproduce the issue and export again |
