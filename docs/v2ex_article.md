# 从零构建一个手机远程控制 AI 编码的系统——架构实录

> 这不是一个商业产品，这是一份开源参考实现。
> 仓库：https://github.com/CS-Samuel-hamo/pocket-vibe

---

## 起因

先说一下我在做什么。

AI 编码助手（Claude Code、Codex CLI、Cursor 等）跑在桌面端的时候，开发者离开电脑就断了联系。看不到输出、发不了指令、批不了审批。这事挺烦的——尤其是 AI 跑一个长任务要好几分钟，你只能守着键盘。

市面上已经有方案了：
- OpenAI Codex Mobile：免费，但只能绑 Codex
- Claude Code Remote Control：$100/月起，只绑 Claude Code
- Forge Remote / Hapi 等第三方工具：要么闭源有云依赖，要么只支持特定运行时

我想要的其实很简单：**自托管、E2EE、多运行时兼容、不要云服务**。

于是写了 Pocket Vibe——一个手机 PWA 通过 WebSocket 远程控制桌面 AI 运行时的系统。当时没想商业化的事，纯粹是技术探索。

做完之后发现一个尴尬的事：**这个赛道已经挤满了玩家，商业化没空间了。**

但同时我也发现：**这个代码库的架构质量其实不错，把它当产品卖不划算，但当一个开源参考实现分享出去，价值更大。**

于是这篇文章就来了。不讲功能，讲架构决策。

---

## 顶层架构：四层模型

```
手机 PWA → FastAPI 后端 → VS Code 插件 → AI 运行时
     ↑           ↑              ↑             ↑
  WebSocket   WebSocket       Terminal      进程
  + E2EE      LAN 中转        API           spawn
```

每一层的职责很清楚：
- **手机 PWA**：React + antd-mobile，纯展示和控制，不存状态
- **后端**：FastAPI，WebSocket 路由 + 协议转发 + E2EE 端点
- **VS Code 插件**：TypeScript，运行时检测和适配，通过 Terminal API 与 AI 交互
- **AI 运行时**：实际干活的（Codex CLI / Claude Code / OpenCode / Antigravity）

几个设计原则贯穿始终：
1. **洋葱架构**：基础设施在最外层，领域模型在最内层，依赖方向从外指向内
2. **传输无关**：核心逻辑不依赖 HTTP、WebSocket 或任何网络库
3. **能力驱动 UI**：手机界面上什么功能可用，取决于运行时实际支持什么

---

## 亮点一：传输无关的中继状态机（60 分的技术活，100 分的架构设计）

这是最值得看的一个文件：`backend/relay_core.py`。

市面上的 WebSocket 中继，大部分把状态机和网络层揉在一起。测试你得开端口、 mock 连接、搞异步超时。烦。

这个文件的做法是——**不导入任何和网络有关的东西**。

```python
@dataclass(frozen=True)
class RelayCoreDependencies:
    clock: Callable[[], float]       # 注入时间
    id_factory: Callable[[], str]    # 注入 ID 生成器
    code_factory: Callable[[], str]  # 注入配对码生成器

class RelayCore:
    def __init__(self, deps: RelayCoreDependencies):
        self._clock = deps.clock
        self._id_factory = deps.id_factory
        self._code_factory = deps.code_factory
        self._sessions: dict[str, RelaySession] = {}
```

所有的状态都是普通 dataclass，所有的时间判断都走注入的 clock，所有的唯一 ID 都走注入的 id_factory。

**这意味着什么？**

1. 测试不需要开端口、不需要 mock WebSocket、不需要跑服务器
2. 同样的核心可以用 HTTP、WebSocket、gRPC、甚至文件管道作为传输层
3. 状态迁移可以用状态图精确描述
4. 36 行测试覆盖了所有边缘情况（过期、消费、容量、撤销、加密强制）

状态流转：

```
Idle → PairingChallenge → RelaySession → Device  连接
                       ↘ 过期/撤销 → Idle
                                    ↘ 断开 → DeviceLeft → 重连 or 关闭
```

这个文件可以独立成 pip 包，给任何需要配对 + 中继状态机的项目使用。

---

## 亮点二：跨平台端到端加密（Python 和 JavaScript 匹配实现）

手机浏览器和后端之间的通信需要加密。WebSocket 明文（ws://）在 LAN 环境下可能不可信，WSS 需要证书管理又太麻烦。

方案：**应用层 E2EE**，X25519 ECDH + HKDF + AES-256-GCM。

分别在两个平台上完整实现：

| 平台 | 文件 | 技术栈 |
|------|------|--------|
| Python | `src/core/crypto.py` | `cryptography` 库 |
| 浏览器 | `frontend/src/crypto.js` | Web Crypto API |

**握手流程：**

```
手机 → 生成 ephemeral key pair → 发公钥给后端
后端 → 生成 ephemeral key pair → 发公钥给手机
双方 → deriveSharedSecret() → AES-256-GCM 加密通信
```

关键属性：
- **完美前向保密（PFS）**：每次会话重新生成 key pair，历史通信不会被未来的密钥泄露影响
- **salt/info 字符串匹配**：`vibe-salt-2026` + `pocket-vibe-e2ee`，在两套代码库中严格一致
- **优雅降级**：非安全上下文（HTTP）或密钥交换失败时自动回退到明文

对比替代方案：
- 用 TLS/WSS：配证书在 LAN 环境下很麻烦，自签名证书手机端要导入信任链
- 用应用层 E2EE：证书问题和传输层解耦，手机浏览器原生支持 Web Crypto

**写了两套实现这件事本身的价值：** 如果你需要在 Python 服务和浏览器客户端之间加 E2EE，这个配对实现可以直接抄走。

---

## 亮点三：八种运行时的策略模式适配

这是 VS Code 插件里最核心的部分。

市面上的 AI 编码工具有不同的交互方式（终端进程 vs IDE 扩展）、不同的能力集（有的支持 approve，有的不支持）、不同的启动方式。

定义统一的接口：

```typescript
interface RuntimeAdapter {
  sendPrompt(text: string): Promise<void>;
  runScript(script: string, cwd: string): Promise<void>;
  approve(): Promise<void>;
  kill(): Promise<void>;
  findTerminal(): vscode.Terminal | undefined;
  ensureRunning(): Promise<void>;
}
```

然后对 8 种运行时各自实现：

| 类型 | 运行时 | 实现方式 | 能力级别 |
|------|--------|---------|---------|
| 原生终端 | codex-cli | 进程 spawn | 完整 |
| 原生终端 | claude-code | 进程 spawn | 完整 |
| 原生终端 | opencode | 进程 spawn | 完整 |
| 原生终端 | antigravity | 进程 spawn | 完整 |
| 扩展后备 | Continue | VS Code 扩展 API | 受限 |
| 扩展后备 | Cline | VS Code 扩展 API | 受限 |
| 扩展后备 | Roo Code | VS Code 扩展 API | 受限 |
| 扩展后备 | Copilot | 剪贴板桥接 | 最受限 |

每个运行时还有一个 `RuntimeDescriptor`，综合它是否安装、是否在运行、是否能启动，推导出三种健康状态：

```
ready → UI 完全可用
degraded → 功能受限，显示原因
offline → 完全不可用，告知用户如何安装
```

**选择算法：** `selectActiveRuntime` 的优先级：
```
首选运行时 → 当前活动终端 → 第一个就绪的 → 第一个降级的
```

这个算法封装了合理的默认行为——如果你同时在跑 codex-cli 和 claude-code，它优先用你指定的。

---

## 亮点四：模块化的连接管理器

WebSocket 连接管理很容易变成一个上帝类——管理房间、路由消息、处理断开、跟踪状态、限流、缓冲——全在一个文件里。

我这里拆成了 **8 个文件，每个文件一个职责**：

```
connection_manager.py      — 编排入口，组合各模块
connection_state.py        — 房间状态的可变容器
connection_registry.py     — 查询/迭代辅助函数
connection_peers.py        — 基于房间的对等过滤
connection_disconnect.py   — 断开的清理逻辑
connection_preflight.py    — 连接前的条件检查
connection_rooms.py        — 房间生命周期管理
connection_count.py        — 连接计数与限流
```

依赖注入通过 frozen dataclass：

```python
@dataclass(frozen=True)
class ConnectionManagerDependencies:
    connected: dict[str, set[Peer]]
    rooms: dict[str, Room]
    message_buffer: MessageBuffer
    rate_limiter: TokenBucket
    logger: Callable[..., None]
```

这个模式的好处：
- 每个文件可以独立单元测试
- 新增功能不需要改现有代码——加一个新文件即可
- frozen dataclass 保证依赖不会在运行时被替换

---

## 亮点五：其他值得一提的设计决策

**Protocol 消息规范化** — Python 的 `normalize_protocol_message` 函数处理 v0→v1 的协议迁移，用 `dict(message)` 防御性复制，防止调用者引用修改。这行代码救了我两次。

**Ring Buffer 消息回放** — `message_buffer.py` 基于 seq_id 的断线重连恢复，容量 500 条。手机端断网后重连，自动请求回放丢失的消息。

**Token Bucket 限流** — 30/秒，不需要引入 Redis 或数据库依赖。一个 asyncio.Lock 就够了。

**PWA 而非原生 App** — 避开了 App Store 审核，跨平台一致体验。代价是牺牲了原生推送和 iOS 的 Dynamic Island，这是个值得的 trade-off。

**LAN 优先的配对流程** — 自动推断局域网地址 + QR 码配对，远程通过 Tailscale/Cloudflare Tunnel 可选。

---

## 为什么不做商业化

坦诚地说，这个项目在商业上不太成立，三个原因：

1. **官方入场免费送** —— OpenAI Codex Mobile 免费，Claude RC 虽然付费但有品牌势能
2. **开源赛道有先行者** —— Hapi 已经完成了 npm 一键安装和国内社区传播
3. **第三方产品已经上架** —— Forge Remote 等有付费用户、App Store 评分和持续迭代

所以决定：**不做产品，做作品。**

我觉得这样更有价值——把架构决策写下来，让需要构建类似系统的人能直接复用其中的模式。

---

## 适合谁读

- 想学 **六边形架构（洋葱架构）** 怎么在 Python 项目中落地的
- 需要 **跨平台 E2EE 实现参考**（Python + JS 匹配实现）的
- 构建 **VS Code 扩展** 并需要多进程管理的 TypeScript 开发者
- 对 **WebSocket 连接管理** 的模块化设计感兴趣的后端工程师

---

## 资源

- 仓库：https://github.com/CS-Samuel-hamo/pocket-vibe
- 快速开始：`QUICKSTART.md`
- 架构图：`docs/diagrams/` 目录下
- 最佳阅读路径：`relay_core.py` → `crypto.py / crypto.js` → `runtimeAdapters.ts` → `connection_manager.py`

---

*欢迎讨论、提 issue、PR。如果你也在做类似的东西，可以交流架构取舍。*
