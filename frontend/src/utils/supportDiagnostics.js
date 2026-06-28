function normalizeStatusLabel(status = '') {
    const normalized = String(status || 'unknown').replace(/_/g, ' ');
    const labels = {
        connected: '已连接',
        connecting: '连接中',
        disconnected: '已断开',
        error: '异常',
        unknown: '未知',
    };
    return labels[normalized] || normalized;
}

export function maskToken(token = '') {
    const normalized = String(token || '').trim();
    if (!normalized) {
        return 'missing';
    }

    if (normalized.length <= 8) {
        return `${normalized.slice(0, 2)}...${normalized.slice(-2)}`;
    }

    return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
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
    const backendWsBaseUrl = connectionProfile.backendWsBaseUrl || '后端 WebSocket';

    if (status !== 'connected') {
        hints.push(`连接状态：${normalizeStatusLabel(status)}。请检查手机是否能访问 ${backendWsBaseUrl}，然后点击重连。`);
    }

    if (!sessionInfo.bridge_connected) {
        hints.push('桌面 bridge 离线。请重载 VS Code 窗口，或运行 Pocket Vibe: Connect to Backend。');
    }

    if (!activeRuntime) {
        hints.push('还没有可用运行时。请在运行时管理里启动或附加一个运行时。');
    } else if (activeRuntime.health === 'degraded') {
        hints.push(activeRuntime.status_detail || activeRuntime.last_error || `${activeRuntime.label} is degraded.`);
    } else if (activeRuntime.health === 'offline') {
        hints.push(activeRuntime.last_error || `${activeRuntime.label} 在桌面端离线。`);
    }

    if (runtimeCatalog.length > 0 && !hasAttachedRuntime) {
        hints.push('还没有附加运行时终端。发送指令前，请先从运行时管理里启动一个。');
    }

    if (
        diagnostics.lastFailureReason &&
        !['No recent failures.', '最近没有失败。'].includes(diagnostics.lastFailureReason)
    ) {
        hints.push(`最近失败：${diagnostics.lastFailureReason}`);
    }

    return [...new Set(hints)].slice(0, 4);
}

export function getPrimaryDiagnosticErrorCode({
    status,
    sessionInfo = {},
    activeRuntime = null,
    diagnostics = {},
} = {}) {
    if (status && status !== 'connected') {
        return 'PV-CONN-002';
    }

    if (!sessionInfo.bridge_connected) {
        return 'PV-CONN-003';
    }

    if (diagnostics.lastFailureReason === 'unsupported') {
        return 'PV-RUN-003';
    }

    if (!activeRuntime) {
        return 'PV-RUN-001';
    }

    if (activeRuntime.health === 'degraded') {
        return 'PV-RUN-002';
    }

    if (activeRuntime.health === 'offline') {
        return 'PV-RUN-001';
    }

    if (
        diagnostics.lastFailureReason &&
        !['No recent failures.', '最近没有失败。'].includes(diagnostics.lastFailureReason)
    ) {
        return 'PV-RUN-004';
    }

    return 'none';
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
    const primaryErrorCode = getPrimaryDiagnosticErrorCode({
        status,
        sessionInfo,
        activeRuntime,
        diagnostics,
    });

    return [
        'Pocket Vibe Debug Bundle',
        `Timestamp: ${timestamp}`,
        `Primary error code: ${primaryErrorCode}`,
        'Payload redaction: default (prompt/output/source omitted)',
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
