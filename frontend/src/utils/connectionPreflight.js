import { normalizeApiBaseUrl } from './connectionConfig.js';

function errorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return String(error || 'Unknown error');
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
        throw new Error('Session token is required.');
    }
    if (!normalizedApiBaseUrl) {
        throw new Error('API Base URL is required.');
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
            message: 'This browser cannot run the connection test.',
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
            (response.ok ? 'API and token are reachable.' : `Backend returned HTTP ${response.status}.`);

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
            message: 'API Base URL is not reachable from this phone.',
            detail: errorMessage(error),
        });
    }
}

export function buildConnectionPreflightHint({ response = null, payload = null, reason = '' } = {}) {
    const normalizedReason = reason || payload?.reason || '';

    if (normalizedReason === 'token_missing') {
        return 'Paste the token from the desktop pairing page.';
    }
    if (normalizedReason === 'token_mismatch') {
        return 'Refresh the desktop pairing page and copy the current token into this phone.';
    }
    if (normalizedReason === 'token_expired') {
        return 'Restart the desktop backend, then reopen the new pairing link.';
    }
    if (normalizedReason === 'api_unreachable') {
        return 'Use a reachable LAN, Tailscale, or HTTPS tunnel address for API Base URL.';
    }
    if (response && !response.ok) {
        return 'API is reachable, but authentication or routing failed.';
    }
    if (payload?.ok && payload?.host_connected === false) {
        return 'API/token are valid, but the VS Code desktop bridge is not connected yet.';
    }
    if (payload?.ok) {
        return 'API/token are valid. If the app still fails, the WebSocket URL or proxy may be blocked.';
    }

    return '';
}
