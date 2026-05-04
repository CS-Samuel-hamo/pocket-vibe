import { normalizeApiBaseUrl } from './connectionConfig.js';

function errorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return String(error || '未知错误');
}

function buildResult({
    ok,
    stage,
    reason,
    message,
    detail = '',
    payload = null,
}) {
    return {
        ok,
        stage,
        reason,
        message,
        detail,
        payload,
        checkedAt: new Date().toISOString(),
    };
}

export function buildConnectionPreflightUrl({ token, apiBaseUrl }) {
    const normalizedToken = String(token || '').trim();
    const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl || '');

    if (!normalizedToken) {
        throw new Error('需要填写会话 Token。');
    }
    if (!normalizedApiBaseUrl) {
        throw new Error('需要填写 API Base URL。');
    }

    const target = new URL(`${normalizedApiBaseUrl}/api/connection/preflight`);
    target.searchParams.set('token', normalizedToken);
    return target.toString();
}

export async function runConnectionPreflight(
    profile,
    {
        fetchImpl = typeof fetch !== 'undefined' ? fetch : null,
    } = {},
) {
    if (!fetchImpl) {
        return buildResult({
            ok: false,
            stage: 'browser',
            reason: 'fetch_unavailable',
            message: '当前浏览器无法执行连接测试。',
        });
    }

    let requestUrl = '';
    try {
        requestUrl = buildConnectionPreflightUrl(profile || {});
    } catch (error) {
        return buildResult({
            ok: false,
            stage: 'config',
            reason: 'invalid_config',
            message: errorMessage(error),
        });
    }

    try {
        const response = await fetchImpl(requestUrl, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        const reason = payload?.reason || (response.ok ? 'ok' : `http_${response.status}`);
        const message =
            payload?.message ||
            (response.ok ? 'API 和 Token 可以访问。' : `后端返回 HTTP ${response.status}。`);

        return buildResult({
            ok: Boolean(response.ok && payload?.ok),
            stage: response.ok ? 'ready' : 'auth',
            reason,
            message,
            detail: buildConnectionPreflightHint({ response, payload, reason }),
            payload,
        });
    } catch (error) {
        return buildResult({
            ok: false,
            stage: 'network',
            reason: 'api_unreachable',
            message: '手机无法访问 API Base URL。',
            detail: errorMessage(error),
        });
    }
}

export function buildConnectionPreflightHint({ response = null, payload = null, reason = '' } = {}) {
    const normalizedReason = reason || payload?.reason || '';

    if (normalizedReason === 'token_missing') {
        return '请粘贴桌面配对页上的 Token。';
    }
    if (normalizedReason === 'token_mismatch') {
        return '请刷新桌面配对页，并把当前 Token 填到手机端。';
    }
    if (normalizedReason === 'token_expired') {
        return '请重启桌面后端，然后打开新的配对链接。';
    }
    if (normalizedReason === 'api_unreachable') {
        return '请使用手机可访问的局域网、Tailscale 或 HTTPS 隧道地址作为 API Base URL。';
    }
    if (response && !response.ok) {
        return 'API 可以访问，但鉴权或路由失败。';
    }
    if (payload?.ok && payload?.host_connected === false) {
        return 'API 和 Token 有效，但 VS Code 桌面 bridge 还没有连接。';
    }
    if (payload?.ok) {
        return 'API 和 Token 有效。如果仍无法连接，可能是 WebSocket URL 或代理被拦截。';
    }

    return '';
}
