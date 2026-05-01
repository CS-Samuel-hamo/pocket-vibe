function getRuntimeLabel(runtime) {
    if (!runtime) {
        return 'Runtime';
    }
    return runtime.label || runtime.id || 'Runtime';
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
        headline: isLaunch ? `Launching ${runtimeLabel}...` : `Switching to ${runtimeLabel}...`,
        detail: isLaunch
            ? 'Waiting for the desktop host to create or focus the runtime terminal.'
            : 'Waiting for the desktop host to switch the active runtime.',
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
            headline: action === 'launch' ? `Failed to launch ${runtimeLabel}.` : `Failed to switch to ${runtimeLabel}.`,
            detail: reason || detail || 'The desktop host rejected the runtime request.',
            updatedAt: new Date().toISOString(),
        };
    }

    if (reason === 'runtime.attach.pending_launch') {
        return {
            action: 'attach',
            runtimeId: message.target_runtime,
            runtimeLabel,
            status: 'blocked',
            headline: `${runtimeLabel} is selected but not running yet.`,
            detail: detail || 'Launch it from the desktop host first.',
            updatedAt: new Date().toISOString(),
        };
    }

    if (reason === 'runtime.launch') {
        return {
            action: 'launch',
            runtimeId: message.target_runtime,
            runtimeLabel,
            status: 'success',
            headline: `${runtimeLabel} launched.`,
            detail: detail || `${runtimeLabel} is ready in VS Code.`,
            updatedAt: new Date().toISOString(),
        };
    }

    if (reason === 'runtime.attach') {
        return {
            action,
            runtimeId: message.target_runtime,
            runtimeLabel,
            status: 'success',
            headline: `${runtimeLabel} is active.`,
            detail: detail || `${runtimeLabel} is now the active runtime.`,
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
            headline: `${runtime.label} launched.`,
            detail: runtime.status_detail || `${runtime.label} is ready.`,
            updatedAt: new Date().toISOString(),
        };
    }

    if (currentState.action === 'attach' && activeRuntimeId === runtime.id) {
        return {
            ...currentState,
            status: 'success',
            headline: `${runtime.label} is active.`,
            detail: runtime.status_detail || `${runtime.label} is now the active runtime.`,
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
        launchLabel:
            runtimeActionState.action === 'launch' && isPending
                ? 'Launching...'
                : runtimeActionState.status === 'success' && runtimeActionState.action === 'launch'
                    ? 'Launched'
                    : 'Launch',
        attachLabel:
            runtimeActionState.action === 'attach' && isPending
                ? 'Switching...'
                : runtimeActionState.status === 'success' && runtimeActionState.action === 'attach'
                    ? 'Active'
                    : 'Use',
    };
}
