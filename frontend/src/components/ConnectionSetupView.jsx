import React, { useMemo, useState } from 'react';
import { Button, Toast } from 'antd-mobile';
import {
    buildMobileLink,
    normalizeApiBaseUrl,
    normalizeBackendWsUrl,
    saveConnectionProfile,
} from '../utils/connectionConfig';
import { runConnectionPreflight } from '../utils/connectionPreflight';

export default function ConnectionSetupView({
    initialProfile,
    mode = 'setup',
    onClearSaved,
}) {
    const [token, setToken] = useState(initialProfile?.token || '');
    const [backendWsUrl, setBackendWsUrl] = useState(initialProfile?.backendWsUrl || '');
    const [apiBaseUrl, setApiBaseUrl] = useState(initialProfile?.apiBaseUrl || '');
    const [preflightResult, setPreflightResult] = useState(null);
    const [preflightRunning, setPreflightRunning] = useState(false);

    const currentPageUrl = useMemo(() => `${window.location.origin}${window.location.pathname}`, []);

    const handleSubmit = () => {
        try {
            const normalized = saveConnectionProfile({
                token,
                backendWsUrl,
                apiBaseUrl,
            });

            if (!normalized.token) {
                Toast.show({ icon: 'fail', content: 'Session token is required.' });
                return;
            }

            const target = buildMobileLink({
                mobileBaseUrl: currentPageUrl,
                token: normalized.token,
                backendWsUrl: normalized.backendWsUrl,
                apiBaseUrl: normalized.apiBaseUrl,
            });

            window.location.assign(target);
        } catch (error) {
            Toast.show({
                icon: 'fail',
                content: error instanceof Error ? error.message : 'Invalid connection settings.',
            });
        }
    };

    const handlePreflight = async () => {
        setPreflightRunning(true);
        const result = await runConnectionPreflight({
            token,
            apiBaseUrl,
        });
        setPreflightResult(result);
        setPreflightRunning(false);

        Toast.show({
            icon: result.ok ? 'success' : 'fail',
            content: result.ok ? 'Connection test passed' : result.message,
        });
    };

    const normalizedPreview = useMemo(() => {
        try {
            return {
                backendWsUrl: backendWsUrl ? normalizeBackendWsUrl(backendWsUrl) : '',
                apiBaseUrl: apiBaseUrl ? normalizeApiBaseUrl(apiBaseUrl) : '',
            };
        } catch {
            return null;
        }
    }, [apiBaseUrl, backendWsUrl]);

    return (
        <div className="connection-setup-screen">
            <div className="connection-setup-card">
                <div className="connection-setup-badge">
                    {mode === 'reconnect' ? 'Reconnect' : 'Remote Setup'}
                </div>
                <h1 className="connection-setup-title">Connect Pocket Vibe Manually</h1>
                <p className="connection-setup-copy">
                    Use this page when the phone and desktop are not on the same LAN, or when VPN/tunnel
                    addresses need to be entered explicitly.
                </p>

                <label className="connection-field">
                    <span className="connection-field-label">Session Token</span>
                    <input
                        className="connection-field-input"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        placeholder="vibe-safe"
                        autoCapitalize="off"
                        autoCorrect="off"
                    />
                </label>

                <label className="connection-field">
                    <span className="connection-field-label">Backend WebSocket URL</span>
                    <input
                        className="connection-field-input"
                        value={backendWsUrl}
                        onChange={(event) => setBackendWsUrl(event.target.value)}
                        placeholder="wss://relay.example.com/ws"
                        autoCapitalize="off"
                        autoCorrect="off"
                    />
                </label>

                <label className="connection-field">
                    <span className="connection-field-label">API Base URL</span>
                    <input
                        className="connection-field-input"
                        value={apiBaseUrl}
                        onChange={(event) => setApiBaseUrl(event.target.value)}
                        placeholder="https://relay.example.com"
                        autoCapitalize="off"
                        autoCorrect="off"
                    />
                </label>

                {normalizedPreview && (normalizedPreview.backendWsUrl || normalizedPreview.apiBaseUrl) && (
                    <div className="connection-preview">
                        {normalizedPreview.backendWsUrl && (
                            <div className="connection-preview-line">
                                <span>WS</span>
                                <code>{normalizedPreview.backendWsUrl}</code>
                            </div>
                        )}
                        {normalizedPreview.apiBaseUrl && (
                            <div className="connection-preview-line">
                                <span>API</span>
                                <code>{normalizedPreview.apiBaseUrl}</code>
                            </div>
                        )}
                    </div>
                )}

                {preflightResult && (
                    <div className={`connection-preflight ${preflightResult.ok ? 'ok' : 'fail'}`}>
                        <div className="connection-preflight-row">
                            <span>{preflightResult.ok ? 'Reachable' : 'Needs attention'}</span>
                            <strong>{preflightResult.reason}</strong>
                        </div>
                        <p>{preflightResult.message}</p>
                        {preflightResult.detail && <p>{preflightResult.detail}</p>}
                        {preflightResult.payload?.ok && (
                            <div className="connection-preflight-grid">
                                <span>Host</span>
                                <strong>{preflightResult.payload.host_connected ? 'online' : 'offline'}</strong>
                                <span>Projects</span>
                                <strong>{preflightResult.payload.project_count || 0}</strong>
                                <span>Runtime</span>
                                <strong>{preflightResult.payload.active_runtime || 'none'}</strong>
                            </div>
                        )}
                    </div>
                )}

                <div className="connection-actions">
                    <Button fill="outline" loading={preflightRunning} onClick={handlePreflight}>
                        Test Connection
                    </Button>
                    <Button color="primary" fill="solid" onClick={handleSubmit}>
                        Save And Connect
                    </Button>
                    <Button fill="outline" onClick={onClearSaved}>
                        Clear Saved Profile
                    </Button>
                </div>
            </div>
        </div>
    );
}
