# Pocket Vibe v1 Runtime Hardening Goal

更新时间：2026-04-16

目标：
- 把 Pocket Vibe v1 收敛到“VS Code 宿主优先的手机遥控层”。
- 在不继续扩功能面的前提下，完成 4 个目标 runtime 的真实联调收口。

完成定义：
- `codex-cli`、`claude-code`、`opencode`、`antigravity` 都有真实联调记录。
- 每个能力项都有 `full` / `degraded` / `unsupported` 结论。
- 手机端三态展示与真实行为一致。
- 审批和 Kill 没有静默失败。

当前原则：
- 先 `codex-cli`，后其他 runtime。
- 每完成一个 runtime，先记结果，再决定是否扩面。
- 没有联调结果前，不新增新能力。
