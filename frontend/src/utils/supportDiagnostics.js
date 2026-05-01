function normalizeStatusLabel(status = '') {
    return String(status || 'unknown').replace(/_/g, ' ');
}

export function maskToken(token = '') {
    const normalized = String(token || '').trim();
    if (!normalized) {
        return 'missing';
    }

    if (normalized.length <= 8) {
        return `${normalized.slice(0, 2)}…${normalized.slice(-2)}`;
    }

    return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`;
}

export function buildRecoveryHints({
    status,
    sessionInfo = {},
    activeRuntime = null,
    diagnostics = {},
    capabilityInfo = {},
    connectionProfile = {},
} = {}) {
    const hints = [];
    const runtimeCatalog = capabilityInfo.runtime_catalog || [];
    const hasAttachedRuntime = runtimeCatalog.some((runtime) => runtime.attached);
    const backendWsBaseUrl = connectionProfile.backendWsBaseUrl || 'the backend websocket';

    if (status !== 'connected') {
        hints.push(`Connection is ${normalizeStatusLabel(status)}. Check reachability to ${backendWsBaseUrl} and use Reconnect.`);
    }

    if (!sessionInfo.bridge_connected) {
        hints.push('Desktop bridge is offline. Reload the VS Code window or run Pocket Vibe: Connect to Backend.');
    }

    if (!activeRuntime) {
        hints.push('No active runtime is selected yet. Use Manage to launch or attach one.');
    } else if (activeRuntime.health === 'degraded') {
        hints.push(activeRuntime.status_detail || activeRuntime.last_error || `${activeRuntime.label} is degraded.`);
    } else if (activeRuntime.health === 'offline') {
        hints.push(activeRuntime.last_error || `${activeRuntime.label} is offline on the desktop host.`);
    }

    if (runtimeCatalog.length > 0 && !hasAttachedRuntime) {
        hints.push('No runtime terminal is attached yet. Launch one from Manage before sending prompts.');
    }

    if (diagnostics.lastFailureReason && diagnostics.lastFailureReason !== 'No recent failures.') {
        hints.push(`Last failure: ${diagnostics.lastFailureReason}`);
    }

    return [...new Set(hints)].slice(0, 4);
}

export function buildSupportDebugBundle({
    status,
    sessionInfo = {},
    capabilityInfo = {},
    activeRuntime = null,
    diagnostics = {},
    connectionProfile = {},
    timestamp = new Date().toISOString(),
} = {}) {
    const runtimeCatalog = capabilityInfo.runtime_catalog || [];
    const runtimeSummary = runtimeCatalog.length
        ? runtimeCatalog.map((runtime) => {
            const supportCount = (runtime.supports || runtime.capabilities || []).join(',');
            return `${runtime.id}:${runtime.health}:${runtime.attached ? 'attached' : 'detached'}:${supportCount}`;
        }).join(' | ')
        : 'none';

    return [
        'Pocket Vibe Debug Bundle',
        `Timestamp: ${timestamp}`,
        `Client status: ${normalizeStatusLabel(status)}`,
        `Session token: ${maskToken(connectionProfile.token || sessionInfo.room_token || '')}`,
        `Saved profile: ${connectionProfile.hasSavedConfig ? 'yes' : 'no'}`,
        `Bridge connected: ${sessionInfo.bridge_connected ? 'yes' : 'no'}`,
        `Active runtime: ${activeRuntime?.id || capabilityInfo.active_runtime || sessionInfo.active_runtime || 'none'}`,
        `Runtime health: ${activeRuntime?.health || 'offline'}`,
        `Runtime detail: ${diagnostics.runtimeStatusDetail || 'none'}`,
        `Last dispatch: ${diagnostics.lastDispatchMessage || 'No dispatch yet.'}`,
        `Last failure: ${diagnostics.lastFailureReason || 'No recent failures.'}`,
        `Backend WS: ${connectionProfile.backendWsBaseUrl || 'missing'}`,
        `API Base: ${connectionProfile.apiBaseUrl || 'missing'}`,
        `Page URL: ${connectionProfile.pageUrl || 'unknown'}`,
        `Runtime catalog: ${runtimeSummary}`,
    ].join('\n');
}
