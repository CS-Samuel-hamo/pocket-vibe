import test from 'node:test';
import assert from 'node:assert/strict';

import {
    appendIncomingMessage,
    normalizeIncomingMessage,
    shouldHideInConsole,
} from '../src/utils/messageFeed.js';

test('normalizeIncomingMessage derives content and approval ids', () => {
    const normalized = normalizeIncomingMessage({
        type: 'approval.request',
        approval_id: 'apr-1',
        message: 'Need approval',
    });

    assert.equal(normalized.content, 'Need approval');
    assert.equal(normalized.id, 'apr-1');
});

test('appendIncomingMessage skips duplicate seq ids', () => {
    const initial = [{ type: 'assistant', seq_id: 12, content: 'ok' }];
    const result = appendIncomingMessage(initial, { type: 'assistant', seq_id: 12, content: 'ok' });

    assert.equal(result.length, 1);
});

test('appendIncomingMessage merges local pending user echo with confirmed user event', () => {
    const result = appendIncomingMessage(
        [{ type: 'user', content: 'reply with exactly: POCKET_VIBE_HOME_OK', local: true }],
        { type: 'user', content: 'reply with exactly: POCKET_VIBE_HOME_OK' },
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].local, false);
});

test('appendIncomingMessage collapses identical consecutive system events', () => {
    const result = appendIncomingMessage(
        [
            {
                type: 'execution.event',
                phase: 'runtime',
                content: 'Attached Pocket Vibe to Codex CLI.',
                target_runtime: 'codex-cli',
            },
        ],
        {
            type: 'execution.event',
            phase: 'runtime',
            message: 'Attached Pocket Vibe to Codex CLI.',
            target_runtime: 'codex-cli',
        },
    );

    assert.equal(result.length, 1);
});

test('appendIncomingMessage still merges diff updates for the same file', () => {
    const result = appendIncomingMessage(
        [{ type: 'diff', file: 'src/App.jsx', content: '+one' }],
        { type: 'diff', file: 'src/App.jsx', content: '+two' },
    );

    assert.equal(result.length, 1);
    assert.match(result[0].content, /\+one/);
    assert.match(result[0].content, /\+two/);
});

test('shouldHideInConsole suppresses session join noise and generic dispatch events', () => {
    assert.equal(
        shouldHideInConsole({
            type: 'audit.event',
            category: 'session',
            message: 'Client joined room',
        }),
        true,
    );

    assert.equal(
        shouldHideInConsole({
            type: 'execution.event',
            phase: 'dispatch',
            message: 'Prompt dispatched to desktop host',
        }),
        true,
    );

    assert.equal(
        shouldHideInConsole({
            type: 'execution.event',
            phase: 'dispatched',
            message: 'Prompt sent to Codex CLI.',
        }),
        true,
    );

    assert.equal(
        shouldHideInConsole({
            type: 'execution.event',
            phase: 'thinking',
            message: 'Codex CLI exec session started.',
        }),
        true,
    );

    assert.equal(
        shouldHideInConsole({
            type: 'execution.event',
            phase: 'completed',
            message: 'Codex CLI completed.',
        }),
        true,
    );
});

test('shouldHideInConsole keeps assistant replies visible', () => {
    assert.equal(
        shouldHideInConsole({
            type: 'assistant',
            content: 'POCKET_VIBE_Codex_OK',
        }),
        false,
    );
});

test('shouldHideInConsole hides redundant script-start events when command echo exists', () => {
    assert.equal(
        shouldHideInConsole({
            type: 'execution.event',
            phase: 'output',
            message: 'Running npm run build in Pocket Vibe Shell.',
        }),
        true,
    );
});
