import * as vscode from 'vscode';

import {
    type Capability,
    type RuntimeDefinition,
    type RuntimeDetection,
    type RuntimeId,
} from './runtimeRegistry';
import {
    looksLikeExecutablePath,
    resolveRuntimeLaunchSpec,
    type RuntimeLaunchSpec,
} from './runtimeLaunch';

export interface RuntimeAdapter {
    kind: 'terminal' | 'extension';
    definition: RuntimeDefinition;
    detect(): RuntimeDetection;
    sendPrompt(prompt: string): Promise<void>;
    runScript(command: string, workspaceRoot?: string): Promise<void>;
    approve(decision: string): Promise<void>;
    kill(): Promise<void>;
}

export interface TerminalRuntimeAdapter extends RuntimeAdapter {
    kind: 'terminal';
    findTerminal(): vscode.Terminal | undefined;
    ensureRunning(launchSpec?: RuntimeLaunchSpec | null): Promise<vscode.Terminal>;
}

export interface RuntimeAdapterDependencies {
    runCommandInProjectShell(command: string, targetRuntime?: string, workspaceRoot?: string): Promise<void>;
    isCommandAvailable(command: string): boolean;
    getRuntimeError(runtimeId: RuntimeId): string | undefined;
}

const SESSION_CAPABILITIES: Capability[] = ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'];

export function isTerminalRuntimeAdapter(adapter: RuntimeAdapter): adapter is TerminalRuntimeAdapter {
    return adapter.kind === 'terminal';
}

function findTerminalByPatterns(patterns: string[]): vscode.Terminal | undefined {
    return vscode.window.terminals.find((terminal) => {
        const name = terminal.name.toLowerCase();
        return patterns.some((pattern) => name.includes(pattern));
    });
}

function terminalAttachedDetection(
    definition: RuntimeDefinition,
    terminal: vscode.Terminal,
    launchable: boolean,
    lastError?: string,
): RuntimeDetection {
    return {
        available: true,
        attached: true,
        launchable,
        terminalName: terminal.name,
        last_error: lastError,
        status_detail: `${definition.label} is attached to terminal ${terminal.name}.`,
    };
}

function terminalLaunchableDetection(definition: RuntimeDefinition, lastError?: string): RuntimeDetection {
    return {
        available: true,
        attached: false,
        launchable: true,
        last_error: lastError,
        status_detail: lastError || `${definition.label} is available to launch from VS Code.`,
    };
}

function terminalOfflineDetection(definition: RuntimeDefinition, lastError?: string): RuntimeDetection {
    return {
        available: false,
        attached: false,
        launchable: false,
        last_error: lastError || `${definition.label} terminal was not found.`,
    };
}

function detectTerminalRuntime(
    definition: RuntimeDefinition,
    patterns: string[],
    dependencies: RuntimeAdapterDependencies,
): RuntimeDetection {
    const terminal = findTerminalByPatterns(patterns);
    const launchSpec = resolveRuntimeLaunchSpec(definition.id);
    const launchable = Boolean(launchSpec && dependencies.isCommandAvailable(launchSpec.command));
    const lastError = dependencies.getRuntimeError(definition.id);
    if (terminal) {
        return terminalAttachedDetection(definition, terminal, launchable, lastError);
    }
    if (launchable) {
        return terminalLaunchableDetection(definition, lastError);
    }
    return terminalOfflineDetection(definition, lastError);
}

function createTerminalOptions(
    definition: RuntimeDefinition,
    launchSpec?: RuntimeLaunchSpec | null,
): vscode.TerminalOptions {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const terminalOptions: vscode.TerminalOptions = {
        name: launchSpec?.terminalName || `Pocket Vibe - ${definition.id}`,
        cwd: workspaceFolder,
    };
    if (launchSpec?.command && looksLikeExecutablePath(launchSpec.command)) {
        terminalOptions.shellPath = launchSpec.command;
    }
    return terminalOptions;
}

async function ensureTerminalRunning(
    definition: RuntimeDefinition,
    patterns: string[],
    launchSpec?: RuntimeLaunchSpec | null,
): Promise<vscode.Terminal> {
    const existing = findTerminalByPatterns(patterns);
    if (existing) {
        existing.show();
        return existing;
    }
    const terminal = vscode.window.createTerminal(createTerminalOptions(definition, launchSpec));
    terminal.show();
    if (!launchSpec?.command || !looksLikeExecutablePath(launchSpec.command)) {
        terminal.sendText(launchSpec?.command || definition.id, true);
    }
    return terminal;
}

function requireTerminal(definition: RuntimeDefinition, patterns: string[]): vscode.Terminal {
    const terminal = findTerminalByPatterns(patterns);
    if (!terminal) {
        throw new Error(`${definition.label} terminal is not running.`);
    }
    return terminal;
}

async function getOrStartTerminal(
    definition: RuntimeDefinition,
    patterns: string[],
    dependencies: RuntimeAdapterDependencies,
): Promise<vscode.Terminal> {
    const existing = findTerminalByPatterns(patterns);
    if (existing) {
        return existing;
    }
    const launchSpec = resolveRuntimeLaunchSpec(definition.id);
    if (!launchSpec || !dependencies.isCommandAvailable(launchSpec.command)) {
        throw new Error(`${definition.label} terminal is not running.`);
    }
    const terminal = await ensureTerminalRunning(definition, patterns, launchSpec);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return terminal;
}

function createTerminalRuntimeAdapter(
    definition: RuntimeDefinition,
    patterns: string[],
    dependencies: RuntimeAdapterDependencies,
): TerminalRuntimeAdapter {
    return {
        kind: 'terminal',
        definition,
        detect: () => detectTerminalRuntime(definition, patterns, dependencies),
        sendPrompt: async (prompt) => {
            const terminal = await getOrStartTerminal(definition, patterns, dependencies);
            terminal.show();
            terminal.sendText(prompt, true);
        },
        runScript: (command, workspaceRoot) => dependencies.runCommandInProjectShell(command, definition.id, workspaceRoot),
        approve: async (decision) => {
            const terminal = await getOrStartTerminal(definition, patterns, dependencies);
            terminal.show();
            terminal.sendText(decision === 'approved' ? 'y' : 'n', true);
        },
        kill: async () => {
            requireTerminal(definition, patterns).show();
            await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: '\u0003' });
        },
        findTerminal: () => findTerminalByPatterns(patterns),
        ensureRunning: (launchSpec) => ensureTerminalRunning(definition, patterns, launchSpec),
    };
}

function detectExtensionFallback(
    definition: RuntimeDefinition,
    extensionPatterns: string[],
    getRuntimeError: (runtimeId: RuntimeId) => string | undefined,
): RuntimeDetection {
    const extension = vscode.extensions.all.find((candidate) =>
        extensionPatterns.some((pattern) => candidate.id.includes(pattern)),
    );
    const lastError = getRuntimeError(definition.id);
    if (!extension) {
        return {
            available: false,
            attached: false,
            launchable: false,
            last_error: lastError || `${definition.label} extension was not detected.`,
        };
    }
    return {
        available: true,
        attached: true,
        launchable: false,
        extensionId: extension.id,
        last_error: lastError,
        status_detail: lastError || `${definition.label} is attached via clipboard fallback.`,
    };
}

function createExtensionFallbackAdapter(
    definition: RuntimeDefinition,
    extensionPatterns: string[],
    dependencies: RuntimeAdapterDependencies,
): RuntimeAdapter {
    return {
        kind: 'extension',
        definition,
        detect: () => detectExtensionFallback(definition, extensionPatterns, dependencies.getRuntimeError),
        sendPrompt: async (prompt) => {
            await vscode.env.clipboard.writeText(prompt);
            void vscode.window.showInformationMessage(`${definition.label}: prompt copied to clipboard.`);
        },
        runScript: async () => {
            throw new Error(`${definition.label} cannot run scripts directly. Clipboard fallback only supports prompt dispatch.`);
        },
        approve: async () => {
            throw new Error(`${definition.label} does not support approval responses.`);
        },
        kill: async () => {
            throw new Error(`${definition.label} does not support interrupt requests.`);
        },
    };
}

function terminalDefinition(id: RuntimeId, label: string): RuntimeDefinition {
    return {
        id,
        label,
        source: 'terminal',
        supports: [...SESSION_CAPABILITIES],
        dispatch_mode: 'raw_prompt',
        approval_mode: 'terminal_yes_no',
        interrupt_mode: 'ctrl_c',
    };
}

function extensionDefinition(id: RuntimeId, label: string): RuntimeDefinition {
    return {
        id,
        label,
        source: 'extension',
        supports: ['prompt', 'focus', 'read_context'],
        dispatch_mode: 'clipboard_fallback',
        approval_mode: 'unsupported',
        interrupt_mode: 'unsupported',
    };
}

export function createRuntimeAdapters(dependencies: RuntimeAdapterDependencies): RuntimeAdapter[] {
    return [
        createTerminalRuntimeAdapter(terminalDefinition('codex-cli', 'Codex CLI'), ['codex'], dependencies),
        createTerminalRuntimeAdapter(terminalDefinition('claude-code', 'Claude Code'), ['claude-code', 'claude'], dependencies),
        createTerminalRuntimeAdapter(terminalDefinition('opencode', 'OpenCode'), ['opencode'], dependencies),
        createTerminalRuntimeAdapter(terminalDefinition('antigravity', 'Antigravity'), ['antigravity'], dependencies),
        createExtensionFallbackAdapter(extensionDefinition('continue-ext', 'Continue'), ['continue'], dependencies),
        createExtensionFallbackAdapter(extensionDefinition('cline-ext', 'Cline'), ['cline'], dependencies),
        createExtensionFallbackAdapter(extensionDefinition('roo-ext', 'Roo Code'), ['roo-code'], dependencies),
        createExtensionFallbackAdapter(extensionDefinition('copilot-ext', 'Copilot'), ['copilot'], dependencies),
    ];
}
