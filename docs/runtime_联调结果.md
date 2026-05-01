# Runtime 联调结果

最后更新：2026-04-24

当前策略：
- 先把 `codex-cli` 作为真实 runtime 基线收口。
- 只把有明确证据的能力标为已验证；审批、Kill、脚本执行仍需按验收清单逐项手测。
- `codex-cli` 收口后，再进入 `claude-code`、`opencode`、`antigravity`。

## 总览

| Runtime | 状态 | 最近结论 | 下一步 |
| --- | --- | --- | --- |
| `codex-cli` | partial-validated | 2026-04-24 手机端已验证 prompt 往返，收到 `POCKET_VIBE_HOME_OK`；自动化测试通过。其余能力仍需专项验收 | 完成 `workspace.focus`、审批、Kill、脚本执行四项手测 |
| `claude-code` | blocked-command-not-found | 2026-04-16 未在 PATH 中发现 `claude` 或 `claude-code` | 安装或补 PATH 后再进入矩阵 |
| `opencode` | pending-local-validation | 2026-04-16 已确认本机可发现 `opencode`，但 `opencode --version` 在当前 shell 超时 | 等待 `codex-cli` 首轮基线结果后验证 |
| `antigravity` | pending-local-validation | 2026-04-16 已确认本机可发现 `antigravity`，但 `antigravity --version` 在当前 shell 超时 | 等待 `codex-cli` 首轮基线结果后验证 |

## 命令发现结果

| Runtime | 发现结果 | CLI smoke | 发现路径 |
| --- | --- | --- |
| `codex-cli` | found | `codex --version` failed: `Access is denied` | `C:\Program Files\WindowsApps\OpenAI.Codex_26.409.7971.0_x64__2p2nqsd0c76g0\app\resources\codex.exe` |
| `claude-code` | missing | 无法执行 | 未发现 `claude` 或 `claude-code` |
| `opencode` | found | `opencode --version` timed out in current shell | `D:\Anaconda\opencode.ps1` |
| `antigravity` | found | `antigravity --version` timed out in current shell | `D:\office partners\Antigravity\bin\antigravity.cmd` |

## codex-cli

| 能力 | 结果 | 备注 |
| --- | --- | --- |
| `prompt.submit` | full | 手机端发送 `reply with exactly: POCKET_VIBE_HOME_OK` 后，Codex CLI 返回预期内容；UI 已区分 user / AI / system 事件 |
| `workspace.focus` | pending | 需要从手机触发文件定位，并确认 VS Code 桌面端打开对应文件和行号 |
| `context.request/result` | full | 手机端 Workspace Reader 已能读取项目文件内容；仍建议在最终验收中补一条固定文件/行号用例 |
| `approval.request/response` | pending | 待本机联调 |
| `kill.request/result` | pending | 待本机联调 |
| `run_script` | pending | 脚本发现和独立桌面 shell 路由已实现；还需要从手机实际执行一条安全脚本并记录结果 |

## 2026-04-24 自动化检查

| 检查 | 结果 |
| --- | --- |
| `pytest tests -q` | 45 passed |
| `cd frontend && npm run test:capabilities` | 39 passed |
| `cd vscode-bridge && npm run test:runtime` | passed |
| `cd frontend && npm run build` | passed |

## claude-code

| 能力 | 结果 | 备注 |
| --- | --- | --- |
| `prompt.submit` | pending | 等待顺序推进 |
| `workspace.focus` | pending | 等待顺序推进 |
| `context.request/result` | pending | 等待顺序推进 |
| `approval.request/response` | pending | 等待顺序推进 |
| `kill.request/result` | pending | 等待顺序推进 |
| `run_script` | pending | 等待顺序推进 |

## opencode

| 能力 | 结果 | 备注 |
| --- | --- | --- |
| `prompt.submit` | pending | 等待顺序推进 |
| `workspace.focus` | pending | 等待顺序推进 |
| `context.request/result` | pending | 等待顺序推进 |
| `approval.request/response` | pending | 等待顺序推进 |
| `kill.request/result` | pending | 等待顺序推进 |
| `run_script` | pending | 等待顺序推进 |

## antigravity

| 能力 | 结果 | 备注 |
| --- | --- | --- |
| `prompt.submit` | pending | 等待顺序推进 |
| `workspace.focus` | pending | 等待顺序推进 |
| `context.request/result` | pending | 等待顺序推进 |
| `approval.request/response` | pending | 等待顺序推进 |
| `kill.request/result` | pending | 等待顺序推进 |
| `run_script` | pending | 等待顺序推进 |
