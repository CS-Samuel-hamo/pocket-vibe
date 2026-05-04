import React, { useMemo, useState } from 'react';
import { Button, Toast } from 'antd-mobile';
import {
    buildMobileLink,
    normalizeApiBaseUrl,
    normalizeBackendWsUrl,
    saveConnectionProfile,
} from '../utils/connectionConfig';
import { runConnectionPreflight } from '../utils/connectionPreflight';

const PREFLIGHT_REASON_LABELS = {
    ok: '连接正常',
    fetch_unavailable: '浏览器不支持检测',
    invalid_config: '连接配置无效',
    auth_failed: 'Token 不匹配',
    bridge_offline: '桌面 Bridge 离线',
    api_unreachable: 'API 无法访问',
    request_failed: '请求失败',
};

function formatPreflightReason(reason) {
    return PREFLIGHT_REASON_LABELS[reason] || reason || '未知状态';
}

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
                Toast.show({ icon: 'fail', content: '需要填写会话 Token。' });
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
                content: error instanceof Error ? error.message : '连接配置无效。',
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
            content: result.ok ? '连接测试通过' : result.message,
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
                    {mode === 'reconnect' ? '重新连接' : '远程连接'}
                </div>
                <h1 className="connection-setup-title">手动连接 Pocket Vibe</h1>
                <p className="connection-setup-copy">
                    当手机和电脑不在同一局域网，或需要使用 VPN/隧道地址时，在这里手动填写连接信息。
                </p>

                <label className="connection-field">
                    <span className="connection-field-label">会话 Token</span>
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
                    <span className="connection-field-label">后端 WebSocket 地址</span>
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
                    <span className="connection-field-label">API 基础地址</span>
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
                            <span>{preflightResult.ok ? '可访问' : '需要处理'}</span>
                            <strong>{formatPreflightReason(preflightResult.reason)}</strong>
                        </div>
                        <p>{preflightResult.message}</p>
                        {preflightResult.detail && <p>{preflightResult.detail}</p>}
                        {preflightResult.payload?.ok && (
                            <div className="connection-preflight-grid">
                                <span>桌面</span>
                                <strong>{preflightResult.payload.host_connected ? '在线' : '离线'}</strong>
                                <span>项目</span>
                                <strong>{preflightResult.payload.project_count || 0}</strong>
                                <span>运行时</span>
                                <strong>{preflightResult.payload.active_runtime || '无'}</strong>
                            </div>
                        )}
                    </div>
                )}

                <div className="connection-actions">
                    <Button fill="outline" loading={preflightRunning} onClick={handlePreflight}>
                        测试连接
                    </Button>
                    <Button color="primary" fill="solid" onClick={handleSubmit}>
                        保存并连接
                    </Button>
                    <Button fill="outline" onClick={onClearSaved}>
                        清除保存配置
                    </Button>
                </div>
            </div>
        </div>
    );
}
