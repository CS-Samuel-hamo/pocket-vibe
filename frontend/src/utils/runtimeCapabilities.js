export function getActiveRuntimeDescriptor(capabilityInfo = {}, sessionInfo = {}) {
    const runtimeCatalog = capabilityInfo.runtime_catalog || [];
    const activeRuntimeId = capabilityInfo.active_runtime || sessionInfo.active_runtime;
    return runtimeCatalog.find((runtime) => runtime.id === activeRuntimeId) || null;
}

export function getActiveHostDescriptor(capabilityInfo = {}, sessionInfo = {}) {
    if (capabilityInfo.host?.id || capabilityInfo.host?.host_id) {
        return capabilityInfo.host;
    }

    const hostRegistry = capabilityInfo.host_registry || sessionInfo.host_registry || [];
    const activeHostId = capabilityInfo.active_host_id || sessionInfo.active_host_id;
    return (
        hostRegistry.find((host) => (host.id || host.host_id) === activeHostId) ||
        hostRegistry[0] ||
        null
    );
}

function getDescriptorCapabilities(descriptor) {
    return descriptor?.supports || descriptor?.capabilities || descriptor?.session_capabilities || [];
}

function getDescriptorLabel(descriptor, fallback = 'Desktop Host') {
    return descriptor?.label || descriptor?.host_label || fallback;
}

export function getRuntimeLifecycleState(runtime, activeRuntimeId) {
    if (!runtime) {
        return {
            state: 'offline',
            label: 'offline',
            canLaunch: false,
            canAttach: false,
            reason: 'No runtime is available.',
            isActive: false,
        };
    }

    const isActive = runtime.id === activeRuntimeId;
    if (runtime.attached) {
        return {
            state: isActive ? 'active' : 'attached',
            label: isActive ? 'active' : 'attached',
            canLaunch: false,
            canAttach: !isActive,
            reason: runtime.status_detail || `${runtime.label} is attached.`,
            isActive,
        };
    }

    if (runtime.launchable) {
        return {
            state: 'launchable',
            label: 'ready to launch',
            canLaunch: true,
            canAttach: false,
            reason: runtime.status_detail || `${runtime.label} can be launched.`,
            isActive,
        };
    }

    return {
        state: 'offline',
        label: 'offline',
        canLaunch: false,
        canAttach: false,
        reason: runtime.last_error || runtime.status_detail || `${runtime.label} is offline.`,
        isActive,
    };
}

export function getCapabilityState(runtime, capability, options = {}) {
    if (!runtime) {
        const host = options.host || null;
        if (host) {
            const hostLabel = getDescriptorLabel(host);
            const hostCapabilities = getDescriptorCapabilities(host);
            if (host.health === 'offline') {
                return {
                    state: 'unavailable',
                    enabled: false,
                    reason: host.last_error || `${hostLabel} is offline.`,
                };
            }
            if (!hostCapabilities.includes(capability)) {
                return {
                    state: 'unavailable',
                    enabled: false,
                    reason: `${capability} is unsupported for ${hostLabel}.`,
                };
            }
            if (host.health === 'degraded') {
                return {
                    state: 'degraded',
                    enabled: true,
                    reason: host.status_detail || host.last_error || `${hostLabel} is degraded.`,
                };
            }
            return {
                state: 'available',
                enabled: true,
                reason: `${hostLabel} is ready.`,
            };
        }
        return {
            state: 'unavailable',
            enabled: false,
            reason: 'No active runtime is available.',
        };
    }

    if (runtime.health === 'offline') {
        return {
            state: 'unavailable',
            enabled: false,
            reason: runtime.last_error || `${runtime.label} is offline.`,
        };
    }

    const supports = getDescriptorCapabilities(runtime);
    if (!supports.includes(capability)) {
        const reasonByCapability = {
            approve: runtime.approval_mode === 'unsupported' ? 'Approval is unsupported for this runtime.' : 'Approval is unavailable.',
            kill: runtime.interrupt_mode === 'unsupported' ? 'Interrupt is unsupported for this runtime.' : 'Interrupt is unavailable.',
            run_script: 'Script execution is unsupported for this runtime.',
        };
        return {
            state: 'unavailable',
            enabled: false,
            reason: reasonByCapability[capability] || `${capability} is unsupported for this runtime.`,
        };
    }

    if (runtime.source === 'terminal' && runtime.attached === false) {
        if (capability === 'approve' || capability === 'run_script') {
            return {
                state: 'unavailable',
                enabled: false,
                reason: runtime.status_detail || `Launch ${runtime.label} before using ${capability}.`,
            };
        }

        if (capability === 'kill' && !options.thinking) {
            return {
                state: 'unavailable',
                enabled: false,
                reason: runtime.status_detail || `Launch ${runtime.label} or start a run before interrupting it.`,
            };
        }

        return {
            state: 'degraded',
            enabled: true,
            reason: runtime.status_detail || `${runtime.label} is available but not attached yet.`,
        };
    }

    if (runtime.health === 'degraded') {
        return {
            state: 'degraded',
            enabled: true,
            reason:
                runtime.status_detail ||
                runtime.last_error ||
                (runtime.dispatch_mode === 'clipboard_fallback'
                    ? 'This runtime is using clipboard fallback.'
                    : `${runtime.label} is degraded.`),
        };
    }

    return {
        state: 'available',
        enabled: true,
        reason: `${runtime.label} is ready.`,
    };
}

export function buildRuntimeDiagnostics(messages = [], sessionInfo = {}, capabilityInfo = {}) {
    const activeRuntime = getActiveRuntimeDescriptor(capabilityInfo, sessionInfo);
    const reversed = [...messages].reverse();
    const lastDispatch = reversed.find(
        (message) =>
            message.type === 'execution.event' &&
            ['dispatch', 'dispatched', 'focused'].includes(message.phase),
    );
    const lastFailure =
        reversed.find(
            (message) =>
                (message.type === 'execution.event' && message.phase === 'error') ||
                (message.type === 'approval.result' && message.ok === false) ||
                (message.type === 'kill.result' && message.ok === false),
        ) || null;

    return {
        bridgeConnected: Boolean(sessionInfo.bridge_connected),
        activeRuntime,
        lastDispatchMessage: lastDispatch?.message || 'No dispatch yet.',
        lastDispatchTarget: lastDispatch?.target_runtime || activeRuntime?.id || null,
        lastFailureReason: lastFailure?.reason || lastFailure?.message || activeRuntime?.last_error || 'No recent failures.',
        runtimeStatusDetail: activeRuntime?.status_detail || activeRuntime?.last_error || 'No runtime guidance yet.',
    };
}
