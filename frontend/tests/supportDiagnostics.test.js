import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildRecoveryHints,
    buildSupportDebugBundle,
    maskToken,
} from '../src/utils/supportDiagnostics.js';

const readyRuntime = {
    id: 'codex-cli',
    label: 'Codex CLI',
    health: 'ready',
    attached: true,
    supports: ['prompt', 'kill'],
    status_detail: 'Codex CLI is attached.',
};

test('maskToken redacts long tokens', () => {
    assert.equal(maskToken('vibe-safe-token'), 'vibe...oken');
});

test('buildRecoveryHints surfaces connection and bridge issues', () => {
    const hints = buildRecoveryHints({
        status: 'disconnected',
        sessionInfo: { bridge_connected: false },
        activeRuntime: null,
        diagnostics: { lastFailureReason: 'bridge_offline' },
        capabilityInfo: { runtime_catalog: [] },
        connectionProfile: { backendWsBaseUrl: 'wss://relay.example.com/ws' },
    });

    assert.match(hints[0], /wss:\/\/relay\.example\.com\/ws/);
    assert.ok(hints.some((hint) => /bridge 离线/i.test(hint)));
    assert.ok(hints.some((hint) => /还没有可用运行时/i.test(hint)));
});

test('buildSupportDebugBundle includes core runtime and connection fields', () => {
    const bundle = buildSupportDebugBundle({
        status: 'connected',
        sessionInfo: { bridge_connected: true, room_token: 'vibe-safe' },
        capabilityInfo: { runtime_catalog: [readyRuntime], active_runtime: 'codex-cli' },
        activeRuntime: readyRuntime,
        diagnostics: {
            runtimeStatusDetail: 'Codex CLI is attached.',
            lastDispatchMessage: 'Prompt sent to Codex CLI.',
            lastFailureReason: 'No recent failures.',
        },
        connectionProfile: {
            token: 'vibe-safe',
            backendWsBaseUrl: 'ws://100.88.12.34:8000/ws',
            apiBaseUrl: 'http://100.88.12.34:8000',
            hasSavedConfig: true,
            pageUrl: 'http://100.88.12.34:5173/?token=vibe-safe',
        },
        timestamp: '2026-04-19T10:00:00.000Z',
    });

    assert.match(bundle, /Timestamp: 2026-04-19T10:00:00.000Z/);
    assert.match(bundle, /Client status: 已连接/);
    assert.match(bundle, /Session token: vibe...safe/);
    assert.match(bundle, /Backend WS: ws:\/\/100\.88\.12\.34:8000\/ws/);
    assert.match(bundle, /Runtime catalog: codex-cli:ready:attached:prompt,kill/);
});
