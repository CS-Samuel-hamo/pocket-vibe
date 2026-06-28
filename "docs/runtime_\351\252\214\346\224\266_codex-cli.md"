# codex-cli 验收清单

目标：
- 把 `codex-cli` 作为首个真实 runtime 跑通完整闭环。
- 联调结果将作为后续 `claude-code`、`opencode`、`antigravity` 的基线。

## 验收前检查

- [ ] VS Code bridge 已连接 backend
- [ ] 手机端已进入同一 session
- [ ] VS Code 中存在名称包含 `codex` 的终端
- [ ] 当前 runtime catalog 中 `codex-cli` 可见
- [ ] `codex-cli` 的 `health` 不是 `offline`

## 验收步骤

### 1. prompt.submit

- [ ] 手机端发送一个简单 prompt
- [ ] 桌面终端收到完整 prompt
- [ ] 手机端看到对应 `execution.event`

失败即记录：
- 是否没有匹配到终端
- 是否写入了错误终端
- 是否发送后无执行反馈

### 2. workspace.focus

- [ ] 手机端选择一个已存在文件
- [ ] VS Code 打开对应文件并定位
- [ ] 手机端没有出现 silent failure

### 3. context.request/result

- [ ] 手机端请求当前文件上下文
- [ ] 返回内容包含预期文件路径和片段
- [ ] 不越界、不返回空结果

### 4. approval.request/response

- [ ] 触发一次审批请求
- [ ] 手机端能明确 approve / reject
- [ ] 桌面终端收到 `y` 或 `n`
- [ ] 手机端看到审批结果回执

### 5. kill.request/result

- [ ] 手机端点击 Kill
- [ ] 桌面终端收到 `Ctrl+C`
- [ ] 手机端收到明确成功或失败结果
- [ ] unsupported 时按钮已禁用

### 6. run_script

- [ ] 手机端发送脚本命令
- [ ] 桌面侧明确执行、拒绝或降级
- [ ] 手机端收到原因说明

## 通过标准

同时满足以下条件才算通过：
- 6 个能力项都有明确结果。
- 没有静默失败。
- UI 展示与实际执行结果一致。
- 若某项不能稳定支持，必须标成 `degraded` 或 `unsupported`，不能假装可用。

## 联调后更新

联调后必须同步更新：
- [Runtime 联调结果](/D:/AI_projects/Pocket_Vibe/docs/runtime_联调结果.md)
- [.steward 活跃计划](/D:/AI_projects/Pocket_Vibe/.steward/reports/workstreams/pocket-vibe-v1-active-plan.md)
- [tasks/todo.md](/D:/AI_projects/Pocket_Vibe/tasks/todo.md)
