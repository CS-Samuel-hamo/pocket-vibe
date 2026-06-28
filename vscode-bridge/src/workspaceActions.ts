import * as vscode from 'vscode';

import { projectContextFromMessage, resolveWorkspaceRootPath } from './workspaceProjects';

interface BackendMessage {
    type: string;
    [key: string]: any;
}

interface WorkspaceActionDependencies {
    sendToBackend(data: BackendMessage): void;
    getActiveRuntimeId(): string | undefined;
}

const artilleryFlashDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(78, 201, 176, 0.3)',
    border: '1px solid rgba(78, 201, 176, 0.8)',
    isWholeLine: true,
});

function getWorkspaceRoot(message: BackendMessage): vscode.Uri {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace is open in VS Code.');
    }
    const workspaceRoot = resolveWorkspaceRootPath(message);
    if (!workspaceRoot) {
        return workspaceFolders[0].uri;
    }
    return vscode.Uri.file(workspaceRoot);
}

function revealFocusedLine(editor: vscode.TextEditor, line: number, flash?: boolean) {
    const range = new vscode.Range(line - 1, 0, line - 1, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    if (!flash) return;
    editor.setDecorations(artilleryFlashDecoration, [range]);
    setTimeout(() => editor.setDecorations(artilleryFlashDecoration, []), 800);
}

export async function handleWorkspaceFocus(
    message: BackendMessage,
    dependencies: WorkspaceActionDependencies,
) {
    const file = String(message.file ?? '');
    if (!file) {
        return;
    }

    try {
        const uri = vscode.Uri.joinPath(getWorkspaceRoot(message), file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const line = typeof message.line === 'number' ? message.line : undefined;
        const editor = await vscode.window.showTextDocument(doc, {
            selection: line ? new vscode.Range(line - 1, 0, line - 1, 0) : undefined,
            preview: false,
        });

        if (line) {
            revealFocusedLine(editor, line, Boolean(message.flash));
        }

        dependencies.sendToBackend({
            ...projectContextFromMessage(message),
            type: 'execution.event',
            phase: 'focused',
            message: `Focused ${file}${line ? `:${line}` : ''}.`,
            file,
            line,
            reason: 'workspace.focus',
            target_runtime: dependencies.getActiveRuntimeId(),
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        dependencies.sendToBackend({
            ...projectContextFromMessage(message),
            type: 'execution.event',
            phase: 'error',
            message: `Focus failed for ${file}.`,
            file,
            reason,
            target_runtime: dependencies.getActiveRuntimeId(),
        });
    }
}

function readContextLines(doc: vscode.TextDocument, start: number, end: number): string[] {
    const lines: string[] = [];
    for (let lineIndex = start - 1; lineIndex < end; lineIndex += 1) {
        if (lineIndex < 0 || lineIndex >= doc.lineCount) continue;
        lines.push(doc.lineAt(lineIndex).text);
    }
    return lines;
}

export async function handleContextRequest(
    message: BackendMessage,
    dependencies: WorkspaceActionDependencies,
) {
    const file = String(message.file ?? '');
    if (!file) {
        return;
    }

    try {
        const uri = vscode.Uri.joinPath(getWorkspaceRoot(message), file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const start = Math.max(1, Number(message.line_start ?? 1));
        const end = Math.max(start, Number(message.line_end ?? start));

        dependencies.sendToBackend({
            ...projectContextFromMessage(message),
            type: 'context.result',
            file,
            lines: readContextLines(doc, start, end),
            position: message.position,
            line_start: start,
            line_end: end,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        dependencies.sendToBackend({
            ...projectContextFromMessage(message),
            type: 'execution.event',
            phase: 'error',
            message: `Context request failed for ${file}.`,
            file,
            reason,
            target_runtime: dependencies.getActiveRuntimeId(),
        });
    }
}
