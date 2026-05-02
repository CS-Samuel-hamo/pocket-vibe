import * as vscode from 'vscode';

const PROJECT_SHELL_TERMINAL_NAME = 'Pocket Vibe Shell';
const SHELL_INTEGRATION_TIMEOUT_MS = 2500;
const MAX_SCRIPT_OUTPUT_LINES = 160;

interface BackendMessage {
    type: string;
    [key: string]: any;
}

interface ShellOutputState {
    emittedLines: number;
    truncated: boolean;
}

interface ShellRunnerDependencies {
    sendToBackend(data: BackendMessage): void;
}

function getWorkspaceFolderPath(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getOrCreateProjectShellTerminal(): vscode.Terminal {
    const existing = vscode.window.terminals.find((terminal) => terminal.name === PROJECT_SHELL_TERMINAL_NAME);
    if (existing) {
        return existing;
    }

    return vscode.window.createTerminal({
        name: PROJECT_SHELL_TERMINAL_NAME,
        cwd: getWorkspaceFolderPath(),
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
            if (settled) return;
            settled = true;
            disposable.dispose();
            resolve(undefined);
        }, timeoutMs);

        const disposable = vscode.window.onDidChangeTerminalShellIntegration((event) => {
            if (event.terminal !== terminal || settled) return;
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
            if (event.terminal !== terminal || event.execution !== execution) return;
            disposable.dispose();
            resolve(event.exitCode);
        });
    });
}

function splitShellOutputBuffer(buffer: string, final: boolean): { completeLines: string[]; remainder: string } {
    const lines = buffer.split('\n');
    return {
        completeLines: final ? lines : lines.slice(0, -1),
        remainder: final ? '' : lines[lines.length - 1] || '',
    };
}

function emitShellOutputTruncated(
    state: ShellOutputState,
    sendToBackend: (data: BackendMessage) => void,
    targetRuntime?: string,
) {
    if (state.truncated) return;
    state.truncated = true;
    sendToBackend({
        type: 'execution.event',
        phase: 'output',
        message: `Script output was truncated on mobile after ${MAX_SCRIPT_OUTPUT_LINES} lines.`,
        action: 'run_script',
        target_runtime: targetRuntime,
        reason: 'workspace_shell.truncated',
    });
}

function emitShellOutputLine(
    rawLine: string,
    command: string,
    state: ShellOutputState,
    sendToBackend: (data: BackendMessage) => void,
    targetRuntime?: string,
) {
    const normalized = normalizeShellOutputLine(rawLine, command);
    if (!normalized) return;

    if (state.emittedLines >= MAX_SCRIPT_OUTPUT_LINES) {
        emitShellOutputTruncated(state, sendToBackend, targetRuntime);
        return;
    }

    state.emittedLines += 1;
    sendToBackend({
        type: 'command',
        content: normalized,
        target_runtime: targetRuntime,
        source: 'workspace_shell',
    });
}

async function streamShellExecutionOutput(
    execution: vscode.TerminalShellExecution,
    command: string,
    sendToBackend: (data: BackendMessage) => void,
    targetRuntime?: string,
): Promise<void> {
    let buffer = '';
    const state: ShellOutputState = {
        emittedLines: 0,
        truncated: false,
    };

    const flushLines = (final = false) => {
        const split = splitShellOutputBuffer(buffer, final);
        buffer = split.remainder;
        split.completeLines.forEach((rawLine) => emitShellOutputLine(rawLine, command, state, sendToBackend, targetRuntime));
    };

    for await (const chunk of execution.read()) {
        buffer += sanitizeShellChunk(chunk);
        flushLines(false);
    }

    flushLines(true);
}

export async function runCommandInProjectShell(
    command: string,
    targetRuntime: string | undefined,
    dependencies: ShellRunnerDependencies,
): Promise<void> {
    const normalizedCommand = String(command ?? '').trim();
    if (!normalizedCommand) {
        throw new Error('No script command was provided.');
    }

    const terminal = getOrCreateProjectShellTerminal();
    terminal.show();

    const shellIntegration = await waitForShellIntegration(terminal);
    if (!shellIntegration) {
        terminal.sendText(normalizedCommand, true);
        dependencies.sendToBackend({
            type: 'execution.event',
            phase: 'output',
            message: 'Script started in Pocket Vibe Shell, but live output is unavailable without shell integration.',
            action: 'run_script',
            target_runtime: targetRuntime,
            reason: 'workspace_shell.no_shell_integration',
        });
        return;
    }

    dependencies.sendToBackend({
        type: 'execution.event',
        phase: 'output',
        message: `Running ${normalizedCommand} in Pocket Vibe Shell.`,
        action: 'run_script',
        target_runtime: targetRuntime,
        reason: 'workspace_shell.started',
    });
    dependencies.sendToBackend({
        type: 'command',
        content: `$ ${normalizedCommand}`,
        target_runtime: targetRuntime,
        source: 'workspace_shell',
    });

    const execution = shellIntegration.executeCommand(normalizedCommand);
    const outputTask = streamShellExecutionOutput(
        execution,
        normalizedCommand,
        dependencies.sendToBackend,
        targetRuntime,
    );
    const exitCode = await waitForShellExecutionEnd(terminal, execution);
    await outputTask;

    if (exitCode === 0) {
        dependencies.sendToBackend({
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

    dependencies.sendToBackend({
        type: 'execution.event',
        phase: 'output',
        message: 'Script finished, but the shell did not report an exit code.',
        action: 'run_script',
        target_runtime: targetRuntime,
        reason: 'workspace_shell.unknown_exit_code',
    });
}
