import assert from 'assert/strict';

import { buildCodexExecArgs, parseCodexExecLine } from '../codexExec';

const args = buildCodexExecArgs('D:\\AI_projects\\Pocket_Vibe', 'D:\\temp\\reply.txt');
assert.deepEqual(args.slice(0, 4), ['exec', '--json', '--skip-git-repo-check', '-C']);
assert.equal(args[4], 'D:\\AI_projects\\Pocket_Vibe');
assert.equal(args[args.length - 3], '--output-last-message');
assert.equal(args[args.length - 2], 'D:\\temp\\reply.txt');
assert.equal(args[args.length - 1], '-');

const thinkingPackets = parseCodexExecLine('{"type":"turn.started"}');
assert.equal(thinkingPackets.length, 1);
assert.equal(thinkingPackets[0].type, 'execution.event');
assert.equal(thinkingPackets[0].phase, 'thinking');

const assistantPackets = parseCodexExecLine(
    '{"type":"item.completed","item":{"type":"agent_message","text":"POCKET_VIBE_Codex_OK"}}',
);
assert.equal(assistantPackets.length, 1);
assert.equal(assistantPackets[0].type, 'assistant');
assert.equal(assistantPackets[0].content, 'POCKET_VIBE_Codex_OK');

const ignoredPackets = parseCodexExecLine('2026-04-19 WARN not-json');
assert.equal(ignoredPackets.length, 0);
