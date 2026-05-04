import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildConnectionPreflightHint,
    buildConnectionPreflightUrl,
    runConnectionPreflight,
} from '../src/utils/connectionPreflight.js';

test('buildConnectionPreflightUrl targets the backend preflight endpoint', () => {
    const url = buildConnectionPreflightUrl({
        token: 'vibe-safe',
        apiBaseUrl: 'https://relay.example.com/',
    });

    assert.equal(url, 'https://relay.example.com/api/connection/preflight?token=vibe-safe');
});

test('runConnectionPreflight returns backend host status on success', async () => {
    const result = await runConnectionPreflight(
        {
            token: 'vibe-safe',
            apiBaseUrl: 'https://relay.example.com',
        },
        {
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    ok: true,
                    reason: 'ok',
                    message: 'API and token are reachable.',
                    host_connected: true,
                    project_count: 1,
                    active_runtime: 'codex-cli',
                }),
            }),
        },
    );

    assert.equal(result.ok, true);
    assert.equal(result.reason, 'ok');
    assert.equal(result.payload.host_connected, true);
});

test('runConnectionPreflight surfaces token mismatch separately from network failure', async () => {
    const result = await runConnectionPreflight(
        {
            token: 'bad-token',
            apiBaseUrl: 'https://relay.example.com',
        },
        {
            fetchImpl: async () => ({
                ok: false,
                status: 401,
                json: async () => ({
                    ok: false,
                    reason: 'token_mismatch',
                    message: 'Session token does not match the desktop host.',
                }),
            }),
        },
    );

    assert.equal(result.ok, false);
    assert.equal(result.stage, 'auth');
    assert.equal(result.reason, 'token_mismatch');
    assert.match(result.detail, /当前 Token/);
});

test('runConnectionPreflight reports unreachable API base URL', async () => {
    const result = await runConnectionPreflight(
        {
            token: 'vibe-safe',
            apiBaseUrl: 'https://relay.example.com',
        },
        {
            fetchImpl: async () => {
                throw new Error('Failed to fetch');
            },
        },
    );

    assert.equal(result.ok, false);
    assert.equal(result.stage, 'network');
    assert.equal(result.reason, 'api_unreachable');
});

test('buildConnectionPreflightHint explains valid API with offline bridge', () => {
    const hint = buildConnectionPreflightHint({
        payload: {
            ok: true,
            host_connected: false,
        },
    });

    assert.match(hint, /桌面 bridge/);
});
