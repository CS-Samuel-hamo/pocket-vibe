# Pocket Vibe 远程接入指南

更新时间：2026-04-19

## 当前受支持的远程路径

Pocket Vibe v1 目前明确支持这两条路径：

1. `Tailscale / ZeroTier`
   适合你希望手机和电脑进入同一私网，路径最稳，调试成本最低。

2. `Cloudflare 双入口`
   适合你已经有 Cloudflare Tunnel，愿意同时给前端和后端各提供一个公网入口。

## 当前不支持的旧思路

下面这个做法不再算“受支持路径”：

- 只把 backend 暴露到公网，但手机仍从电脑局域网地址加载前端页面。

原因很直接：

- 手机要先能打开前端页面。
- 手机还要能访问 backend HTTP 地址。
- 手机还要能连上 backend WebSocket 地址。

只暴露 backend，不暴露 frontend，页面本身就打不开，链路不完整。

## 方案选择

优先级建议：

1. 你自己长期用，优先 `Tailscale / ZeroTier`
2. 你想在公网临时分享或跨网络接入，选 `Cloudflare 双入口`

## 方案 A：Tailscale / ZeroTier

### 适用条件

- 手机和电脑都能安装 Tailscale 或 ZeroTier
- 你接受手机和电脑通过私网地址通信

### 步骤

1. 让手机和电脑加入同一个 Tailscale / ZeroTier 网络。
2. 记下电脑的私网地址或域名。
   例如：
   - `100.88.12.34`
   - `my-pc.tailnet.ts.net`
3. 在仓库根目录运行：

```powershell
.\scripts\prepare_remote_access.ps1 -Provider tailscale -AccessHost 100.88.12.34 -Token vibe-safe
```

4. 脚本会输出：
   - `.env` 片段
   - 手机手动连接需要填写的 `Session Token / Backend WS / API Base / Frontend URL`
5. 把输出的 `.env` 片段写入项目 `.env`
6. 重新启动：

```powershell
.\start.ps1
```

7. 手机上有两种进入方式：
   - 打开桌面端新的 `Mobile Link`
   - 在手机页面点 `Link`，手动输入脚本输出的连接字段

### 预期结果

- 手机能打开前端页面
- 手机顶部显示 `Bridge: online`
- runtime 能显示 `ready / degraded / offline`
- 手机发 prompt 后，桌面端 runtime 有反应

## 方案 B：Cloudflare 双入口

### 适用条件

- 你已经会或愿意用 Cloudflare Tunnel
- 你能同时提供：
  - 一个前端公网地址
  - 一个 backend 公网地址

### 最小要求

你至少需要这两个地址：

- `PUBLIC_FRONTEND_URL`
  例：`https://pocket-vibe-ui.example.com`
- `PUBLIC_API_BASE_URL`
  例：`https://pocket-vibe-api.example.com`

通常 `PUBLIC_BACKEND_WS_URL` 对应：

- `wss://pocket-vibe-api.example.com/ws`

### 步骤

1. 先准备好前端和 backend 的公网入口。
2. 在仓库根目录运行：

```powershell
.\scripts\prepare_remote_access.ps1 `
  -Provider cloudflare `
  -FrontendUrl https://pocket-vibe-ui.example.com `
  -ApiBaseUrl https://pocket-vibe-api.example.com `
  -Token vibe-safe
```

3. 把输出的 `.env` 片段写入项目 `.env`
4. 重新启动：

```powershell
.\start.ps1
```

5. 手机打开新的 `Mobile Link`，或者进入 `Link` 手动连接页填入字段。

### 注意

- 只给 backend 开 Tunnel，不够。
- 前端页面也必须从手机可访问的公网地址加载。

## 脚本说明

辅助脚本：

- [prepare_remote_access.ps1](/D:/AI_projects/Pocket_Vibe/scripts/prepare_remote_access.ps1)

它会做这几件事：

- 规范化 `PUBLIC_FRONTEND_URL`
- 规范化 `PUBLIC_API_BASE_URL`
- 规范化 `PUBLIC_BACKEND_WS_URL`
- 输出可复制的 `.env` 片段
- 输出手机端手动连接字段

### 常见用法

Tailscale：

```powershell
.\scripts\prepare_remote_access.ps1 -Provider tailscale -AccessHost 100.88.12.34 -Token vibe-safe
```

Cloudflare：

```powershell
.\scripts\prepare_remote_access.ps1 `
  -Provider cloudflare `
  -FrontendUrl https://pocket-vibe-ui.example.com `
  -ApiBaseUrl https://pocket-vibe-api.example.com `
  -Token vibe-safe
```

写入独立文件：

```powershell
.\scripts\prepare_remote_access.ps1 `
  -Provider tailscale `
  -AccessHost 100.88.12.34 `
  -Token vibe-safe `
  -WriteEnv `
  -EnvPath .\.env.remote.local
```

## 联调检查表

每次远程接入，至少检查这 5 项：

1. 手机能打开 `PUBLIC_FRONTEND_URL`
2. 手机能访问 `PUBLIC_API_BASE_URL`
3. 手机能连上 `PUBLIC_BACKEND_WS_URL`
4. 手机页面顶部能看到 `Bridge: online`
5. `CODEX CLI` 能收到并回复测试 prompt

推荐测试 prompt：

```text
reply with exactly: POCKET_VIBE_REMOTE_OK
```

## 失败时先看哪里

1. 页面打不开
   先检查 `PUBLIC_FRONTEND_URL`

2. 页面能打开但显示断开
   先检查 `PUBLIC_BACKEND_WS_URL`

3. 页面能连上但手机不能控制桌面
   先检查 VS Code bridge 是否使用同一个 token 和同一个 backend

4. runtime 无反应
   先检查 `codex-cli` 终端是否真的在桌面端附着，并确认 runtime 状态不是 fallback

## 当前产品边界

Pocket Vibe v1 现在已经有：

- 手动连接页
- 已保存连接恢复
- runtime 显式状态
- 手机端基础诊断

但还没有：

- 官方自带 relay 服务
- 一键创建公网 tunnel
- 自动探测和修复远程网络环境

所以当前最佳实践仍然是：

- 私人长期使用：优先 Tailscale / ZeroTier
- 公网临时分享：用 Cloudflare 双入口
