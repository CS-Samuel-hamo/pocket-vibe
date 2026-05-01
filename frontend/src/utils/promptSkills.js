export const PROMPT_SKILLS = [
    {
        id: 'project-brief',
        label: 'Project Brief',
        category: 'Observe',
        summary: 'Ask the active runtime for a concise status brief.',
        prompt: ({ projectName, runtimeLabel }) => [
            `Pocket Vibe project brief for ${projectName}.`,
            `Runtime: ${runtimeLabel}.`,
            'Give me a concise status brief with: current goal, what you can safely inspect next, likely blockers, and the single best next action.',
            'Keep it under 8 bullets and call out uncertainty explicitly.',
        ].join(' '),
    },
    {
        id: 'risk-review',
        label: 'Risk Review',
        category: 'Review',
        summary: 'Find the top product and engineering risks before continuing.',
        prompt: ({ projectName }) => [
            `Review ${projectName} for release readiness.`,
            'Identify the top 3 product or engineering risks.',
            'For each risk, include: why it matters, evidence to check, and one concrete next action that can be approved from the phone.',
            'Do not make code changes unless I explicitly approve them later.',
        ].join(' '),
    },
    {
        id: 'acceptance-plan',
        label: 'Acceptance Plan',
        category: 'Validate',
        summary: 'Generate phone-side acceptance steps for the current build.',
        prompt: ({ projectName }) => [
            `Create a minimal acceptance test plan for ${projectName}.`,
            'Focus on phone-to-desktop control.',
            'Include 5 concrete phone-side steps, expected desktop behavior, visible success signals, and failure signals.',
            'Keep it practical and executable now.',
        ].join(' '),
    },
    {
        id: 'failure-triage',
        label: 'Failure Triage',
        category: 'Recover',
        summary: 'Separate phone, backend, bridge, runtime, and network failures.',
        prompt: () => [
            'Triage the latest visible failure or slowdown in this Pocket Vibe session.',
            'Separate the likely layer: phone UI, backend API, WebSocket, VS Code bridge, runtime CLI, model/network, or project code.',
            'Give the next 3 diagnostics in priority order and explain what each result would mean.',
        ].join(' '),
    },
    {
        id: 'diff-summary',
        label: 'Diff Summary',
        category: 'Ship',
        summary: 'Summarize current changes, risks, and verification gaps.',
        prompt: ({ projectName }) => [
            `Summarize the current changes in ${projectName}.`,
            'Focus on user-facing behavior, files touched, risk areas, and tests already run or still needed.',
            'If you cannot inspect the diff directly, say exactly what context you need instead of guessing.',
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
            'the active project',
        runtimeLabel:
            activeRuntime?.label ||
            activeRuntime?.id ||
            sessionInfo.active_runtime ||
            'the active runtime',
    };
}

export function buildPromptSkillCards(context = {}) {
    const normalizedContext = getPromptSkillContext(context);
    return PROMPT_SKILLS.map((skill) => ({
        ...skill,
        prompt: skill.prompt(normalizedContext),
    }));
}
