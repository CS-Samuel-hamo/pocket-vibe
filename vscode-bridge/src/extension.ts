import * as vscode from 'vscode';
import { randomUUID } from 'crypto';

import {
    capabilityIsSupported,
    createRuntimeDescriptor,
    selectActiveRuntime,
    type Capability,
    type RuntimeDescriptor,
    type RuntimeId,
} from './runtimeRegistry';
import { looksLikeExecutablePath, resolveRuntimeLaunchSpec } from './runtimeLaunch';
import { terminateActiveRuntimeProcess } from './codexExecRuntime';
import {
    connectToBackend as openBackendConnection,
    createBackendConnectionState,
    disconnectFromBackend,
    isBackendConnected,
    sendBackendMessage,
    type BackendConnectionDependencies,
    type ConnectionOptions,
    type ConnectionStatus,
} from './backendConnection';
import {
    persistConnectionSettings,
    resolveAuthToken,
    resolveBackendUrl,
} from './bridgeSettings';
import { isCommandAvailable } from './commandAvailability';
import { formatLineTarget } from './messageFormatting';
import {
    createRuntimeAdapters,
    isTerminalRuntimeAdapter,
    type RuntimeAdapter,
    type TerminalRuntimeAdapter,
} from './runtimeAdapters';
import { runCommandInProjectShell as executeProjectShellCommand } from './shellExecution';
import {
    handleContextRequest as requestWorkspaceContext,
    handleWorkspaceFocus as focusWorkspace,
} from './workspaceActions';
import {
    buildWorkspaceProjectMetadata,
    resolveWorkspaceRootPath,
    withProjectContext,
} from './workspaceProjects';
import { dispatchPromptToRuntime } from './promptDispatch';

interface BackendMessage {
    type: string;
    [key: string]: any;
}

const SESSION_CAPABILITIES: Capability[] = ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'];
const BRIDGE_ROLE = 'vscode-bridge';
const BRIDGE_LABEL = 'VS Code Host';
const HOST_INSTANCE_ID_KEY = 'pocketVibe.hostInstanceId';

let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;
const runtimeErrorState = new Map<RuntimeId, string>();
let cachedHostInstanceId: string | null = null;
const backendConnection = createBackendConnectionState();

const runCommandInProjectShell = (command: string, targetRuntime?: string, workspaceRoot?: string) =>
    executeProjectShellCommand(command, targetRuntime, { sendToBackend }, workspaceRoot);
const workspaceActionDependencies = { sendToBackend, getActiveRuntimeId: () => getActiveRuntimeDescriptor()?.id };
const runtimeAdapters: RuntimeAdapter[] = createRuntimeAdapters({
    runCommandInProjectShell,
    isCommandAvailable,
    getRuntimeError: (runtimeId) => runtimeErrorState.get(runtimeId),
});

function buildProjectMetadata() {
    const host = buildHostMetadata();
    return buildWorkspaceProjectMetadata(host, BRIDGE_LABEL);
}

function getOrCreateHostInstanceId(): string {
    if (cachedHostInstanceId) {
        return cachedHostInstanceId;
    }

    const existing = extensionContext.globalState.get<string>(HOST_INSTANCE_ID_KEY);
    if (existing) {
        cachedHostInstanceId = existing;
        return existing;
    }

    const generated = `vscode-host-${randomUUID()}`;
    cachedHostInstanceId = generated;
    void extensionContext.globalState.update(HOST_INSTANCE_ID_KEY, generated);
    return generated;
}

function buildHostMetadata() {
    return {
        id: getOrCreateHostInstanceId(),
        label: BRIDGE_LABEL,
        platform: 'vscode',
        kind: 'ide-host',
        version: String(extensionContext.extension.packageJSON.version || ''),
    };
}

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'pocket-vibe.connect';
    statusBarItem.text = '$(debug-disconnect) Pocket Vibe: Configure';
    statusBarItem.show();

    context.subscriptions.push(
        statusBarItem,
        vscode.commands.registerCommand('pocket-vibe.connect', () => connectToBackend()),
        vscode.commands.registerCommand('pocket-vibe.disconnect', () => disconnect()),
        vscode.commands.registerCommand('pocket-vibe.launchPreferredRuntime', () => manuallyLaunchPreferredRuntime()),
        vscode.commands.registerCommand('pocket-vibe.attachPreferredRuntime', () => manuallyAttachPreferredRuntime()),
        vscode.window.onDidOpenTerminal(() => void reportCapabilities()),
        vscode.window.onDidCloseTerminal(() => void reportCapabilities()),
        vscode.workspace.onDidChangeWorkspaceFolders(() => void reportCapabilities(true)),
        vscode.window.onDidChangeActiveTerminal(() => void reportCapabilities()),
    );

    void initializeConnection();
}

async function initializeConnection() {
    const authToken = await resolveAuthToken(false);
    if (authToken) {
        await connectToBackend({ promptForToken: false, showConnectionErrors: false });
        return;
    }
    updateStatusBar('configure');
}

function getConnectionDependencies(): BackendConnectionDependencies {
    return {
        bridgeRole: BRIDGE_ROLE,
        resolveBackendUrl,
        resolveAuthToken,
        persistConnectionSettings,
        updateStatusBar,
        handleMessage,
        ensurePreferredRuntimeReady,
        reportCapabilities,
    };
}

async function connectToBackend(options: ConnectionOptions = {}) {
    await openBackendConnection(backendConnection, getConnectionDependencies(), options);
}

function disconnect() {
    disconnectFromBackend(backendConnection, getConnectionDependencies());
}

function updateStatusBar(state: ConnectionStatus) {
    const activeRuntime = getActiveRuntimeDescriptor();
    if (state === 'connected') {
        const healthSuffix = activeRuntime ? ` (${activeRuntime.health})` : '';
        statusBarItem.text = `$(debug-start) Pocket Vibe: ${activeRuntime?.label ?? 'Linked'}${healthSuffix}`;
        statusBarItem.color = activeRuntime?.health === 'degraded' ? '#ffaa00' : '#4ec9b0';
        statusBarItem.command = 'pocket-vibe.disconnect';
        void vscode.commands.executeCommand('setContext', 'pocketVibeConnected', true);
        return;
    }

    const labels: Record<typeof state, string> = {
        configure: 'Pocket Vibe: Configure',
        connecting: 'Pocket Vibe: Connecting',
        disconnected: 'Pocket Vibe: Off',
        error: 'Pocket Vibe: Error',
    };
    statusBarItem.text = `$(debug-disconnect) ${labels[state]}`;
    statusBarItem.color = undefined;
    statusBarItem.command = 'pocket-vibe.connect';
    void vscode.commands.executeCommand('setContext', 'pocketVibeConnected', false);
}

async function handleMessage(message: BackendMessage) {
    switch (message.type) {
        case 'hello':
        case 'capabilities':
        case 'session.state':
        case 'pong':
            return;
        case 'prompt.submit':
            await handlePromptSubmit(message);
            return;
        case 'command.dispatch':
            await handleCommandDispatch(message);
            return;
        case 'workspace.focus':
            await focusWorkspace(message, workspaceActionDependencies);
            return;
        case 'context.request':
            await requestWorkspaceContext(message, workspaceActionDependencies);
            return;
        case 'approval.response':
            await handleApprovalResponse(message);
            return;
        case 'kill.request':
            await handleKillRequest(message);
            return;
        default:
            console.log('Pocket Vibe: unknown message type', message.type);
    }
}

async function handlePromptSubmit(message: BackendMessage) {
    const prompt = String(message.prompt ?? '').trim();
    if (!prompt) {
        return;
    }

    const runtimeContext = resolveRuntimeContext(message.target_runtime);
    if (!runtimeContext || !capabilityIsSupported(runtimeContext.descriptor, 'prompt')) {
        sendToBackend(withProjectContext({
            type: 'execution.event',
            phase: 'error',
            message: 'No runtime is available to receive the prompt.',
            target_runtime: message.target_runtime,
            reason: runtimeContext?.descriptor.last_error || 'No ready runtime supports prompt dispatch.',
        }, message));
        return;
    }

    try {
        await dispatchPromptToRuntime(
            prompt,
            runtimeContext,
            message,
            { sendToBackend, reportCapabilities, recordRuntimeError },
        );
        clearRuntimeError(runtimeContext.descriptor.id);
        sendToBackend(withProjectContext({
            type: 'execution.event',
            phase: 'dispatched',
            message: `Prompt sent to ${runtimeContext.descriptor.label}.`,
            target_runtime: runtimeContext.descriptor.id,
            reason: runtimeContext.descriptor.dispatch_mode,
        }, message));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeContext.descriptor.id, reason);
        sendToBackend(withProjectContext({
            type: 'execution.event',
            phase: 'error',
            message: `Prompt dispatch failed for ${runtimeContext.descriptor.label}.`,
            target_runtime: runtimeContext.descriptor.id,
            reason,
        }, message));
    }

    await reportCapabilities();
}

async function handleCommandDispatch(message: BackendMessage) {
    const action = String(message.action ?? '').trim() || 'run_script';
    if (action === 'focus') {
        await focusWorkspace(message, workspaceActionDependencies);
        return;
    }
    if (action === 'runtime.launch') {
        await handleRuntimeLaunch(message);
        return;
    }
    if (action === 'runtime.attach') {
        await handleRuntimeAttach(message);
        return;
    }

    const runtimeContext = resolveRuntimeContext(message.target_runtime);
    const targetRuntime = runtimeContext?.descriptor.id || message.target_runtime;
    if (!runtimeContext) {
        sendToBackend(withProjectContext({
            type: 'execution.event',
            phase: 'error',
            message: 'No runtime is available to receive the command.',
            action,
            target_runtime: targetRuntime,
            reason: 'No ready or degraded runtime is available.',
        }, message));
        return;
    }

    const needsRunScript = action === 'run_script';
    const requiredCapability: Capability = needsRunScript ? 'run_script' : 'prompt';
    if (!capabilityIsSupported(runtimeContext.descriptor, requiredCapability)) {
        sendToBackend(withProjectContext({
            type: 'execution.event',
            phase: 'error',
            message: `Command ${action} is not supported by ${runtimeContext.descriptor.label}.`,
            action,
            target_runtime: runtimeContext.descriptor.id,
            reason: runtimeContext.descriptor.last_error || `${requiredCapability} is unsupported.`,
        }, message));
        return;
    }

    try {
        const workspaceRoot = resolveWorkspaceRootPath(message);
        if (needsRunScript) {
            await runtimeContext.adapter.runScript(String(message.command ?? ''), workspaceRoot);
        } else if (action === 'rewrite' || action === 'explain') {
            const lineTarget = formatLineTarget(message.file, message.lines, message.line);
            const instruction = String(message.instruction ?? action);
            await runtimeContext.adapter.sendPrompt(`${action.toUpperCase()}: ${instruction}\nTARGET: ${lineTarget}`);
            if (message.file) await focusWorkspace(message, workspaceActionDependencies);
        } else {
            await runtimeContext.adapter.sendPrompt(JSON.stringify(message));
        }

        clearRuntimeError(runtimeContext.descriptor.id);
        sendToBackend(withProjectContext({
            type: 'execution.event',
            phase: 'dispatched',
            message: needsRunScript
                ? `Script sent to the desktop shell for ${runtimeContext.descriptor.label}.`
                : `Command ${action} sent to ${runtimeContext.descriptor.label}.`,
            action,
            target_runtime: runtimeContext.descriptor.id,
            reason: needsRunScript ? 'workspace_shell' : runtimeContext.descriptor.dispatch_mode,
        }, message));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeContext.descriptor.id, reason);
        sendToBackend(withProjectContext({
            type: 'execution.event',
            phase: 'error',
            message: `Command ${action} failed for ${runtimeContext.descriptor.label}.`,
            action,
            target_runtime: runtimeContext.descriptor.id,
            reason,
        }, message));
    }

    await reportCapabilities();
}

async function handleApprovalResponse(message: BackendMessage) {
    const runtimeContext = resolveRuntimeContext(message.target_runtime);
    if (!runtimeContext) {
        sendToBackend({
            type: 'approval.result',
            approval_id: message.approval_id,
            decision: message.decision,
            ok: false,
            message: 'No runtime is available to receive the approval response.',
            reason: 'No ready or degraded runtime is available.',
            target_runtime: message.target_runtime,
        });
        return;
    }

    if (!capabilityIsSupported(runtimeContext.descriptor, 'approve')) {
        sendToBackend({
            type: 'approval.result',
            approval_id: message.approval_id,
            decision: message.decision,
            ok: false,
            message: `${runtimeContext.descriptor.label} does not support approval responses.`,
            reason: runtimeContext.descriptor.approval_mode,
            target_runtime: runtimeContext.descriptor.id,
        });
        return;
    }

    try {
        await runtimeContext.adapter.approve(String(message.decision ?? 'rejected'));
        clearRuntimeError(runtimeContext.descriptor.id);
        sendToBackend({
            type: 'approval.result',
            approval_id: message.approval_id,
            decision: message.decision,
            ok: true,
            target_runtime: runtimeContext.descriptor.id,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeContext.descriptor.id, reason);
        sendToBackend({
            type: 'approval.result',
            approval_id: message.approval_id,
            decision: message.decision,
            ok: false,
            message: `Approval response failed for ${runtimeContext.descriptor.label}.`,
            reason,
            target_runtime: runtimeContext.descriptor.id,
        });
    }

    await reportCapabilities();
}

async function handleKillRequest(message: BackendMessage) {
    const runtimeContext = resolveRuntimeContext(message.target_runtime);
    if (!runtimeContext) {
        sendToBackend({
            type: 'kill.result',
            ok: false,
            message: 'No runtime is available to interrupt.',
            reason: 'No ready or degraded runtime is available.',
            target_runtime: message.target_runtime,
        });
        return;
    }

    if (!capabilityIsSupported(runtimeContext.descriptor, 'kill')) {
        sendToBackend({
            type: 'kill.result',
            ok: false,
            message: `${runtimeContext.descriptor.label} does not support interrupt requests.`,
            reason: runtimeContext.descriptor.interrupt_mode,
            target_runtime: runtimeContext.descriptor.id,
        });
        return;
    }

    try {
        const interruptedProcess = terminateActiveRuntimeProcess(runtimeContext.descriptor.id);
        if (!interruptedProcess) {
            await runtimeContext.adapter.kill();
        }
        clearRuntimeError(runtimeContext.descriptor.id);
        sendToBackend({
            type: 'execution.event',
            phase: 'runtime',
            message: interruptedProcess
                ? `Sent a hard interrupt to ${runtimeContext.descriptor.label}.`
                : `Sent Ctrl+C to ${runtimeContext.descriptor.label}.`,
            reason: interruptedProcess ? 'runtime.kill.process' : 'runtime.kill.terminal',
            target_runtime: runtimeContext.descriptor.id,
        });
        sendToBackend({
            type: 'kill.result',
            ok: true,
            message: `Interrupted ${runtimeContext.descriptor.label}.`,
            reason: runtimeContext.descriptor.interrupt_mode,
            target_runtime: runtimeContext.descriptor.id,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeContext.descriptor.id, reason);
        sendToBackend({
            type: 'kill.result',
            ok: false,
            message: `Interrupt failed for ${runtimeContext.descriptor.label}.`,
            reason,
            target_runtime: runtimeContext.descriptor.id,
        });
    }

    await reportCapabilities();
}

async function handleRuntimeLaunch(message: BackendMessage) {
    const runtimeId = String(message.target_runtime ?? '').trim() as RuntimeId;
    if (!runtimeId) {
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: 'No runtime was specified for launch.',
            reason: 'runtime.launch.missing_target',
        });
        return;
    }

    const adapter = findRuntimeAdapter(runtimeId);
    const descriptor = getRuntimeDescriptorById(runtimeId);
    if (!adapter || !descriptor) {
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Unknown runtime ${runtimeId}.`,
            target_runtime: runtimeId,
            reason: 'runtime.launch.unknown',
        });
        return;
    }

    if (!isTerminalRuntimeAdapter(adapter)) {
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `${descriptor.label} cannot be launched from the desktop bridge.`,
            target_runtime: runtimeId,
            reason: 'runtime.launch.unsupported',
        });
        return;
    }

    const launchSpec = resolveRuntimeLaunchSpec(runtimeId);
    if (!launchSpec || !isCommandAvailable(launchSpec.command)) {
        const reason = descriptor.last_error || `${descriptor.label} is not launchable on this machine.`;
        recordRuntimeError(runtimeId, reason);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Launch failed for ${descriptor.label}.`,
            target_runtime: runtimeId,
            reason,
        });
        await reportCapabilities();
        return;
    }

    try {
        await setPreferredRuntime(runtimeId);
        const existingTerminal = adapter.findTerminal();
        const terminal = await adapter.ensureRunning(launchSpec);
        terminal.show();
        clearRuntimeError(runtimeId);
        sendToBackend({
            type: 'execution.event',
            phase: 'runtime',
            message: existingTerminal
                ? `${descriptor.label} was already attached. Switched it to the active runtime.`
                : `Launched ${descriptor.label} in VS Code.`,
            target_runtime: runtimeId,
            reason: existingTerminal ? 'runtime.attach' : 'runtime.launch',
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeId, reason);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Launch failed for ${descriptor.label}.`,
            target_runtime: runtimeId,
            reason,
        });
    }

    await reportCapabilities();
}

async function ensureRuntimeAttachTargetReady(
    adapter: RuntimeAdapter,
    descriptor: RuntimeDescriptor,
    runtimeId: RuntimeId,
): Promise<boolean> {
    if (!isTerminalRuntimeAdapter(adapter)) {
        return true;
    }

    const terminal = adapter.findTerminal();
    if (terminal) {
        terminal.show();
        return true;
    }

    if (!descriptor.launchable) {
        const reason = descriptor.last_error || `${descriptor.label} is not available in this VS Code window.`;
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Attach failed for ${descriptor.label}.`,
            target_runtime: runtimeId,
            reason,
        });
        await reportCapabilities();
        return false;
    }

    sendToBackend({
        type: 'execution.event',
        phase: 'runtime',
        message: `${descriptor.label} is selected, but not attached yet. Launch it first.`,
        target_runtime: runtimeId,
        reason: 'runtime.attach.pending_launch',
    });
    await reportCapabilities();
    return false;
}

async function handleRuntimeAttach(message: BackendMessage) {
    const runtimeId = String(message.target_runtime ?? '').trim() as RuntimeId;
    if (!runtimeId) {
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: 'No runtime was specified for attach.',
            reason: 'runtime.attach.missing_target',
        });
        return;
    }

    const adapter = findRuntimeAdapter(runtimeId);
    const descriptor = getRuntimeDescriptorById(runtimeId);
    if (!adapter || !descriptor) {
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Unknown runtime ${runtimeId}.`,
            target_runtime: runtimeId,
            reason: 'runtime.attach.unknown',
        });
        return;
    }

    try {
        await setPreferredRuntime(runtimeId);
        const ready = await ensureRuntimeAttachTargetReady(adapter, descriptor, runtimeId);
        if (!ready) {
            return;
        }

        clearRuntimeError(runtimeId);
        sendToBackend({
            type: 'execution.event',
            phase: 'runtime',
            message: `Attached Pocket Vibe to ${descriptor.label}.`,
            target_runtime: runtimeId,
            reason: 'runtime.attach',
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeId, reason);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Attach failed for ${descriptor.label}.`,
            target_runtime: runtimeId,
            reason,
        });
    }

    await reportCapabilities();
}

function getRuntimeCatalog(): RuntimeDescriptor[] {
    return runtimeAdapters.map((adapter) =>
        createRuntimeDescriptor(adapter.definition, adapter.detect()),
    );
}

function getActiveRuntimeDescriptor(catalog = getRuntimeCatalog()): RuntimeDescriptor | null {
    const preferredRuntime = vscode.workspace
        .getConfiguration('pocketVibe')
        .get<string>('preferredRuntime')
        ?.trim();
    return selectActiveRuntime(catalog, preferredRuntime, vscode.window.activeTerminal?.name);
}

function getRuntimeDescriptorById(
    runtimeId: RuntimeId,
    catalog = getRuntimeCatalog(),
): RuntimeDescriptor | null {
    return catalog.find((runtime) => runtime.id === runtimeId) || null;
}

function findRuntimeAdapter(runtimeId?: string | null): RuntimeAdapter | null {
    if (!runtimeId) {
        return null;
    }
    return runtimeAdapters.find((candidate) => candidate.definition.id === runtimeId) || null;
}

function resolveRuntimeContext(targetRuntime?: string): { adapter: RuntimeAdapter; descriptor: RuntimeDescriptor } | null {
    const catalog = getRuntimeCatalog();
    const resolvedDescriptor =
        (targetRuntime
            ? catalog.find((runtime) => runtime.id === targetRuntime)
            : getActiveRuntimeDescriptor(catalog)) || null;

    if (!resolvedDescriptor || resolvedDescriptor.health === 'offline') {
        return null;
    }

    const adapter = runtimeAdapters.find((candidate) => candidate.definition.id === resolvedDescriptor.id);
    if (!adapter) {
        return null;
    }

    return { adapter, descriptor: resolvedDescriptor };
}

function recordRuntimeError(runtimeId: RuntimeId, reason: string) {
    runtimeErrorState.set(runtimeId, reason);
}

function clearRuntimeError(runtimeId: RuntimeId) {
    runtimeErrorState.delete(runtimeId);
}

async function reportCapabilities(includeHello = false) {
    if (!isBackendConnected(backendConnection)) {
        return;
    }

    const runtimeCatalog = getRuntimeCatalog();
    const activeRuntime = getActiveRuntimeDescriptor(runtimeCatalog);
    const host = buildHostMetadata();
    const project = buildProjectMetadata();

    if (includeHello) {
        sendToBackend({
            type: 'hello',
            bridge: host,
            project,
            session_capabilities: SESSION_CAPABILITIES,
            runtime_catalog: runtimeCatalog,
            active_runtime: activeRuntime?.id,
            bridge_version: host.version,
        });
    }

    sendToBackend({
        type: 'capabilities',
        bridge: host,
        project,
        session_capabilities: SESSION_CAPABILITIES,
        runtime_catalog: runtimeCatalog,
        active_runtime: activeRuntime?.id,
    });

    updateStatusBar('connected');
}

async function ensurePreferredRuntimeReady() {
    const config = vscode.workspace.getConfiguration('pocketVibe');
    const autoLaunchEnabled = config.get<boolean>('autoLaunchPreferredRuntime', true);
    if (!autoLaunchEnabled) {
        return;
    }

    const preferredRuntime = config.get<string>('preferredRuntime')?.trim();
    const launchSpec = resolveRuntimeLaunchSpec(preferredRuntime);
    if (!launchSpec) {
        return;
    }

    const adapter = runtimeAdapters.find(
        (candidate): candidate is TerminalRuntimeAdapter =>
            isTerminalRuntimeAdapter(candidate) && candidate.definition.id === launchSpec.runtimeId,
    );
    if (!adapter || adapter.findTerminal()) {
        return;
    }

    if (!isCommandAvailable(launchSpec.command)) {
        const locationHint = looksLikeExecutablePath(launchSpec.command)
            ? launchSpec.command
            : `${launchSpec.command} is not available on PATH.`;
        recordRuntimeError(launchSpec.runtimeId, locationHint);
        return;
    }

    await adapter.ensureRunning(launchSpec);
}

async function setPreferredRuntime(runtimeId: RuntimeId) {
    const config = vscode.workspace.getConfiguration('pocketVibe');
    const target = vscode.workspace.workspaceFolders?.length
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    await config.update('preferredRuntime', runtimeId, target);
}

const getPreferredRuntimeId = (): RuntimeId | undefined =>
    vscode.workspace.getConfiguration('pocketVibe').get<string>('preferredRuntime')?.trim() as RuntimeId | undefined;

async function manuallyLaunchPreferredRuntime() {
    await handleRuntimeLaunch({
        type: 'command.dispatch',
        action: 'runtime.launch',
        target_runtime: getPreferredRuntimeId(),
    });
}

async function manuallyAttachPreferredRuntime() {
    await handleRuntimeAttach({
        type: 'command.dispatch',
        action: 'runtime.attach',
        target_runtime: getPreferredRuntimeId(),
    });
}

function sendToBackend(data: BackendMessage) {
    sendBackendMessage(backendConnection, data);
}
export function deactivate() {
    disconnect();
}
