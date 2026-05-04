export const PROMPT_SKILLS = [
    {
        id: 'project-brief',
        label: '项目简报',
        category: '观察',
        summary: '让当前运行时给出简短项目状态。',
        prompt: ({ projectName, runtimeLabel }) => [
            `请为 ${projectName} 生成 Pocket Vibe 项目简报。`,
            `当前运行时：${runtimeLabel}。`,
            '请用不超过 8 条要点说明：当前目标、下一步可以安全检查什么、可能阻塞点、以及唯一最值得做的下一步。',
            '如果信息不确定，请明确标出不确定性，不要猜测。',
        ].join(' '),
    },
    {
        id: 'risk-review',
        label: '风险审查',
        category: '审查',
        summary: '继续前先找出主要产品和工程风险。',
        prompt: ({ projectName }) => [
            `请审查 ${projectName} 是否接近可发布状态。`,
            '找出最重要的 3 个产品或工程风险。',
            '每个风险请说明：为什么重要、需要检查什么证据、以及一个可以从手机端批准的具体下一步。',
            '除非我后续明确批准，否则不要修改代码。',
        ].join(' '),
    },
    {
        id: 'acceptance-plan',
        label: '验收步骤',
        category: '验证',
        summary: '生成当前版本的手机端验收步骤。',
        prompt: ({ projectName }) => [
            `请为 ${projectName} 生成最小验收测试计划。`,
            '重点验证手机到桌面端的控制链路。',
            '请包含 5 个具体手机端步骤、预期桌面行为、可见成功信号和失败信号。',
            '保持实际、现在就能执行。',
        ].join(' '),
    },
    {
        id: 'failure-triage',
        label: '故障排查',
        category: '恢复',
        summary: '区分手机、后端、bridge、运行时和网络问题。',
        prompt: () => [
            '请排查当前 Pocket Vibe 会话中最新可见的失败或变慢问题。',
            '请区分可能层级：手机 UI、后端 API、WebSocket、VS Code bridge、运行时 CLI、模型/网络、或项目代码。',
            '按优先级给出接下来 3 个诊断动作，并说明每个结果分别意味着什么。',
        ].join(' '),
    },
    {
        id: 'diff-summary',
        label: '变更总结',
        category: '交付',
        summary: '总结当前变更、风险和验证缺口。',
        prompt: ({ projectName }) => [
            `请总结 ${projectName} 当前变更。`,
            '重点说明用户可见行为、涉及文件、风险区域、已经跑过的测试和仍需补充的验证。',
            '如果你无法直接检查 diff，请明确说明需要什么上下文，不要猜测。',
        ].join(' '),
    },
];

export function getPromptSkillContext({
    activeProject = null,
    activeRuntime = null,
    sessionInfo = {},
} = {}) {
    return {
        projectName:
            activeProject?.project_name ||
            sessionInfo.project_state?.project_name ||
            '当前项目',
        runtimeLabel:
            activeRuntime?.label ||
            activeRuntime?.id ||
            sessionInfo.active_runtime ||
            '当前运行时',
    };
}

export function buildPromptSkillCards(context = {}) {
    const normalizedContext = getPromptSkillContext(context);
    return PROMPT_SKILLS.map((skill) => ({
        ...skill,
        prompt: skill.prompt(normalizedContext),
    }));
}
