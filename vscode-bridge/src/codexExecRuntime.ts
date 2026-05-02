import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';

import { buildCodexExecArgs, parseCodexExecLine } from './codexExec';
import { resolveRuntimeLaunchSpec } from './runtimeLaunch';
import { type RuntimeDescriptor, type RuntimeId } from './runtimeRegistry';

interface BackendMessage {
    type: string;
    [key: string]: any;
}

interface CodexExecDependencies {
    sendToBackend(data: BackendMessage): void;
    reportCapabilities(): Promise<void>;
    recordRuntimeError(runtimeId: RuntimeId, reason: string): void;
    isCommandAvailable(command: string): boolean;
}

interface CodexExecState {
    stdoutBuffer: string;
    sawAssistantMessage: boolean;
    stderrTail: string;
    outputPath: string;
}

const activeRuntimeProcesses = new Map<RuntimeId, ChildProcessWithoutNullStreams>();
const intentionallyStoppedProcesses = new Set<RuntimeId>();

function getWorkspaceFolderPath(workspaceRoot?: string): string | undefined {
    return workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function newCodexExecState(runtimeId: RuntimeId): CodexExecState {
    return {
        stdoutBuffer: '',
        sawAssistantMessage: false,
        stderrTail: '',
        outputPath: path.join(os.tmpdir(), `pocket-vibe-${runtimeId}-${Date.now()}.txt`),
    };
}

function sendCodexExecStarted(runtime: RuntimeDescriptor, dependencies: CodexExecDependencies) {
    dependencies.sendToBackend({
        type: 'execution.event',
        phase: 'thinking',
        message: 'Codex CLI exec session started.',
        target_runtime: runtime.id,
        reason: 'codex.exec.started',
    });
}

function flushCodexStdout(
    state: CodexExecState,
    runtimeId: RuntimeId,
    sendToBackend: (data: BackendMessage) => void,
) {
    const lines = state.stdoutBuffer.split(/\r?\n/);
    state.stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
        const packets = parseCodexExecLine(line, runtimeId);
        state.sawAssistantMessage = state.sawAssistantMessage || packets.some((packet) => packet.type === 'assistant');
        packets.forEach((packet) => sendToBackend(packet as BackendMessage));
    }
}

function readFallbackReply(outputPath: string): string | undefined {
    if (!fs.existsSync(outputPath)) {
        return undefined;
    }
    return fs
        .readFileSync(outputPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('202') && !line.startsWith('<html>'));
}

function removeOutputFile(outputPath: string) {
    if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath, { force: true });
    }
}

function emitFallbackReplyIfNeeded(
    state: CodexExecState,
    runtime: RuntimeDescriptor,
    dependencies: CodexExecDependencies,
) {
    if (state.sawAssistantMessage) return;

    const fallbackReply = readFallbackReply(state.outputPath);
    if (!fallbackReply) return;

    state.sawAssistantMessage = true;
    dependencies.sendToBackend({
        type: 'execution.event',
        phase: 'output',
        message: 'Codex CLI reply recovered from output file.',
        target_runtime: runtime.id,
        reason: 'codex.exec.fallback',
    });
    dependencies.sendToBackend({
        type: 'assistant',
        content: fallbackReply,
        message: fallbackReply,
        target_runtime: runtime.id,
    });
}

function handleCodexExecError(
    error: Error,
    runtime: RuntimeDescriptor,
    dependencies: CodexExecDependencies,
) {
    activeRuntimeProcesses.delete(runtime.id);
    dependencies.recordRuntimeError(runtime.id, error.message);
    dependencies.sendToBackend({
        type: 'execution.event',
        phase: 'error',
        message: 'Codex CLI failed to start.',
        target_runtime: runtime.id,
        reason: error.message,
    });
    void dependencies.reportCapabilities();
}

function handleCodexExecClose(
    code: number | null,
    state: CodexExecState,
    runtime: RuntimeDescriptor,
    dependencies: CodexExecDependencies,
) {
    flushCodexStdout(state, runtime.id, dependencies.sendToBackend);
    activeRuntimeProcesses.delete(runtime.id);
    if (intentionallyStoppedProcesses.has(runtime.id)) {
        intentionallyStoppedProcesses.delete(runtime.id);
        void dependencies.reportCapabilities();
        return;
    }

    emitFallbackReplyIfNeeded(state, runtime, dependencies);
    removeOutputFile(state.outputPath);

    if (code !== 0 && code !== null) {
        const reason = state.stderrTail || `codex exec exited with code ${code}`;
        dependencies.recordRuntimeError(runtime.id, reason);
        dependencies.sendToBackend({
            type: 'execution.event',
            phase: 'error',
            message: 'Codex CLI execution failed.',
            target_runtime: runtime.id,
            reason,
        });
    } else if (!state.sawAssistantMessage) {
        dependencies.sendToBackend({
            type: 'execution.event',
            phase: 'output',
            message: 'Codex CLI completed without a visible assistant reply.',
            target_runtime: runtime.id,
            reason: 'codex.exec',
        });
    }
    void dependencies.reportCapabilities();
}

function wireCodexExecChild(
    child: ChildProcessWithoutNullStreams,
    state: CodexExecState,
    runtime: RuntimeDescriptor,
    dependencies: CodexExecDependencies,
) {
    child.stdout.on('data', (chunk: Buffer) => {
        state.stdoutBuffer += chunk.toString('utf8');
        flushCodexStdout(state, runtime.id, dependencies.sendToBackend);
    });
    child.stderr.on('data', (chunk: Buffer) => {
        state.stderrTail = chunk.toString('utf8').trim() || state.stderrTail;
    });
    child.on('error', (error: Error) => handleCodexExecError(error, runtime, dependencies));
    child.on('close', (code) => handleCodexExecClose(code, state, runtime, dependencies));
}

export async function startCodexExecPrompt(
    prompt: string,
    runtime: RuntimeDescriptor,
    dependencies: CodexExecDependencies,
    workspaceRoot?: string,
): Promise<void> {
    const launchSpec = resolveRuntimeLaunchSpec(runtime.id);
    const workspaceFolder = getWorkspaceFolderPath(workspaceRoot);
    if (!launchSpec || !dependencies.isCommandAvailable(launchSpec.command) || !workspaceFolder) {
        throw new Error(`${runtime.label} exec bridge is unavailable.`);
    }

    terminateActiveRuntimeProcess(runtime.id);

    const state = newCodexExecState(runtime.id);
    sendCodexExecStarted(runtime, dependencies);
    const child = spawn(launchSpec.command, buildCodexExecArgs(workspaceFolder, state.outputPath), {
        cwd: workspaceFolder,
        env: process.env,
        shell: false,
    });
    activeRuntimeProcesses.set(runtime.id, child);
    wireCodexExecChild(child, state, runtime, dependencies);
    child.stdin.write(prompt);
    child.stdin.end();
}

export function terminateActiveRuntimeProcess(runtimeId: RuntimeId): boolean {
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
