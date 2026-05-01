import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createRuntimeActionState,
    getRuntimeActionForRuntime,
    reconcileRuntimeActionWithCapabilities,
    reduceRuntimeActionWithEvent,
} from '../src/utils/runtimeActionState.js';

const codexRuntime = {
    id: 'codex-cli',
    label: 'Codex CLI',
    attached: true,
    status_detail: 'Codex CLI is attached to terminal Pocket Vibe · codex-cli.',
};

test('createRuntimeActionState marks launch request as pending', () => {
    const state = createRuntimeActionState('launch', codexRuntime);

    assert.equal(state.action, 'launch');
    assert.equal(state.runtimeId, 'codex-cli');
    assert.equal(state.status, 'pending');
    assert.match(state.headline, /Launching Codex CLI/i);
});

test('reduceRuntimeActionWithEvent marks runtime launch success', () => {
    const current = createRuntimeActionState('launch', codexRuntime);
    const next = reduceRuntimeActionWithEvent(
        current,
        {
            type: 'execution.event',
            phase: 'runtime',
            target_runtime: 'codex-cli',
            reason: 'runtime.launch',
            message: 'Launched Codex CLI in VS Code.',
        },
        [codexRuntime],
    );

    assert.equal(next.status, 'success');
    assert.match(next.detail, /Launched Codex CLI/i);
});

test('reduceRuntimeActionWithEvent marks attach pending launch as blocked', () => {
    const current = createRuntimeActionState('attach', { id: 'claude-code', label: 'Claude Code' });
    const next = reduceRuntimeActionWithEvent(
        current,
        {
            type: 'execution.event',
            phase: 'runtime',
            target_runtime: 'claude-code',
            reason: 'runtime.attach.pending_launch',
            message: 'Claude Code is selected, but not attached yet. Launch it first.',
        },
        [],
    );

    assert.equal(next.status, 'blocked');
    assert.match(next.headline, /not running yet/i);
});

test('reconcileRuntimeActionWithCapabilities promotes pending attach to success', () => {
    const current = createRuntimeActionState('attach', codexRuntime);
    const next = reconcileRuntimeActionWithCapabilities(
        current,
        { active_runtime: 'codex-cli', runtime_catalog: [codexRuntime] },
        {},
    );

    assert.equal(next.status, 'success');
    assert.match(next.detail, /attached/i);
});

test('getRuntimeActionForRuntime returns visual state for matching runtime', () => {
    const pending = createRuntimeActionState('attach', codexRuntime);
    const visual = getRuntimeActionForRuntime(pending, 'codex-cli');

    assert.equal(visual.stateLabel, 'switching');
    assert.equal(visual.attachLabel, 'Switching...');
    assert.equal(visual.launchLabel, 'Launch');
});
