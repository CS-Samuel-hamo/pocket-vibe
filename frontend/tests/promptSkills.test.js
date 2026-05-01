import test from 'node:test';
import assert from 'node:assert/strict';

import {
    PROMPT_SKILLS,
    buildPromptSkillCards,
    getPromptSkillContext,
} from '../src/utils/promptSkills.js';

test('getPromptSkillContext derives active project and runtime labels', () => {
    const context = getPromptSkillContext({
        activeProject: { project_name: 'Pocket_Vibe' },
        activeRuntime: { label: 'Codex CLI' },
    });

    assert.equal(context.projectName, 'Pocket_Vibe');
    assert.equal(context.runtimeLabel, 'Codex CLI');
});

test('buildPromptSkillCards materializes reusable prompts with project context', () => {
    const cards = buildPromptSkillCards({
        activeProject: { project_name: 'Pocket_Vibe' },
        activeRuntime: { label: 'Codex CLI' },
    });

    assert.equal(cards.length, PROMPT_SKILLS.length);
    assert.ok(cards.every((card) => typeof card.prompt === 'string' && card.prompt.length > 40));
    assert.match(cards.find((card) => card.id === 'project-brief').prompt, /Pocket_Vibe/);
    assert.match(cards.find((card) => card.id === 'project-brief').prompt, /Codex CLI/);
});

test('buildPromptSkillCards keeps skills runtime agnostic', () => {
    const cards = buildPromptSkillCards({
        sessionInfo: {
            active_runtime: 'claude-code',
            project_state: { project_name: 'RemoteProject' },
        },
    });

    assert.match(cards.find((card) => card.id === 'project-brief').prompt, /claude-code/);
    assert.match(cards.find((card) => card.id === 'risk-review').prompt, /RemoteProject/);
});
