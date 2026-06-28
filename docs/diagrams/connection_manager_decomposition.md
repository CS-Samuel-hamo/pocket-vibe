# Connection Manager 模块分解

> `backend/connection_*.py` 的 8 个单职责文件关系图。
> 将以下 Mermaid 代码块渲染为流程图。

```mermaid
flowchart TB
    subgraph Entry["📋 Orchestration"]
        CM["connection_manager.py<br/>• init() → build components<br/>• route_message() → dispatch<br/>• handle_disconnect() → cleanup"]
    end

    subgraph State["💾 State Containers"]
        CS["connection_state.py<br/>• PeerSet · Room dicts<br/>• Mutable state"]
        CR["connection_registry.py<br/>• get_peers() · get_rooms()<br/>• find_peer_by_role()"]
    end

    subgraph Lifecycle["🔄 Lifecycle"]
        CD["connection_disconnect.py<br/>• remove_peer()<br/>• emit_leave_event()<br/>• reap_empty_rooms()"]
        CP["connection_preflight.py<br/>• check_api_reachable()<br/>• validate_token()<br/>• check_bridge_status()"]
    end

    subgraph Routing["🔀 Scoping"]
        CPeer["connection_peers.py<br/>• peers_in_room()<br/>• room_has_role()<br/>• filter_visible_peers()"]
        CRoom["connection_rooms.py<br/>• create_room() · find_room()<br/>• room_capacity()"]
    end

    subgraph Limits["📊 Monitoring"]
        CCount["connection_count.py<br/>• total_connections()<br/>• room_connection_count()<br/>• max_connections_reached()"]
    end

    %% Dependencies
    CS --> CM
    CR --> CM
    CPeer --> CM
    CRoom --> CM
    CCount --> CM
    CD --> CM
    CP --> CM

    %% Inject dependencies as frozen dataclass
    Deps["Deps = ConnectionManagerDependencies()<br/>@dataclass(frozen=True)"]
    Deps -.-> CM
```

### 依赖注入结构

```python
@dataclass(frozen=True)
class ConnectionManagerDependencies:
    connected: dict[str, set[Peer]]    # websocket → peer
    rooms: dict[str, Room]             # room_id → Room
    message_buffer: MessageBuffer      # ring buffer
    rate_limiter: TokenBucket          # 30/sec
    logger: Callable[..., None]        # structured logging
```
