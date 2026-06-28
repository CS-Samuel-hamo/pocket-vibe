# Runtime 联调手册

本手册用于 Pocket Vibe v1 的真实 runtime 联调。

适用范围：
- `codex-cli`
- `claude-code`
- `opencode`
- `antigravity`

统一前提：
- VS Code bridge 已连接到 Pocket Vibe backend。
- 手机端已扫码进入同一 session。
- runtime 通过 VS Code 终端或扩展宿主运行。
- 当前阶段不继续扩功能，只验证“观察 + 审批 + 派发”的闭环是否可靠。

配套文档：
- [Runtime 联调结果](/D:/AI_projects/Pocket_Vibe/docs/runtime_联调结果.md)
- [Runtime 联调记录模板](/D:/AI_projects/Pocket_Vibe/docs/runtime_联调记录模板.md)
- [codex-cli 验收清单](/D:/AI_projects/Pocket_Vibe/docs/runtime_验收_codex-cli.md)

## 1. 能力矩阵

每个 runtime 都必须逐项验证以下能力：
- `prompt.submit`
- `workspace.focus`
- `context.request/result`
- `approval.request/response`
- `kill.request/result`
- `run_script`

结果只能归类为：
- `full`
  - 行为正确。
  - UI 展示与实际一致。
  - 不需要人工补救。
- `degraded`
  - 能完成部分目标，但存在明确降级路径。
  - UI 必须显示降级原因。
- `unsupported`
  - 当前 runtime 不支持该能力。
  - UI 必须禁用相关操作并展示原因。

## 2. 验收顺序

按以下顺序推进，不并行扩面：
1. `codex-cli`
2. `claude-code`
3. `opencode`
4. `antigravity`

每完成一个 runtime，都要先补结果记录，再决定是否进入下一个 runtime。

## 3. 统一失败判定

以下情况都算失败，不允许记为“基本可用”：
- 手机发起操作后，桌面没有明确执行结果。
- 桥接层 silently fallback，没有把降级原因显示到 UI。
- 审批和 Kill 依赖猜测命令格式，没有稳定确认链路。
- 手机端按钮可点击，但 runtime 实际不支持该能力。
- 桌面执行失败，但手机端没有看到 `execution.event` 或明确错误原因。

## 4. 终端型 runtime 的默认预期

`codex-cli`、`claude-code`、`opencode`、`antigravity` 当前都按终端型 runtime 验证，默认策略应为：
- `dispatch_mode = raw_prompt`
- `approval_mode = terminal_yes_no`
- `interrupt_mode = ctrl_c`
- `health = ready | degraded | offline`

如果实际不满足上面任一条件，必须在结果记录中写明：
- 偏差能力项
- 失败原因
- 是否需要代码修复
- 是否只能降级为 `unsupported`

## 5. 最小联调矩阵

对每个 runtime 至少执行以下步骤：
1. 从手机端发送一个简短 `prompt.submit`。
2. 从手机端触发 `workspace.focus` 跳转到一个已存在文件。
3. 请求一次 `context.request/result`，确认返回片段正确。
4. 模拟一次审批链路，确认 `approval.request/response` 有往返结果。
5. 触发一次 `kill.request/result`，确认中断行为明确。
6. 从手机端发一次 `run_script`，确认执行、拒绝或降级都有明确信号。

## 6. 记录要求

每次联调结束后，必须同步更新：
- [Runtime 联调结果](/D:/AI_projects/Pocket_Vibe/docs/runtime_联调结果.md)
- [.steward 活跃计划](/D:/AI_projects/Pocket_Vibe/.steward/reports/workstreams/pocket-vibe-v1-active-plan.md)
- [tasks/todo.md](/D:/AI_projects/Pocket_Vibe/tasks/todo.md)

至少记录：
- runtime 名称
- 每个能力项的 `full` / `degraded` / `unsupported`
- 最近一次失败原因
- 对应证据路径
- 下一步动作
