import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildProjectInboxEntries,
    getActiveProject,
    getProjectSwitchState,
} from '../src/utils/projectRegistry.js';

test('getActiveProject prefers the selected project', () => {
    const activeProject = getActiveProject({
        active_project_id: 'project-b',
        project_registry: [
            { project_id: 'project-a', project_name: 'Alpha' },
            { project_id: 'project-b', project_name: 'Beta' },
        ],
    });

    assert.equal(activeProject?.project_name, 'Beta');
});

test('getProjectSwitchState marks the active project and builds a fallback detail', () => {
    const state = getProjectSwitchState(
        {
            project_id: 'project-a',
            host_label: 'VS Code Host',
            runtime_label: 'Codex CLI',
            runtime_health: 'ready',
        },
        'project-a',
    );

    assert.equal(state.isActive, true);
    assert.equal(state.actionLabel, 'Open');
    assert.match(state.detail, /VS Code Host/);
});

test('buildProjectInboxEntries prioritizes the active project and carries assistant reply previews', () => {
    const inbox = buildProjectInboxEntries({
        sessionInfo: {
            active_project_id: 'project-b',
            project_registry: [
                {
                    project_id: 'project-a',
                    project_name: 'Alpha',
                    host_label: 'VS Code Host',
                    runtime_label: 'Codex CLI',
                    runtime_health: 'ready',
                },
                {
                    project_id: 'project-b',
                    project_name: 'Beta',
                    host_label: 'VS Code Host',
                    runtime_label: 'Antigravity',
                    runtime_health: 'ready',
                },
            ],
        },
        messages: [
            {
                type: 'assistant',
                project_id: 'project-a',
                content: 'alpha summary',
                timestamp: '2026-04-23T10:00:00.000Z',
            },
            {
                type: 'assistant',
                project_id: 'project-b',
                content: 'beta summary',
                timestamp: '2026-04-23T10:01:00.000Z',
            },
        ],
    });

    assert.equal(inbox[0].project_id, 'project-b');
    assert.equal(inbox[0].isActive, true);
    assert.equal(inbox[0].previewLabel, 'Last Reply');
    assert.equal(inbox[0].previewText, 'beta summary');
});

test('buildProjectInboxEntries highlights approvals and issues', () => {
    const inbox = buildProjectInboxEntries({
        sessionInfo: {
            active_project_id: 'project-a',
            project_registry: [
                {
                    project_id: 'project-a',
                    project_name: 'Alpha',
                    host_label: 'VS Code Host',
                    runtime_label: 'Codex CLI',
                    runtime_health: 'ready',
                },
                {
                    project_id: 'project-b',
                    project_name: 'Beta',
                    host_label: 'Codex App Host',
                    runtime_label: 'Codex CLI',
                    runtime_health: 'offline',
                    last_error: 'Host went offline.',
                },
            ],
        },
        pendingApproval: { tool_name: 'apply_patch' },
    });

    assert.equal(inbox[0].project_id, 'project-a');
    assert.equal(inbox[0].previewLabel, 'Approval');
    assert.match(inbox[0].previewText, /apply_patch/i);
    assert.equal(inbox[1].tone, 'danger');
    assert.equal(inbox[1].previewLabel, 'Issue');
});

test('buildProjectInboxEntries assigns pending approvals to their project id', () => {
    const inbox = buildProjectInboxEntries({
        sessionInfo: {
            active_project_id: 'project-a',
            project_registry: [
                {
                    project_id: 'project-a',
                    project_name: 'Alpha',
                    host_label: 'VS Code Host',
                    runtime_label: 'Codex CLI',
                    runtime_health: 'ready',
                },
                {
                    project_id: 'project-b',
                    project_name: 'Beta',
                    host_label: 'Codex App Host',
                    runtime_label: 'Codex CLI',
                    runtime_health: 'ready',
                },
            ],
        },
        pendingApproval: {
            project_id: 'project-b',
            tool_name: 'apply_patch',
        },
    });

    const beta = inbox.find((entry) => entry.project_id === 'project-b');
    assert.equal(beta.hasPendingApproval, true);
    assert.equal(beta.previewLabel, 'Approval');
    assert.match(beta.previewText, /apply_patch/i);
});
