import * as vscode from 'vscode';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';

import {
    capabilityIsSupported,
    createRuntimeDescriptor,
    selectActiveRuntime,
    type Capability,
    type RuntimeDefinition,
    type RuntimeDescriptor,
    type RuntimeDetection,
    type RuntimeId,
} from './runtimeRegistry';
import { buildCodexExecArgs, parseCodexExecLine } from './codexExec';
import { looksLikeExecutablePath, resolveRuntimeLaunchSpec, type RuntimeLaunchSpec } from './runtimeLaunch';

interface BackendMessage {
    type: string;
    [key: string]: any;
}

interface RuntimeAdapter {
    definition: RuntimeDefinition;
    detect(): RuntimeDetection;
    sendPrompt(prompt: string): Promise<void>;
    runScript(command: string): Promise<void>;
    approve(decision: string): Promise<void>;
    kill(): Promise<void>;
}

interface ConnectionOptions {
    backendUrl?: string | null;
    authToken?: string | null;
    promptForToken?: boolean;
    showConnectionErrors?: boolean;
    isReconnect?: boolean;
}

const SESSION_CAPABILITIES: Capability[] = ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'];
const BRIDGE_ROLE = 'vscode-bridge';
const BRIDGE_LABEL = 'VS Code Host';
const PROJECT_SHELL_TERMINAL_NAME = 'Pocket Vibe Shell';
const SHELL_INTEGRATION_TIMEOUT_MS = 2500;
const MAX_SCRIPT_OUTPUT_LINES = 160;
const HOST_INSTANCE_ID_KEY = 'pocketVibe.hostInstanceId';

let socket: WebSocket | null = null;
let statusBarItem: vscode.StatusBarItem;
let extensionContext: vscode.ExtensionContext;
const runtimeErrorState = new Map<RuntimeId, string>();
const activeRuntimeProcesses = new Map<RuntimeId, ChildProcessWithoutNullStreams>();
const intentionallyStoppedProcesses = new Set<RuntimeId>();
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempt = 0;
let manualDisconnect = false;
let lastConnectionConfig: { backendUrl: string; authToken: string } | null = null;
let cachedHostInstanceId: string | null = null;

const artilleryFlashDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(78, 201, 176, 0.3)',
    border: '1px solid rgba(78, 201, 176, 0.8)',
    isWholeLine: true,
});

class TerminalRuntimeAdapter implements RuntimeAdapter {
    constructor(
        public readonly definition: RuntimeDefinition,
        private readonly patterns: string[],
    ) {}

    detect(): RuntimeDetection {
        const terminal = this.findTerminal();
        const launchSpec = this.getLaunchSpec();
        const launchable = Boolean(launchSpec && isCommandAvailable(launchSpec.command));
        if (terminal) {
            return {
                available: true,
                attached: true,
                launchable,
                terminalName: terminal.name,
                last_error: runtimeErrorState.get(this.definition.id),
                status_detail: `${this.definition.label} is attached to terminal ${terminal.name}.`,
            };
        }

        if (launchable) {
            return {
                available: true,
                attached: false,
                launchable: true,
                last_error: runtimeErrorState.get(this.definition.id),
                status_detail:
                    runtimeErrorState.get(this.definition.id) ||
                    `${this.definition.label} is available to launch from VS Code.`,
            };
        }

        return {
            available: false,
            attached: false,
            launchable: false,
            last_error: runtimeErrorState.get(this.definition.id) || `${this.definition.label} terminal was not found.`,
        };
    }

    async sendPrompt(prompt: string): Promise<void> {
        const terminal = await this.getOrStartTerminal();
        terminal.show();
        terminal.sendText(prompt, true);
    }

    async runScript(command: string): Promise<void> {
        await runCommandInProjectShell(command, this.definition.id);
    }

    async approve(decision: string): Promise<void> {
        const terminal = await this.getOrStartTerminal();
        terminal.show();
        terminal.sendText(decision === 'approved' ? 'y' : 'n', true);
    }

    async kill(): Promise<void> {
        const terminal = this.requireTerminal();
        terminal.show();
        await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: '\u0003' });
    }

    findTerminal(): vscode.Terminal | undefined {
        return vscode.window.terminals.find((terminal) => {
            const name = terminal.name.toLowerCase();
            return this.patterns.some((pattern) => name.includes(pattern));
        });
    }

    async ensureRunning(launchSpec?: RuntimeLaunchSpec | null): Promise<vscode.Terminal> {
        const existing = this.findTerminal();
        if (existing) {
            existing.show();
            return existing;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const terminalOptions: vscode.TerminalOptions = {
            name: launchSpec?.terminalName || `Pocket Vibe · ${this.definition.id}`,
            cwd: workspaceFolder,
        };
        if (launchSpec?.command && looksLikeExecutablePath(launchSpec.command)) {
            terminalOptions.shellPath = launchSpec.command;
        }

        const terminal = vscode.window.createTerminal(terminalOptions);
        terminal.show();
        if (!launchSpec?.command || !looksLikeExecutablePath(launchSpec.command)) {
            terminal.sendText(launchSpec?.command || this.definition.id, true);
        }
        return terminal;
    }

    private requireTerminal(): vscode.Terminal {
        const terminal = this.findTerminal();
        if (!terminal) {
            throw new Error(`${this.definition.label} terminal is not running.`);
        }
        return terminal;
    }

    private getLaunchSpec(): RuntimeLaunchSpec | null {
        return resolveRuntimeLaunchSpec(this.definition.id);
    }

    private async getOrStartTerminal(): Promise<vscode.Terminal> {
        const existing = this.findTerminal();
        if (existing) {
            return existing;
        }

        const launchSpec = this.getLaunchSpec();
        if (!launchSpec || !isCommandAvailable(launchSpec.command)) {
            throw new Error(`${this.definition.label} terminal is not running.`);
        }

        const terminal = await this.ensureRunning(launchSpec);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        return terminal;
    }
}

function getWorkspaceFolderPath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function buildProjectMetadata() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const host = buildHostMetadata();
    return {
        name: workspaceFolder?.name || 'No Workspace',
        root_path: workspaceFolder?.uri.fsPath || null,
        host_id: host.id,
        host_label: host.label,
        platform: 'vscode',
        bridge_label: BRIDGE_LABEL,
    };
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

function getOrCreateProjectShellTerminal(): vscode.Terminal {
    const existing = vscode.window.terminals.find((terminal) => terminal.name === PROJECT_SHELL_TERMINAL_NAME);
    if (existing) {
        return existing;
    }

    const cwd = getWorkspaceFolderPath();
    return vscode.window.createTerminal({
        name: PROJECT_SHELL_TERMINAL_NAME,
        cwd,
    });
}

function sanitizeShellChunk(chunk: string): string {
    return chunk
        .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
        .replace(/\u0007/g, '')
        .replace(/\r/g, '');
}

function normalizeShellOutputLine(line: string, command: string): string | null {
    const sanitized = sanitizeShellChunk(line).trimEnd();
    if (!sanitized.trim()) {
        return null;
    }
    if (sanitized.trim() === command.trim()) {
        return null;
    }
    return sanitized.length > 400 ? `${sanitized.slice(0, 397)}...` : sanitized;
}

async function waitForShellIntegration(
    terminal: vscode.Terminal,
    timeoutMs = SHELL_INTEGRATION_TIMEOUT_MS,
): Promise<vscode.TerminalShellIntegration | undefined> {
    if (terminal.shellIntegration) {
        return terminal.shellIntegration;
    }

    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            disposable.dispose();
            resolve(undefined);
        }, timeoutMs);

        const disposable = vscode.window.onDidChangeTerminalShellIntegration((event) => {
            if (event.terminal !== terminal || settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            disposable.dispose();
            resolve(event.shellIntegration);
        });
    });
}

async function waitForShellExecutionEnd(
    terminal: vscode.Terminal,
    execution: vscode.TerminalShellExecution,
): Promise<number | undefined> {
    return new Promise((resolve) => {
        const disposable = vscode.window.onDidEndTerminalShellExecution((event) => {
            if (event.terminal !== terminal || event.execution !== execution) {
                return;
            }
            disposable.dispose();
            resolve(event.exitCode);
        });
    });
}

async function streamShellExecutionOutput(
    execution: vscode.TerminalShellExecution,
    command: string,
    targetRuntime?: string,
): Promise<void> {
    let buffer = '';
    let emittedLines = 0;
    let truncated = false;

    const flushLines = (final = false) => {
        const lines = buffer.split('\n');
        const completeLines = final ? lines : lines.slice(0, -1);
        buffer = final ? '' : lines[lines.length - 1] || '';

        for (const rawLine of completeLines) {
            const normalized = normalizeShellOutputLine(rawLine, command);
            if (!normalized) {
                continue;
            }

            if (emittedLines >= MAX_SCRIPT_OUTPUT_LINES) {
                if (!truncated) {
                    truncated = true;
                    sendToBackend({
                        type: 'execution.event',
                        phase: 'output',
                        message: `Script output was truncated on mobile after ${MAX_SCRIPT_OUTPUT_LINES} lines.`,
                        action: 'run_script',
                        target_runtime: targetRuntime,
                        reason: 'workspace_shell.truncated',
                    });
                }
                continue;
            }

            emittedLines += 1;
            sendToBackend({
                type: 'command',
                content: normalized,
                target_runtime: targetRuntime,
                source: 'workspace_shell',
            });
        }
    };

    for await (const chunk of execution.read()) {
        buffer += sanitizeShellChunk(chunk);
        flushLines(false);
    }

    flushLines(true);
}

async function runCommandInProjectShell(command: string, targetRuntime?: string): Promise<void> {
    const normalizedCommand = String(command ?? '').trim();
    if (!normalizedCommand) {
        throw new Error('No script command was provided.');
    }

    const terminal = getOrCreateProjectShellTerminal();
    terminal.show();

    const shellIntegration = await waitForShellIntegration(terminal);
    if (!shellIntegration) {
        terminal.sendText(normalizedCommand, true);
        sendToBackend({
            type: 'execution.event',
            phase: 'output',
            message: 'Script started in Pocket Vibe Shell, but live output is unavailable without shell integration.',
            action: 'run_script',
            target_runtime: targetRuntime,
            reason: 'workspace_shell.no_shell_integration',
        });
        return;
    }

    sendToBackend({
        type: 'execution.event',
        phase: 'output',
        message: `Running ${normalizedCommand} in Pocket Vibe Shell.`,
        action: 'run_script',
        target_runtime: targetRuntime,
        reason: 'workspace_shell.started',
    });
    sendToBackend({
        type: 'command',
        content: `$ ${normalizedCommand}`,
        target_runtime: targetRuntime,
        source: 'workspace_shell',
    });

    const execution = shellIntegration.executeCommand(normalizedCommand);
    const outputTask = streamShellExecutionOutput(execution, normalizedCommand, targetRuntime);
    const exitCode = await waitForShellExecutionEnd(terminal, execution);
    await outputTask;

    if (exitCode === 0) {
        sendToBackend({
            type: 'execution.event',
            phase: 'output',
            message: 'Script completed successfully.',
            action: 'run_script',
            target_runtime: targetRuntime,
            reason: 'workspace_shell.completed',
        });
        return;
    }

    if (typeof exitCode === 'number') {
        throw new Error(`Script exited with code ${exitCode}.`);
    }

    sendToBackend({
        type: 'execution.event',
        phase: 'output',
        message: 'Script finished, but the shell did not report an exit code.',
        action: 'run_script',
        target_runtime: targetRuntime,
        reason: 'workspace_shell.unknown_exit_code',
    });
}

class ExtensionFallbackAdapter implements RuntimeAdapter {
    constructor(
        public readonly definition: RuntimeDefinition,
        private readonly extensionPatterns: string[],
    ) {}

    detect(): RuntimeDetection {
        const extension = this.findExtension();
        if (!extension) {
            return {
                available: false,
                attached: false,
                launchable: false,
                last_error: runtimeErrorState.get(this.definition.id) || `${this.definition.label} extension was not detected.`,
            };
        }
        return {
            available: true,
            attached: true,
            launchable: false,
            extensionId: extension.id,
            last_error: runtimeErrorState.get(this.definition.id),
            status_detail:
                runtimeErrorState.get(this.definition.id) ||
                `${this.definition.label} is attached via clipboard fallback.`,
        };
    }

    async sendPrompt(prompt: string): Promise<void> {
        await vscode.env.clipboard.writeText(prompt);
        void vscode.window.showInformationMessage(`${this.definition.label}: prompt copied to clipboard.`);
    }

    async runScript(_command: string): Promise<void> {
        throw new Error(`${this.definition.label} cannot run scripts directly. Clipboard fallback only supports prompt dispatch.`);
    }

    async approve(_decision: string): Promise<void> {
        throw new Error(`${this.definition.label} does not support approval responses.`);
    }

    async kill(): Promise<void> {
        throw new Error(`${this.definition.label} does not support interrupt requests.`);
    }

    private findExtension(): vscode.Extension<any> | undefined {
        return vscode.extensions.all.find((candidate) =>
            this.extensionPatterns.some((pattern) => candidate.id.includes(pattern)),
        );
    }
}

const runtimeAdapters: RuntimeAdapter[] = [
    new TerminalRuntimeAdapter(
        {
            id: 'codex-cli',
            label: 'Codex CLI',
            source: 'terminal',
            supports: [...SESSION_CAPABILITIES],
            dispatch_mode: 'raw_prompt',
            approval_mode: 'terminal_yes_no',
            interrupt_mode: 'ctrl_c',
        },
        ['codex'],
    ),
    new TerminalRuntimeAdapter(
        {
            id: 'claude-code',
            label: 'Claude Code',
            source: 'terminal',
            supports: [...SESSION_CAPABILITIES],
            dispatch_mode: 'raw_prompt',
            approval_mode: 'terminal_yes_no',
            interrupt_mode: 'ctrl_c',
        },
        ['claude-code', 'claude'],
    ),
    new TerminalRuntimeAdapter(
        {
            id: 'opencode',
            label: 'OpenCode',
            source: 'terminal',
            supports: [...SESSION_CAPABILITIES],
            dispatch_mode: 'raw_prompt',
            approval_mode: 'terminal_yes_no',
            interrupt_mode: 'ctrl_c',
        },
        ['opencode'],
    ),
    new TerminalRuntimeAdapter(
        {
            id: 'antigravity',
            label: 'Antigravity',
            source: 'terminal',
            supports: [...SESSION_CAPABILITIES],
            dispatch_mode: 'raw_prompt',
            approval_mode: 'terminal_yes_no',
            interrupt_mode: 'ctrl_c',
        },
        ['antigravity'],
    ),
    new ExtensionFallbackAdapter(
        {
            id: 'continue-ext',
            label: 'Continue',
            source: 'extension',
            supports: ['prompt', 'focus', 'read_context'],
            dispatch_mode: 'clipboard_fallback',
            approval_mode: 'unsupported',
            interrupt_mode: 'unsupported',
        },
        ['continue'],
    ),
    new ExtensionFallbackAdapter(
        {
            id: 'cline-ext',
            label: 'Cline',
            source: 'extension',
            supports: ['prompt', 'focus', 'read_context'],
            dispatch_mode: 'clipboard_fallback',
            approval_mode: 'unsupported',
            interrupt_mode: 'unsupported',
        },
        ['cline'],
    ),
    new ExtensionFallbackAdapter(
        {
            id: 'roo-ext',
            label: 'Roo Code',
            source: 'extension',
            supports: ['prompt', 'focus', 'read_context'],
            dispatch_mode: 'clipboard_fallback',
            approval_mode: 'unsupported',
            interrupt_mode: 'unsupported',
        },
        ['roo-code'],
    ),
    new ExtensionFallbackAdapter(
        {
            id: 'copilot-ext',
            label: 'Copilot',
            source: 'extension',
            supports: ['prompt', 'focus', 'read_context'],
            dispatch_mode: 'clipboard_fallback',
            approval_mode: 'unsupported',
            interrupt_mode: 'unsupported',
        },
        ['copilot'],
    ),
];

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

async function connectToBackend(options: ConnectionOptions = {}) {
    const backendUrl = options.backendUrl?.trim() || (await resolveBackendUrl());
    const authToken =
        options.authToken?.trim() ||
        (await resolveAuthToken(options.promptForToken ?? true));
    if (!backendUrl || !authToken) {
        updateStatusBar('configure');
        return;
    }

    lastConnectionConfig = { backendUrl, authToken };
    persistConnectionSettings(backendUrl, authToken);
    manualDisconnect = false;
    reconnectAttempt = options.isReconnect ? reconnectAttempt : 0;
    clearReconnectTimer();
    closeSocket(false);

    const url = `${backendUrl}?role=${BRIDGE_ROLE}&token=${encodeURIComponent(authToken)}`;
    updateStatusBar('connecting');

    const ws = new WebSocket(url);
    socket = ws;

    ws.on('open', () => {
        if (socket !== ws) {
            return;
        }
        reconnectAttempt = 0;
        clearReconnectTimer();
        updateStatusBar('connected');
        void ensurePreferredRuntimeReady().then(() => reportCapabilities(true));
    });

    ws.on('message', (data: any) => {
        try {
            const message = JSON.parse(String(data)) as BackendMessage;
            void handleMessage(message);
        } catch (error) {
            console.error('Pocket Vibe: failed to parse message', error);
        }
    });

    ws.on('close', () => {
        if (socket === ws) {
            socket = null;
        }
        updateStatusBar('disconnected');
        if (!manualDisconnect) {
            scheduleReconnect();
        }
    });

    ws.on('error', (error: Error) => {
        console.error('Pocket Vibe bridge error:', error);
        if (socket === ws) {
            updateStatusBar('error');
        }
        if (options.showConnectionErrors ?? !options.isReconnect) {
            void vscode.window.showWarningMessage(`Pocket Vibe bridge error: ${error.message}`);
        }
    });
}

function disconnect() {
    manualDisconnect = true;
    reconnectAttempt = 0;
    clearReconnectTimer();
    closeSocket(true);
}

function closeSocket(updateStatus = false) {
    if (socket) {
        const current = socket;
        socket = null;
        current.removeAllListeners();
        current.close();
    }
    if (!updateStatus) {
        return;
    }
    void resolveAuthToken(false).then((token) => {
        updateStatusBar(token ? 'disconnected' : 'configure');
    });
}

function clearReconnectTimer() {
    if (!reconnectTimer) {
        return;
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
}

function scheduleReconnect() {
    if (manualDisconnect || reconnectTimer || !lastConnectionConfig) {
        return;
    }

    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    updateStatusBar('connecting');
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectToBackend({
            backendUrl: lastConnectionConfig?.backendUrl ?? null,
            authToken: lastConnectionConfig?.authToken ?? null,
            promptForToken: false,
            showConnectionErrors: false,
            isReconnect: true,
        });
    }, delay);
}

function updateStatusBar(state: 'configure' | 'connecting' | 'connected' | 'disconnected' | 'error') {
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
            await handleWorkspaceFocus(message);
            return;
        case 'context.request':
            await handleContextRequest(message);
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
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: 'No runtime is available to receive the prompt.',
            target_runtime: message.target_runtime,
            reason: runtimeContext?.descriptor.last_error || 'No ready runtime supports prompt dispatch.',
        });
        return;
    }

    try {
        if (runtimeContext.descriptor.id === 'codex-cli') {
            await startCodexExecPrompt(prompt, runtimeContext.descriptor);
        } else {
            await runtimeContext.adapter.sendPrompt(prompt);
        }
        clearRuntimeError(runtimeContext.descriptor.id);
        sendToBackend({
            type: 'execution.event',
            phase: 'dispatched',
            message: `Prompt sent to ${runtimeContext.descriptor.label}.`,
            target_runtime: runtimeContext.descriptor.id,
            reason: runtimeContext.descriptor.dispatch_mode,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeContext.descriptor.id, reason);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Prompt dispatch failed for ${runtimeContext.descriptor.label}.`,
            target_runtime: runtimeContext.descriptor.id,
            reason,
        });
    }

    await reportCapabilities();
}

async function handleCommandDispatch(message: BackendMessage) {
    const action = String(message.action ?? '').trim() || 'run_script';
    if (action === 'focus') {
        await handleWorkspaceFocus(message);
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
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: 'No runtime is available to receive the command.',
            action,
            target_runtime: targetRuntime,
            reason: 'No ready or degraded runtime is available.',
        });
        return;
    }

    const needsRunScript = action === 'run_script';
    const requiredCapability: Capability = needsRunScript ? 'run_script' : 'prompt';
    if (!capabilityIsSupported(runtimeContext.descriptor, requiredCapability)) {
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Command ${action} is not supported by ${runtimeContext.descriptor.label}.`,
            action,
            target_runtime: runtimeContext.descriptor.id,
            reason: runtimeContext.descriptor.last_error || `${requiredCapability} is unsupported.`,
        });
        return;
    }

    try {
        if (needsRunScript) {
            await runtimeContext.adapter.runScript(String(message.command ?? ''));
        } else if (action === 'rewrite' || action === 'explain') {
            const lineTarget = formatLineTarget(message.file, message.lines, message.line);
            const instruction = String(message.instruction ?? action);
            await runtimeContext.adapter.sendPrompt(`${action.toUpperCase()}: ${instruction}\nTARGET: ${lineTarget}`);
            if (message.file) {
                await handleWorkspaceFocus(message);
            }
        } else {
            await runtimeContext.adapter.sendPrompt(JSON.stringify(message));
        }

        clearRuntimeError(runtimeContext.descriptor.id);
        sendToBackend({
            type: 'execution.event',
            phase: 'dispatched',
            message: needsRunScript
                ? `Script sent to the desktop shell for ${runtimeContext.descriptor.label}.`
                : `Command ${action} sent to ${runtimeContext.descriptor.label}.`,
            action,
            target_runtime: runtimeContext.descriptor.id,
            reason: needsRunScript ? 'workspace_shell' : runtimeContext.descriptor.dispatch_mode,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordRuntimeError(runtimeContext.descriptor.id, reason);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Command ${action} failed for ${runtimeContext.descriptor.label}.`,
            action,
            target_runtime: runtimeContext.descriptor.id,
            reason,
        });
    }

    await reportCapabilities();
}

async function handleWorkspaceFocus(message: BackendMessage) {
    const file = String(message.file ?? '');
    if (!file) {
        return;
    }

    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace is open in VS Code.');
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const line = typeof message.line === 'number' ? message.line : undefined;
        const editor = await vscode.window.showTextDocument(doc, {
            selection: line ? new vscode.Range(line - 1, 0, line - 1, 0) : undefined,
            preview: false,
        });

        if (line) {
            const range = new vscode.Range(line - 1, 0, line - 1, 0);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            if (message.flash) {
                editor.setDecorations(artilleryFlashDecoration, [range]);
                setTimeout(() => editor.setDecorations(artilleryFlashDecoration, []), 800);
            }
        }

        sendToBackend({
            type: 'execution.event',
            phase: 'focused',
            message: `Focused ${file}${line ? `:${line}` : ''}.`,
            file,
            line,
            reason: 'workspace.focus',
            target_runtime: getActiveRuntimeDescriptor()?.id,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Focus failed for ${file}.`,
            file,
            reason,
            target_runtime: getActiveRuntimeDescriptor()?.id,
        });
    }
}

async function handleContextRequest(message: BackendMessage) {
    const file = String(message.file ?? '');
    if (!file) {
        return;
    }

    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace is open in VS Code.');
        }

        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const start = Math.max(1, Number(message.line_start ?? 1));
        const end = Math.max(start, Number(message.line_end ?? start));
        const lines: string[] = [];

        for (let lineIndex = start - 1; lineIndex < end; lineIndex += 1) {
            if (lineIndex < 0 || lineIndex >= doc.lineCount) {
                continue;
            }
            lines.push(doc.lineAt(lineIndex).text);
        }

        sendToBackend({
            type: 'context.result',
            file,
            lines,
            position: message.position,
            line_start: start,
            line_end: end,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Context request failed for ${file}.`,
            file,
            reason,
            target_runtime: getActiveRuntimeDescriptor()?.id,
        });
    }
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

    if (!(adapter instanceof TerminalRuntimeAdapter)) {
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
        if (adapter instanceof TerminalRuntimeAdapter) {
            const terminal = adapter.findTerminal();
            if (!terminal) {
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
                    return;
                }
                sendToBackend({
                    type: 'execution.event',
                    phase: 'runtime',
                    message: `${descriptor.label} is selected, but not attached yet. Launch it first.`,
                    target_runtime: runtimeId,
                    reason: 'runtime.attach.pending_launch',
                });
                await reportCapabilities();
                return;
            }
            terminal.show();
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

async function startCodexExecPrompt(prompt: string, runtime: RuntimeDescriptor): Promise<void> {
    const launchSpec = resolveRuntimeLaunchSpec(runtime.id);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!launchSpec || !isCommandAvailable(launchSpec.command) || !workspaceFolder) {
        throw new Error(`${runtime.label} exec bridge is unavailable.`);
    }

    terminateActiveRuntimeProcess(runtime.id);

    const outputPath = path.join(os.tmpdir(), `pocket-vibe-${runtime.id}-${Date.now()}.txt`);
    sendToBackend({
        type: 'execution.event',
        phase: 'thinking',
        message: 'Codex CLI exec session started.',
        target_runtime: runtime.id,
        reason: 'codex.exec.started',
    });

    const child = spawn(launchSpec.command, buildCodexExecArgs(workspaceFolder, outputPath), {
        cwd: workspaceFolder,
        env: process.env,
        shell: false,
    });
    activeRuntimeProcesses.set(runtime.id, child);

    let stdoutBuffer = '';
    let sawAssistantMessage = false;
    let stderrTail = '';

    const flushStdout = () => {
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) {
            const packets = parseCodexExecLine(line, runtime.id);
            for (const packet of packets) {
                if (packet.type === 'assistant') {
                    sawAssistantMessage = true;
                }
                sendToBackend(packet as BackendMessage);
            }
        }
    };

    child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        flushStdout();
    });

    child.stderr.on('data', (chunk: Buffer) => {
        stderrTail = chunk.toString('utf8').trim() || stderrTail;
    });

    child.on('error', (error: Error) => {
        activeRuntimeProcesses.delete(runtime.id);
        recordRuntimeError(runtime.id, error.message);
        sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: `Codex CLI failed to start.`,
            target_runtime: runtime.id,
            reason: error.message,
        });
        void reportCapabilities();
    });

    child.on('close', (code) => {
        flushStdout();
        activeRuntimeProcesses.delete(runtime.id);
        if (intentionallyStoppedProcesses.has(runtime.id)) {
            intentionallyStoppedProcesses.delete(runtime.id);
            void reportCapabilities();
            return;
        }

        if (!sawAssistantMessage && fs.existsSync(outputPath)) {
            const fallbackReply = fs
                .readFileSync(outputPath, 'utf8')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find((line) => line && !line.startsWith('202') && !line.startsWith('<html>'));
            if (fallbackReply) {
                sawAssistantMessage = true;
                sendToBackend({
                    type: 'execution.event',
                    phase: 'output',
                    message: 'Codex CLI reply recovered from output file.',
                    target_runtime: runtime.id,
                    reason: 'codex.exec.fallback',
                });
                sendToBackend({
                    type: 'assistant',
                    content: fallbackReply,
                    message: fallbackReply,
                    target_runtime: runtime.id,
                });
            }
        }
        if (fs.existsSync(outputPath)) {
            fs.rmSync(outputPath, { force: true });
        }

        if (code !== 0 && code !== null) {
            const reason = stderrTail || `codex exec exited with code ${code}`;
            recordRuntimeError(runtime.id, reason);
            sendToBackend({
                type: 'execution.event',
                phase: 'error',
                message: 'Codex CLI execution failed.',
                target_runtime: runtime.id,
                reason,
            });
        } else if (!sawAssistantMessage) {
            sendToBackend({
                type: 'execution.event',
                phase: 'output',
                message: 'Codex CLI completed without a visible assistant reply.',
                target_runtime: runtime.id,
                reason: 'codex.exec',
            });
        }
        void reportCapabilities();
    });

    child.stdin.write(prompt);
    child.stdin.end();
}

function terminateActiveRuntimeProcess(runtimeId: RuntimeId): boolean {
    const child = activeRuntimeProcesses.get(runtimeId);
    if (!child) {
        return false;
    }

    activeRuntimeProcesses.delete(runtimeId);
    intentionallyStoppedProcesses.add(runtimeId);
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: true });
    } else {
        child.kill('SIGTERM');
    }
    return true;
}

async function reportCapabilities(includeHello = false) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
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

    updateStatusBar(socket.readyState === WebSocket.OPEN ? 'connected' : 'disconnected');
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
            candidate instanceof TerminalRuntimeAdapter && candidate.definition.id === launchSpec.runtimeId,
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

async function manuallyLaunchPreferredRuntime() {
    const runtimeId = vscode.workspace
        .getConfiguration('pocketVibe')
        .get<string>('preferredRuntime')
        ?.trim() as RuntimeId | undefined;
    await handleRuntimeLaunch({
        type: 'command.dispatch',
        action: 'runtime.launch',
        target_runtime: runtimeId,
    });
}

async function manuallyAttachPreferredRuntime() {
    const runtimeId = vscode.workspace
        .getConfiguration('pocketVibe')
        .get<string>('preferredRuntime')
        ?.trim() as RuntimeId | undefined;
    await handleRuntimeAttach({
        type: 'command.dispatch',
        action: 'runtime.attach',
        target_runtime: runtimeId,
    });
}

function sendToBackend(data: BackendMessage) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

async function resolveBackendUrl(promptIfMissing = true): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('pocketVibe');
    let backendUrl =
        config.get<string>('backendWsUrl') ||
        process.env.POCKET_VIBE_BACKEND_WS_URL ||
        'ws://127.0.0.1:8000/ws';
    backendUrl = backendUrl.trim();

    if (backendUrl) {
        return backendUrl;
    }
    if (!promptIfMissing) {
        return null;
    }

    const input = await vscode.window.showInputBox({
        prompt: 'Pocket Vibe backend WebSocket URL',
        value: 'ws://127.0.0.1:8000/ws',
        placeHolder: 'ws://127.0.0.1:8000/ws',
    });
    return input?.trim() || null;
}

async function resolveAuthToken(promptIfMissing = false): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('pocketVibe');
    const existingToken = (config.get<string>('authToken') || process.env.POCKET_VIBE_TOKEN || '').trim();
    if (existingToken) {
        return existingToken;
    }
    if (!promptIfMissing) {
        return null;
    }
    const input = await vscode.window.showInputBox({
        prompt: 'Pocket Vibe auth token from the backend console',
        password: true,
        ignoreFocusOut: true,
    });
    return input?.trim() || null;
}

function persistConnectionSettings(backendUrl: string, authToken: string) {
    const config = vscode.workspace.getConfiguration('pocketVibe');
    void config.update('backendWsUrl', backendUrl, vscode.ConfigurationTarget.Global);
    void config.update('authToken', authToken, vscode.ConfigurationTarget.Global);
}

function formatLineTarget(file?: string, lines?: number[], line?: number): string {
    const selectedLines =
        Array.isArray(lines) && lines.length > 0 ? lines.join(',') : line ? String(line) : 'unknown';
    return `${file ?? 'unknown'}:${selectedLines}`;
}

function isCommandAvailable(command: string): boolean {
    if (!command.trim()) {
        return false;
    }

    if (looksLikeExecutablePath(command)) {
        return true;
    }

    const lookup = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(lookup, [command], { shell: true, encoding: 'utf8' });
    if (result.status !== 0) {
        return false;
    }

    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const matches = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (process.platform !== 'win32') {
        return matches.length > 0;
    }

    return matches.some((candidate) => !candidate.toLowerCase().includes('\\windowsapps\\'));
}

export function deactivate() {
    disconnect();
}
