export type RuntimeId =
    | 'codex-cli'
    | 'claude-code'
    | 'opencode'
    | 'antigravity'
    | 'continue-ext'
    | 'cline-ext'
    | 'roo-ext'
    | 'copilot-ext';

export type Capability = 'prompt' | 'focus' | 'read_context' | 'approve' | 'kill' | 'run_script';

export type RuntimeHealth = 'ready' | 'degraded' | 'offline';

export type DispatchMode = 'raw_prompt' | 'clipboard_fallback';
export type ApprovalMode = 'terminal_yes_no' | 'unsupported';
export type InterruptMode = 'ctrl_c' | 'unsupported';
export type RuntimeSource = 'terminal' | 'extension';

export interface RuntimeDefinition {
    id: RuntimeId;
    label: string;
    source: RuntimeSource;
    supports: Capability[];
    dispatch_mode: DispatchMode;
    approval_mode: ApprovalMode;
    interrupt_mode: InterruptMode;
}

export interface RuntimeDetection {
    available: boolean;
    attached?: boolean;
    launchable?: boolean;
    terminalName?: string;
    extensionId?: string;
    last_error?: string;
    status_detail?: string;
}

export interface RuntimeDescriptor {
    id: RuntimeId;
    label: string;
    source: RuntimeSource;
    available: boolean;
    capabilities: Capability[];
    supports: Capability[];
    dispatch_mode: DispatchMode;
    approval_mode: ApprovalMode;
    interrupt_mode: InterruptMode;
    health: RuntimeHealth;
    attached: boolean;
    launchable: boolean;
    last_error?: string;
    status_detail?: string;
    terminalName?: string;
    extensionId?: string;
}

export function createRuntimeDescriptor(
    definition: RuntimeDefinition,
    detection: RuntimeDetection,
): RuntimeDescriptor {
    const attached = detection.attached ?? Boolean(detection.terminalName || detection.extensionId);
    const launchable = detection.launchable ?? attached;
    const health: RuntimeHealth = !detection.available
        ? 'offline'
        : detection.last_error || !attached
            ? 'degraded'
        : definition.source === 'terminal'
            ? 'ready'
            : 'degraded';
    const statusDetail =
        detection.status_detail ||
        (health === 'offline'
            ? `${definition.label} is not detected in VS Code.`
            : attached
                ? definition.source === 'terminal'
                    ? `${definition.label} is attached to this workspace.`
                    : `${definition.label} is available via extension fallback.`
                : launchable
                    ? `${definition.label} is available to launch from VS Code.`
                    : undefined);

    return {
        id: definition.id,
        label: definition.label,
        source: definition.source,
        available: detection.available,
        capabilities: [...definition.supports],
        supports: [...definition.supports],
        dispatch_mode: definition.dispatch_mode,
        approval_mode: definition.approval_mode,
        interrupt_mode: definition.interrupt_mode,
        health,
        attached,
        launchable,
        last_error:
            detection.last_error ||
            (health === 'offline' ? `${definition.label} is not detected in VS Code.` : undefined),
        status_detail: statusDetail,
        terminalName: detection.terminalName,
        extensionId: detection.extensionId,
    };
}

export function selectActiveRuntime(
    catalog: RuntimeDescriptor[],
    preferredRuntime?: string,
    activeTerminalName?: string,
): RuntimeDescriptor | null {
    const preferred = preferredRuntime
        ? catalog.find((runtime) => runtime.id === preferredRuntime && runtime.health !== 'offline')
        : null;
    if (preferred) {
        return preferred;
    }

    const activeTerminal = activeTerminalName?.trim().toLowerCase();
    if (activeTerminal) {
        const fromTerminal = catalog.find(
            (runtime) =>
                runtime.health !== 'offline' &&
                runtime.terminalName?.trim().toLowerCase() === activeTerminal,
        );
        if (fromTerminal) {
            return fromTerminal;
        }
    }

    return (
        catalog.find((runtime) => runtime.health === 'ready') ||
        catalog.find((runtime) => runtime.health === 'degraded') ||
        null
    );
}

export function capabilityIsSupported(
    runtime: RuntimeDescriptor | null,
    capability: Capability,
): boolean {
    return Boolean(runtime && runtime.health !== 'offline' && runtime.supports.includes(capability));
}
