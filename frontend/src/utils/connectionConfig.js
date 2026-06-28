const MOBILE_UA_PATTERN = /iPhone|iPad|iPod|Android/i;
export const CONNECTION_PROFILE_KEY = 'pocket_vibe_connection_profile';

function stripTrailingSlash(url = '') {
    return url.replace(/\/+$/, '');
}

function ensureAbsoluteUrl(value = '', fallbackProtocol = 'https:') {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
        return '';
    }

    if (/^[a-z]+:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return `${fallbackProtocol}//${trimmed.replace(/^\/+/, '')}`;
}

function appendQuery(url, key, value) {
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return parsed.toString();
}

export function normalizeBackendWsUrl(value = '') {
    const absolute = ensureAbsoluteUrl(value);
    if (!absolute) {
        return '';
    }

    const parsed = new URL(absolute);
    if (parsed.protocol === 'http:') {
        parsed.protocol = 'ws:';
    } else if (parsed.protocol === 'https:') {
        parsed.protocol = 'wss:';
    }

    if (!['ws:', 'wss:'].includes(parsed.protocol)) {
        throw new Error('Backend WebSocket URL must use ws://, wss://, http://, or https://.');
    }

    if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/ws';
    }

    return stripTrailingSlash(parsed.toString());
}

export function normalizeApiBaseUrl(value = '') {
    const absolute = ensureAbsoluteUrl(value);
    if (!absolute) {
        return '';
    }

    const parsed = new URL(absolute);
    if (parsed.protocol === 'ws:') {
        parsed.protocol = 'http:';
    } else if (parsed.protocol === 'wss:') {
        parsed.protocol = 'https:';
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('API base URL must use http://, https://, ws://, or wss://.');
    }

    if (parsed.pathname === '/ws') {
        parsed.pathname = '/';
    }

    return stripTrailingSlash(parsed.toString());
}

export function readSavedConnectionProfile(storage = typeof window !== 'undefined' ? window.localStorage : null) {
    if (!storage) {
        return null;
    }

    try {
        const raw = storage.getItem(CONNECTION_PROFILE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        return {
            token: parsed.token ? String(parsed.token).trim() : '',
            backendWsUrl: parsed.backendWsUrl ? normalizeBackendWsUrl(parsed.backendWsUrl) : '',
            apiBaseUrl: parsed.apiBaseUrl ? normalizeApiBaseUrl(parsed.apiBaseUrl) : '',
        };
    } catch (error) {
        console.warn('Pocket Vibe could not read saved connection profile', error);
        return null;
    }
}

export function saveConnectionProfile(
    profile,
    storage = typeof window !== 'undefined' ? window.localStorage : null,
) {
    if (!storage) {
        return null;
    }

    const normalized = {
        token: String(profile?.token || '').trim(),
        backendWsUrl: normalizeBackendWsUrl(profile?.backendWsUrl || ''),
        apiBaseUrl: normalizeApiBaseUrl(profile?.apiBaseUrl || ''),
    };

    storage.setItem(CONNECTION_PROFILE_KEY, JSON.stringify(normalized));
    return normalized;
}

export function clearConnectionProfile(storage = typeof window !== 'undefined' ? window.localStorage : null) {
    storage?.removeItem(CONNECTION_PROFILE_KEY);
}

export function resolveConnectionConfig({
    search = '',
    locationProtocol = 'http:',
    locationHostname = 'localhost',
    userAgent = '',
    savedConfig = null,
} = {}) {
    const params = new URLSearchParams(search);
    const token = params.get('token') || savedConfig?.token || null;
    const isMobileClient = MOBILE_UA_PATTERN.test(userAgent) || params.get('mode') === 'remote';
    const role = isMobileClient ? 'mobile' : 'desktop';

    const explicitBackendWsUrl = params.get('backend_ws_url') || savedConfig?.backendWsUrl || '';
    const explicitApiBaseUrl = params.get('api_base_url') || savedConfig?.apiBaseUrl || '';

    const wsHost = params.get('ws_host') || locationHostname;
    const wsPort = params.has('ws_port')
        ? params.get('ws_port')
        : locationProtocol === 'https:'
            ? ''
            : '8000';
    const wsProtocol =
        locationProtocol === 'https:' || wsHost?.includes('trycloudflare.com') ? 'wss:' : 'ws:';

    const wsUrl = token
        ? explicitBackendWsUrl
            ? appendQuery(appendQuery(normalizeBackendWsUrl(explicitBackendWsUrl), 'token', token), 'role', role)
            : `${wsProtocol}//${wsHost}${wsPort ? `:${wsPort}` : ''}/ws?token=${encodeURIComponent(token)}&role=${role}`
        : null;

    const apiProtocol = locationProtocol === 'https:' ? 'https:' : 'http:';
    const apiHost = params.get('api_host') || wsHost;
    const apiPort = params.has('api_port')
        ? params.get('api_port')
        : locationProtocol === 'https:'
            ? ''
            : '8000';

    return {
        params,
        token,
        isMobileClient,
        role,
        wsHost,
        wsPort,
        wsUrl,
        apiBaseUrl: explicitApiBaseUrl
            ? normalizeApiBaseUrl(explicitApiBaseUrl)
            : `${apiProtocol}//${apiHost}${apiPort ? `:${apiPort}` : ''}`,
        backendWsBaseUrl: explicitBackendWsUrl
            ? normalizeBackendWsUrl(explicitBackendWsUrl)
            : `${wsProtocol}//${wsHost}${wsPort ? `:${wsPort}` : ''}/ws`,
        hasSavedConfig: Boolean(savedConfig?.token && savedConfig?.backendWsUrl && savedConfig?.apiBaseUrl),
    };
}

export function buildMobileLink({
    mobileBaseUrl,
    token,
    backendWsUrl,
    apiBaseUrl,
}) {
    let target = appendQuery(mobileBaseUrl, 'token', token);
    target = appendQuery(target, 'mode', 'remote');
    target = appendQuery(target, 'backend_ws_url', backendWsUrl);
    target = appendQuery(target, 'api_base_url', apiBaseUrl);
    return target;
}
