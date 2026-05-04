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
            label: '离线',
            canLaunch: false,
            canAttach: false,
            reason: '没有可用运行时。',
            isActive: false,
        };
    }

    const isActive = runtime.id === activeRuntimeId;
    if (runtime.attached) {
        return {
            state: isActive ? 'active' : 'attached',
            label: isActive ? '当前' : '已附加',
            canLaunch: false,
            canAttach: !isActive,
            reason: runtime.status_detail || `${runtime.label} 已附加。`,
            isActive,
        };
    }

    if (runtime.launchable) {
        return {
            state: 'launchable',
            label: '可启动',
            canLaunch: true,
            canAttach: false,
            reason: runtime.status_detail || `${runtime.label} 可以启动。`,
            isActive,
        };
    }

    return {
        state: 'offline',
        label: '离线',
        canLaunch: false,
        canAttach: false,
        reason: runtime.last_error || runtime.status_detail || `${runtime.label} 离线。`,
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
                    reason: host.last_error || `${hostLabel} 离线。`,
                };
            }
            if (!hostCapabilities.includes(capability)) {
                return {
                    state: 'unavailable',
                    enabled: false,
                    reason: `${hostLabel} 不支持 ${capability}。`,
                };
            }
            if (host.health === 'degraded') {
                return {
                    state: 'degraded',
                    enabled: true,
                    reason: host.status_detail || host.last_error || `${hostLabel} 处于降级模式。`,
                };
            }
            return {
                state: 'available',
                enabled: true,
                reason: `${hostLabel} 已就绪。`,
            };
        }
        return {
            state: 'unavailable',
            enabled: false,
            reason: '没有可用运行时。',
        };
    }

    if (runtime.health === 'offline') {
        return {
            state: 'unavailable',
            enabled: false,
            reason: runtime.last_error || `${runtime.label} 离线。`,
        };
    }

    const supports = getDescriptorCapabilities(runtime);
    if (!supports.includes(capability)) {
        const reasonByCapability = {
            approve: runtime.approval_mode === 'unsupported' ? '当前运行时不支持审批。' : '当前无法审批。',
            kill: runtime.interrupt_mode === 'unsupported' ? '当前运行时不支持中断。' : '当前无法中断。',
            run_script: '当前运行时不支持脚本执行。',
        };
        return {
            state: 'unavailable',
            enabled: false,
            reason: reasonByCapability[capability] || `当前运行时不支持 ${capability}。`,
        };
    }

    if (runtime.source === 'terminal' && runtime.attached === false) {
        if (capability === 'approve' || capability === 'run_script') {
            return {
                state: 'unavailable',
                enabled: false,
                reason: runtime.status_detail || `请先启动 ${runtime.label}，再使用 ${capability}。`,
            };
        }

        if (capability === 'kill' && !options.thinking) {
            return {
                state: 'unavailable',
                enabled: false,
                reason: runtime.status_detail || `请先启动 ${runtime.label} 或开始一次运行，再执行中断。`,
            };
        }

        return {
            state: 'degraded',
            enabled: true,
            reason: runtime.status_detail || `${runtime.label} 可用，但尚未附加。`,
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
                    ? '当前运行时正在使用剪贴板降级模式。'
                    : `${runtime.label} 处于降级模式。`),
        };
    }

    return {
        state: 'available',
        enabled: true,
        reason: `${runtime.label} 已就绪。`,
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
        lastDispatchMessage: lastDispatch?.message || '还没有派发记录。',
        lastDispatchTarget: lastDispatch?.target_runtime || activeRuntime?.id || null,
        lastFailureReason: lastFailure?.reason || lastFailure?.message || activeRuntime?.last_error || '最近没有失败。',
        runtimeStatusDetail: activeRuntime?.status_detail || activeRuntime?.last_error || '暂无运行时提示。',
    };
}
