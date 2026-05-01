import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildMobileLink,
    normalizeApiBaseUrl,
    normalizeBackendWsUrl,
    resolveConnectionConfig,
} from '../src/utils/connectionConfig.js';

test('resolveConnectionConfig uses explicit backend URLs when provided', () => {
    const config = resolveConnectionConfig({
        search: '?token=vibe-safe&mode=remote&backend_ws_url=wss%3A%2F%2Fpocket.example.com%2Fws&api_base_url=https%3A%2F%2Fpocket.example.com',
        locationProtocol: 'https:',
        locationHostname: 'pocket.example.com',
        userAgent: 'iPhone',
    });

    assert.equal(config.isMobileClient, true);
    assert.equal(config.wsUrl, 'wss://pocket.example.com/ws?token=vibe-safe&role=mobile');
    assert.equal(config.apiBaseUrl, 'https://pocket.example.com');
});

test('resolveConnectionConfig falls back to host and port params', () => {
    const config = resolveConnectionConfig({
        search: '?token=vibe-safe&ws_host=192.168.1.25&ws_port=8000',
        locationProtocol: 'http:',
        locationHostname: '192.168.1.25',
        userAgent: 'Desktop Browser',
    });

    assert.equal(config.isMobileClient, false);
    assert.equal(config.wsUrl, 'ws://192.168.1.25:8000/ws?token=vibe-safe&role=desktop');
    assert.equal(config.apiBaseUrl, 'http://192.168.1.25:8000');
});

test('buildMobileLink carries explicit backend addresses', () => {
    const link = buildMobileLink({
        mobileBaseUrl: 'https://remote.example.com/',
        token: 'vibe-safe',
        backendWsUrl: 'wss://relay.example.com/ws',
        apiBaseUrl: 'https://relay.example.com',
    });

    assert.match(link, /token=vibe-safe/);
    assert.match(link, /mode=remote/);
    assert.match(link, /backend_ws_url=wss%3A%2F%2Frelay\.example\.com%2Fws/);
    assert.match(link, /api_base_url=https%3A%2F%2Frelay\.example\.com/);
});

test('resolveConnectionConfig falls back to saved remote profile', () => {
    const config = resolveConnectionConfig({
        search: '',
        locationProtocol: 'https:',
        locationHostname: 'remote.example.com',
        userAgent: 'Android',
        savedConfig: {
            token: 'saved-token',
            backendWsUrl: 'wss://relay.example.com/ws',
            apiBaseUrl: 'https://relay.example.com',
        },
    });

    assert.equal(config.token, 'saved-token');
    assert.equal(config.wsUrl, 'wss://relay.example.com/ws?token=saved-token&role=mobile');
    assert.equal(config.apiBaseUrl, 'https://relay.example.com');
});

test('normalize connection URLs accepts plain host and http forms', () => {
    assert.equal(
        normalizeBackendWsUrl('https://relay.example.com'),
        'wss://relay.example.com/ws',
    );
    assert.equal(
        normalizeApiBaseUrl('wss://relay.example.com/ws'),
        'https://relay.example.com',
    );
});
