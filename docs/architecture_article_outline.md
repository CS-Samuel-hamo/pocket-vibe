# 架构文章大纲

> 目标平台：V2EX / 知乎（中文版）、HackerNews / Dev.to（英文版）
> 定位：深度技术文章，不是产品推广。面向有 3+ 年后端经验的工程师
> 字数：中文 4000-6000 字，英文 2000-3000 words

---

## 标题备选

**中文：**
1. 《从零构建一个手机远程控制 AI 编码的系统——架构实录》
2. 《传输无关、端到端加密、八种运行时适配：一个 AI 远程控制面板的架构拆解》
3. 《不做产品，做作品：一个开源参考实现的架构选择》

**英文：**
1. "How I Built a Phone Remote Control for AI Coding Assistants"
2. "Transport-Agnostic State Machines, Cross-Platform E2EE, and 8 Runtime Adapters: An Architecture Deep Dive"
3. "Building a Mobile Control Plane for AI Coding Workflows: Reference Architecture"

---

## 文章结构

### 1. 引子：起因与 scope

**核心问题：** 当 AI 编码助手在桌面端运行时，开发者离开电脑后就无法观察、引导、干预。需要一个手机端遥控器。

**为什么不直接用现成的？**
- OpenAI Codex Mobile：只绑 Codex，云端中继，不透明
- Claude Code Remote Control：只绑 Claude Code，$100/月起
- 其他第三方：要么闭源、要么有云依赖、要么只支持一种运行时
- **想要的：** 自托管、E2EE、多运行时、能完全掌控数据

**但最终发现：** 这个赛道已经挤满了玩家。所以决定：不做产品，作为开源参考实现公开。—— 这段话本身也是 Hook，引出"商业 vs 技术"的思考

### 2. 顶层架构：四层模型

```
Phone PWA → FastAPI Backend → VS Code Extension → AI Runtime
```

简短说明每层的职责。点上关键数字：
- 后端 ~28 个 Python 文件，每个 <200 行
- 前端 1 个 PWA 入口 + 10+ hooks/utils
- VS Code 扩展 15 个 TypeScript 模块
- 测试 48 个文件（Python 33 + JS 11 + TS 4）

**设计原则：**
- 洋葱架构（六边形）分层
- 传输无关的领域模型
- 依赖注入通过 frozen dataclass
- 防御性复制防止调用者意外变异

### 3. 核心亮点一：传输无关的中继状态机（relay_core.py）

**这是全文最值得仔细讲的部分。**

```python
# relay_core.py 没有导入 HTTP、WebSocket、FastAPI 或任何网络库
# 所有依赖都是注入的：
# - clock → 时间判断（过期、超时）
# - id_factory → 生成唯一 ID
# - code_factory → 生成配对码
```

**为什么这么设计？**
- 测试不需要开端口、不需要 mock WebSocket、不需要跑服务器
- 同样的核心可以用 HTTP、WebSocket、gRPC、甚至文件管道作为传输层
- 状态迁移可以用状态图可视化

**代码展示：** 展示 PairingChallenge → RelaySession → RelayDevice → RelayMessage 的状态流转。

**测试验证：** 36 行测试覆盖所有边缘情况（过期、消费、容量、撤销、加密强制）。

**可提取性：** 这个文件可以独立成 pip 包，给任何需要配对 + 中继状态机的项目使用。

### 4. 核心亮点二：跨平台端到端加密

**问题：** 手机浏览器和 Python 后端之间需要加密。WebSocket 本身是明文（WS://，非 WSS://），且 LAN 环境可能不可信。

**方案：** X25519 ECDH + HKDF + AES-256-GCM，分别在 Python（cryptography 库）和 JavaScript（Web Crypto API）各实现一次。

**技术细节：**
- 密钥交换流程：手机生成 ephemeral key pair → 发公钥 → 后端生成 ephemeral key pair → 发公钥 → 双方派生 shared secret
- 完美前向保密（PFS）：每次会话重新生成密钥对
- 匹配的 salt/info 字符串 (`vibe-salt-2026`, `pocket-vibe-e2ee`)
- 优雅降级：非安全上下文（HTTP）或密钥交换失败时自动回退到明文

**对比替代方案：**
- 用 TLS/WSS：需要证书管理，LAN 环境证书信任链复杂
- 用应用层 E2EE：不依赖传输层安全，证书问题与应用解耦

**代码展示：** 对比 Python 和 JS 两段 encrypt/decrypt 代码，展示相同的算法链。

### 5. 核心亮点三：八种运行时的策略模式适配

**问题：** 市面上的 AI 编码工具有不同的交互方式（终端进程 vs IDE 扩展）、不同的能力集（有的支持 approve，有的不支持）、不同的启动方式。

**方案：** 定义统一的 `RuntimeAdapter` 接口：

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

| 类型 | 运行时 | 实现方式 |
|------|--------|---------|
| 原生终端 | codex-cli | 进程 spawn + 终端 API |
| 原生终端 | claude-code | 进程 spawn + 终端 API |
| 原生终端 | opencode | 进程 spawn + 终端 API |
| 原生终端 | antigravity | 进程 spawn + 终端 API |
| 扩展后备 | Continue | VS Code 扩展 API |
| 扩展后备 | Cline | VS Code 扩展 API |
| 扩展后备 | Roo Code | VS Code 扩展 API |
| 扩展后备 | Copilot | 剪贴板桥接（受限） |

**健康状态推导：** 每个运行时有一个 `RuntimeDescriptor`，综合它是否安装、是否在运行、是否能启动，推导出 ready / degraded / offline 三种状态，UI 据此显示或隐藏功能。

**选择算法：** `selectActiveRuntime` 的优先级：首选 → 活动终端 → 第一个就绪 → 第一个降级。封装了合理的默认行为。

### 6. 核心亮点四：模块化的连接管理器

**一个问题：** WebSocket 连接管理很容易变成上帝类——管理房间、路由消息、处理断开、跟踪状态、限流、缓冲——全在一个文件里。

**解法：** 拆成 8 个文件，每个一个职责：

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

再加上依赖注入通过 frozen dataclass：

```python
@dataclass(frozen=True)
class ConnectionManagerDependencies:
    connected: dict[str, set[Peer]]
    rooms: dict[str, Room]
    message_buffer: MessageBuffer
    rate_limiter: TokenBucket
    logger: Callable[..., None]
```

**为什么这个模式值得借鉴：**
- 每个文件可以独立单元测试
- 新增功能不需要改现有代码——加一个新文件即可
- frozen dataclass 保证依赖不会在运行时被替换

### 7. 其他值得一提的设计决策

- **Protocol 消息规范化：** Python 的 `normalize_protocol_message` 函数处理 v0→v1 的协议迁移，用 `dict(message)` 防御性复制，防止调用者引用修改
- **Ring Buffer 消息回放：** 基于 seq_id 的断线重连恢复，容量 500 条
- **Token Bucket 限流：** 30/秒，不依赖外部 Redis 或数据库
- **PWA 而非原生 App：** 避免 App Store 审核、跨平台一致体验、但牺牲了原生推送和 Dynamic Island/灵动岛
- **LAN 优先的配对流程：** 自动推断局域网地址 + QR 码配对，远程通过 Tailscale/Cloudflare Tunnel 可选

### 8. 商业化反思（坦诚环节）

**坦白：** 这个项目在商业上不太成立。

**三个原因：**
1. 官方入场免费送（OpenAI Codex Mobile 免费，Claude RC 虽然付费但有品牌效应）
2. 开源赛道有先行者（Hapi 已经完成了一键安装和社区传播）
3. 第三方产品已经 App Store 上架（Forge Remote 等有付费用户）

**所以决定：不做产品，做作品。**

把代码库作为面向开发者的参考架构开源，并写这篇文章分享背后的架构决策。如果你在构建类似的实时消息系统、E2EE 配对协议、或多运行时适配层，这里面的模式可以直接复用。

### 9. 结论与资源

- GitHub 仓库链接
- 关键文件快速导航（★ 标注）
- 适合谁读：想学习六边形架构的 Python 开发者、需要跨平台 E2EE 实现参考的工程师、构建 VS Code 扩展的 TypeScript 开发者
- 延伸阅读建议

---

## 发布建议

| 平台 | 版本 | 建议时间 | 说明 |
|------|------|---------|------|
| V2EX | 中文 | 工作日上午 10-11 点 | 发布在「分享创造」节点 |
| 知乎 | 中文 | 周末 | 专栏文章，配架构图 |
| HackerNews | 英文 | 美国东部时间早 8-9 点 | Show HN 标签 |
| /r/programming | 英文 | 周末 | 直接发链接，标题要技术性强 |
| Dev.to | 英文 | 随时 | 完整转载 |

---

## 需要的配图

1. **架构全景图**（四层 + 数据流）—— 已有关 README 中的 ASCII 图，但建议用 draw.io 或 Excalidraw 重绘
2. **relay_core 状态图** —— PairingChallenge → RelaySession → RelayDevice 的状态流转，用 Mermaid 即可
3. **E2EE 密钥交换时序图** —— 手机 ↔ 后端之间的 X25519 握手流程
4. **Runtime 适配器类图** —— 接口 + 8 个实现 + 工厂函数
5. **连接管理器拆分解读** —— 8 个文件的关系图
6. **最终提交前的根目录截图对比** —— 清理前 vs 清理后

---

## 发布检查清单

- [ ] 用 draw.io 或 Excalidraw 重绘架构图
- [ ] 确认 GitHub 仓库 README 已经更新（✅ 已完成）
- [ ] 确认根目录已经清理（✅ 已完成）
- [ ] 补充 LICENSE 文件
- [ ] 补充贡献指南
- [ ] 本地构建验证（`pytest tests -q` 绿色通过）
- [ ] 英文版需要 native speaker proofread（可以用 Claude 润色）
