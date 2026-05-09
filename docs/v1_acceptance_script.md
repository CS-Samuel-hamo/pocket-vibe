# Pocket Vibe v1 验收脚本

Updated: 2026-05-04

这是 v1 唯一验收路径，只验证参考链路：

`手机 PWA -> FastAPI 后端 -> VS Code bridge -> codex-cli`

不要用这份脚本验收额外 runtime、原生桌面 App、dashboard 或新的宿主类型。如果这条参考链路失败，先修参考链路，不要继续扩平台。

## 1. 桌面自动化 Gate

在仓库根目录运行：

```powershell
.\scripts\v1_desktop_gate.ps1
```

必须全部通过：

- 后端测试：`python -m pytest tests -q`
- 前端能力测试：`npm run test:capabilities`
- 前端生产构建：`npm run build`
- VS Code bridge runtime 测试：`npm run test:runtime`
- 仓库质量门禁：`python scripts\quality_gate.py <tracked code files>`

当前最近一次自动化结果：2026-05-04 已通过。命令结束后的 Conda/GBK shell-hook 噪声属于本机环境问题，不算项目 gate 失败。

## 2. 启动参考链路

在仓库根目录运行：

```powershell
.\start.ps1
```

桌面端应看到：

- 默认产品模式会先构建手机 PWA，并由后端在 `/app/` 直接托管。
- 后端监听 `8000`。
- 后端打印 token、手机 URL、配对页 URL。
- 浏览器配对页可以打开，并显示可扫描二维码或直连地址。

不要扫终端里的 ASCII QR。只使用浏览器配对页二维码，或直接在手机浏览器输入 mobile URL。

如果需要前端开发模式，运行：

```powershell
.\start.ps1 -Dev
```

开发模式会继续使用 Vite 的 `5173` 端口。

## 3. 连接 VS Code Bridge

在 VS Code 中确认：

1. 打开本仓库工作区。
2. Pocket Vibe bridge 扩展已启动。
3. `pocketVibe.backendWsUrl` 是 `ws://127.0.0.1:8000/ws`。
4. `pocketVibe.authToken` 等于后端打印的 token。
5. `pocketVibe.preferredRuntime` 是 `codex-cli`。
6. 已启动或 attached 到 `codex-cli` runtime。

手机端应看到：

- `Host ready` 或对应中文就绪状态。
- 当前项目是 `Pocket_Vibe`。
- 当前运行时是 `Codex CLI`。
- 如果运行时降级或不可用，UI 必须显示原因，不能静默失败。

## 4. 手机端五分钟验收

在真实手机上执行：

1. 打开 mobile URL，或扫描浏览器配对页二维码。
2. 在底部输入框发送：

```text
reply with exactly: POCKET_VIBE_V1_OK
```

3. 确认手机 Console 出现包含 `POCKET_VIBE_V1_OK` 的 AI 回复。
4. 打开 `+` 工具入口，再打开 `搜索文件`。
5. 搜索 `README.md`。
6. 打开文件预览，确认手机上能看到文件内容。
7. 打开 `Vibe 技能`。
8. 发送 `项目简报`。
9. 确认手机显示有用的 Codex 回复，或明确的 runtime 失败原因。
10. 返回首页，确认 Kill 按钮状态和运行时能力一致。
11. 如果 `Kill` 可用，点击后应看到 `kill.result` 或明显的中断结果。
12. 如果 `Kill` 不可用，按钮必须禁用或给出不可用原因。

## 5. 通过标准

只有同时满足以下条件，v1 验收才算通过：

- 桌面自动化 gate 不带 skip 参数通过。
- 手机 prompt 往返成功，并返回指定短语。
- 手机文件搜索和文件预览可用。
- `项目简报` 能返回有用回复，或返回明确失败原因。
- Kill 状态符合 capability：可用时能执行，不可用时禁用或显示原因。
- 没有任何关键动作静默失败。
- 准备 release 时，Git 范围不包含日志、本地数据库、截图、临时文件、VS Code 用户数据。

## 6. 记录验收证据

把结果记录到 `docs/runtime_联调结果.md` 或当前 runtime 验收文件，至少包含：

- 日期和机器。
- 手机网络路径：LAN、VPN、Tailscale、Cloudflare Tunnel 或其他。
- 前端 URL 和后端 URL 形态，不记录 secret。
- 手机上显示的当前 runtime。
- prompt 往返结果。
- 文件预览结果。
- Vibe 技能结果。
- Kill 结果或不可用原因。
- UI 中显示的任何失败原因。

## 7. 停止规则

如果这条参考链路失败，不要新增平台、面板或技能。先修失败点，再继续扩展。
