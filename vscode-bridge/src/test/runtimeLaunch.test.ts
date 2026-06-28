import assert from 'assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { looksLikeExecutablePath, resolveRuntimeLaunchSpec } from '../runtimeLaunch';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-vibe-runtime-launch-'));
const fakeCodexPath = path.join(tempDir, 'codex.exe');
fs.writeFileSync(fakeCodexPath, 'stub');

const previousCodexPath = process.env.POCKET_VIBE_CODEX_PATH;
process.env.POCKET_VIBE_CODEX_PATH = fakeCodexPath;

const codexLaunch = resolveRuntimeLaunchSpec('codex-cli');
assert.equal(codexLaunch?.command, fakeCodexPath);
assert.equal(looksLikeExecutablePath(codexLaunch?.command || ''), true);
assert.match(codexLaunch?.terminalName || '', /codex/i);

if (previousCodexPath === undefined) {
    delete process.env.POCKET_VIBE_CODEX_PATH;
} else {
    process.env.POCKET_VIBE_CODEX_PATH = previousCodexPath;
}

const unknownLaunch = resolveRuntimeLaunchSpec('copilot-ext');
assert.equal(unknownLaunch, null);
