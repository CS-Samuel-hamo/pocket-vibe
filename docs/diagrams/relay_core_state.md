# Relay Core 状态图

> relay_core.py 中传输无关的中继状态机。
> 将以下 Mermaid 代码块渲染为状态图。

```mermaid
stateDiagram-v2
    [*] --> Idle

    Idle --> PairingChallenge: create_challenge()
    PairingChallenge --> PairingChallenge: expires (clock)
    PairingChallenge --> Idle: revoked / consumed

    PairingChallenge --> RelaySession: claim_challenge()
    state RelaySession {
        [*] --> Active
        Active --> Expired: TTL reached (clock)
        Active --> Closed: device_disconnect()
        Expired --> [*]
        Closed --> [*]
    }

    RelaySession --> hasDevice: device_join()
    state hasDevice {
        [*] --> Active
        Active --> hasDevice: additional_device_join()
        Active --> Dropped: capacity_exceeded
        Active --> Disconnected: device_left()
        Disconnected --> Active: device_rejoin()
        Dropped --> [*]
    }

    hasDevice --> RelaySession: all_devices_left
    RelaySession --> [*]: expired_and_no_devices
```
