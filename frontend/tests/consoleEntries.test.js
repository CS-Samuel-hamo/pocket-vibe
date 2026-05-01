import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConsoleEntries } from '../src/utils/consoleEntries.js';

test('buildConsoleEntries groups long consecutive command output', () => {
    const entries = buildConsoleEntries([
        { type: 'command', content: '$ npm run build', seq_id: 1 },
        { type: 'command', content: 'vite v5.4.21 building for production...', seq_id: 2 },
        { type: 'command', content: '2398 modules transformed.', seq_id: 3 },
        { type: 'command', content: 'built in 6.99s', seq_id: 4 },
    ]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'command-group');
    assert.equal(entries[0].badge, '4 LINES');
    assert.equal(entries[0].tone, 'success');
    assert.equal(entries[0].meta, 'Script completed');
    assert.deepEqual(entries[0].previewLines, ['$ npm run build', 'built in 6.99s']);
    assert.equal(entries[0].hiddenCount, 2);
});

test('buildConsoleEntries prioritizes error lines in command output preview', () => {
    const entries = buildConsoleEntries([
        { type: 'command', content: '$ npm run build', seq_id: 1 },
        { type: 'command', content: 'transforming modules...', seq_id: 2 },
        { type: 'command', content: 'Error: build failed', seq_id: 3 },
        { type: 'command', content: 'Cannot resolve module src/foo', seq_id: 4 },
    ]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'command-group');
    assert.equal(entries[0].tone, 'error');
    assert.equal(entries[0].meta, 'Script failed');
    assert.deepEqual(entries[0].previewLines, [
        '$ npm run build',
        'Error: build failed',
        'Cannot resolve module src/foo',
    ]);
});

test('buildConsoleEntries keeps short command output expanded', () => {
    const entries = buildConsoleEntries([
        { type: 'command', content: '$ npm run lint', seq_id: 1 },
        { type: 'command', content: 'eslint src --ext ts', seq_id: 2 },
    ]);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].kind, 'single');
    assert.equal(entries[1].kind, 'single');
});

test('buildConsoleEntries does not group across non-command messages', () => {
    const entries = buildConsoleEntries([
        { type: 'command', content: '$ npm run build', seq_id: 1 },
        { type: 'execution.event', phase: 'output', message: 'Script completed successfully.', seq_id: 2 },
        { type: 'command', content: '$ npm run test', seq_id: 3 },
        { type: 'command', content: '1 passed', seq_id: 4 },
        { type: 'command', content: 'done', seq_id: 5 },
    ]);

    assert.equal(entries.length, 3);
    assert.equal(entries[0].kind, 'single');
    assert.equal(entries[1].kind, 'single');
    assert.equal(entries[2].kind, 'command-group');
});
