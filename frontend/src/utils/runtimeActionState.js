function getRuntimeLabel(runtime) {
    if (!runtime) {
        return '运行时';
    }
    return runtime.label || runtime.runtimeLabel || runtime.id || '运行时';
}

function inferActionFromReason(reason = '') {
    if (reason.startsWith('runtime.launch')) {
        return 'launch';
    }
    if (reason.startsWith('runtime.attach')) {
        return 'attach';
    }
    return null;
}

export function createRuntimeActionState(action, runtime) {
    const runtimeId = runtime?.id || null;
    const runtimeLabel = getRuntimeLabel(runtime);
    const isLaunch = action === 'launch';

    return {
        action,
        runtimeId,
        runtimeLabel,
        status: 'pending',
        headline: isLaunch ? `正在启动 ${runtimeLabel}...` : `正在切换到 ${runtimeLabel}...`,
        detail: isLaunch
            ? '等待桌面宿主创建或聚焦运行时终端。'
            : '等待桌面宿主切换当前运行时。',
        updatedAt: new Date().toISOString(),
    };
}

export function reduceRuntimeActionWithEvent(currentState, message, runtimeCatalog = []) {
    if (!message || message.type !== 'execution.event' || !message.target_runtime) {
        return currentState;
    }

    const runtime = runtimeCatalog.find((item) => item.id === message.target_runtime);
    const runtimeLabel = getRuntimeLabel(runtime || currentState);
    const inferredAction = inferActionFromReason(String(message.reason || ''));
    const action = currentState?.runtimeId === message.target_runtime
        ? currentState.action
        : inferredAction;

    if (!action) {
        return currentState;
    }

    if (currentState?.status === 'pending' && currentState.runtimeId !== message.target_runtime) {
        return currentState;
    }

    const reason = String(message.reason || '').trim();
    const detail = String(message.message || reason || '').trim();

    if (message.phase === 'error') {
        return {
            action,
            runtimeId: message.target_runtime,
            runtimeLabel,
            status: 'error',
            headline: action === 'launch' ? `${runtimeLabel} 启动失败。` : `切换到 ${runtimeLabel} 失败。`,
            detail: reason || detail || '桌面宿主拒绝了运行时请求。',
            updatedAt: new Date().toISOString(),
        };
    }

    if (reason === 'runtime.attach.pending_launch') {
        return {
            action: 'attach',
            runtimeId: message.target_runtime,
            runtimeLabel,
            status: 'blocked',
            headline: `已选择 ${runtimeLabel}，但它还没有运行。`,
            detail: detail || '请先从桌面宿主启动它。',
            updatedAt: new Date().toISOString(),
        };
    }

    if (reason === 'runtime.launch') {
        return {
            action: 'launch',
            runtimeId: message.target_runtime,
            runtimeLabel,
            status: 'success',
            headline: `${runtimeLabel} 已启动。`,
            detail: detail || `${runtimeLabel} 已在 VS Code 中就绪。`,
            updatedAt: new Date().toISOString(),
        };
    }

    if (reason === 'runtime.attach') {
        return {
            action,
            runtimeId: message.target_runtime,
            runtimeLabel,
            status: 'success',
            headline: `${runtimeLabel} 已成为当前运行时。`,
            detail: detail || `${runtimeLabel} 现在是当前运行时。`,
            updatedAt: new Date().toISOString(),
        };
    }

    return currentState;
}

export function reconcileRuntimeActionWithCapabilities(currentState, capabilityInfo = {}, sessionInfo = {}) {
    if (!currentState || currentState.status !== 'pending' || !currentState.runtimeId) {
        return currentState;
    }

    const runtimeCatalog = capabilityInfo.runtime_catalog || [];
    const activeRuntimeId = capabilityInfo.active_runtime || sessionInfo.active_runtime;
    const runtime = runtimeCatalog.find((item) => item.id === currentState.runtimeId);

    if (!runtime) {
        return currentState;
    }

    if (currentState.action === 'launch' && runtime.attached && activeRuntimeId === runtime.id) {
        return {
            ...currentState,
            status: 'success',
            headline: `${runtime.label} 已启动。`,
            detail: runtime.status_detail || `${runtime.label} 已就绪。`,
            updatedAt: new Date().toISOString(),
        };
    }

    if (currentState.action === 'attach' && activeRuntimeId === runtime.id) {
        return {
            ...currentState,
            status: 'success',
            headline: `${runtime.label} 已成为当前运行时。`,
            detail: runtime.status_detail || `${runtime.label} 现在是当前运行时。`,
            updatedAt: new Date().toISOString(),
        };
    }

    return currentState;
}

export function getRuntimeActionForRuntime(runtimeActionState, runtimeId) {
    if (!runtimeActionState || runtimeActionState.runtimeId !== runtimeId) {
        return null;
    }

    const isPending = runtimeActionState.status === 'pending';
    return {
        ...runtimeActionState,
        isPending,
        stateLabel:
            runtimeActionState.status === 'pending'
                ? runtimeActionState.action === 'launch'
                    ? 'launching'
                    : 'switching'
                : runtimeActionState.status,
        statusLabel:
            runtimeActionState.status === 'pending'
                ? runtimeActionState.action === 'launch'
                    ? '启动中'
                    : '切换中'
                : runtimeActionState.status,
        launchLabel:
            runtimeActionState.action === 'launch' && isPending
                ? '启动中...'
                : runtimeActionState.status === 'success' && runtimeActionState.action === 'launch'
                    ? '已启动'
                    : '启动',
        attachLabel:
            runtimeActionState.action === 'attach' && isPending
                ? '切换中...'
                : runtimeActionState.status === 'success' && runtimeActionState.action === 'attach'
                    ? '当前'
                    : '使用',
    };
}
