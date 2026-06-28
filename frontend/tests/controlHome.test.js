import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getLastAssistantReply,
    getRecentControlEvents,
} from '../src/utils/controlHome.js';

test('getLastAssistantReply returns the latest assistant content', () => {
    const reply = getLastAssistantReply([
        { type: 'assistant', content: 'first', timestamp: '2026-04-19T10:00:00.000Z' },
        { type: 'assistant', message: 'second', target_runtime: 'codex-cli', timestamp: '2026-04-19T10:01:00.000Z' },
    ]);

    assert.equal(reply?.content, 'second');
    assert.equal(reply?.runtime, 'codex-cli');
});

test('getRecentControlEvents combines history and critical message events', () => {
    const events = getRecentControlEvents(
        [
            {
                type: 'execution.event',
                phase: 'error',
                message: 'Bridge disconnected unexpectedly.',
                timestamp: '2026-04-19T10:02:00.000Z',
            },
        ],
        [
            {
                category: 'approval',
                message: 'Approval approved',
                timestamp: '2026-04-19T10:03:00.000Z',
            },
        ],
        4,
    );

    assert.equal(events.length, 2);
    assert.equal(events[0].title, 'approval');
    assert.equal(events[1].title, 'error');
});

test('getRecentControlEvents hides low-signal session join noise', () => {
    const events = getRecentControlEvents(
        [],
        [
            {
                category: 'session',
                message: 'Client joined room',
                timestamp: '2026-04-19T10:00:00.000Z',
            },
            {
                category: 'runtime',
                message: 'Attached Pocket Vibe to Codex CLI.',
                timestamp: '2026-04-19T10:01:00.000Z',
            },
        ],
        4,
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'runtime');
});
