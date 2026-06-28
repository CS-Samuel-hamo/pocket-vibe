import * as vscode from 'vscode';

import { type BackendMessage, withProjectContext } from './workspaceProjects';

interface WorkspaceFolderPickerDependencies {
    sendToBackend(data: BackendMessage): void;
    reportCapabilities(includeHello?: boolean): Promise<void>;
}

interface WorkspaceFolderToAdd {
    readonly uri: vscode.Uri;
    readonly name?: string;
}

function folderEvent(source: BackendMessage, phase: string, message: string, reason: string): BackendMessage {
    return withProjectContext({
        type: 'execution.event',
        phase,
        message,
        action: 'project.addFolder',
        reason,
    }, source);
}

function newWorkspaceFolders(selectedFolders: vscode.Uri[]): WorkspaceFolderToAdd[] {
    const existingFolders = vscode.workspace.workspaceFolders || [];
    const existingRoots = new Set(existingFolders.map((folder) => folder.uri.fsPath.toLowerCase()));
    return selectedFolders
        .filter((uri) => !existingRoots.has(uri.fsPath.toLowerCase()))
        .map((uri) => ({ uri }));
}

async function chooseWorkspaceFolders(): Promise<vscode.Uri[] | undefined> {
    return vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: true,
        openLabel: 'Add to Pocket Vibe',
        title: 'Add folders to the Pocket Vibe workspace',
    });
}

async function addFoldersToWorkspace(foldersToAdd: WorkspaceFolderToAdd[]) {
    const insertAt = vscode.workspace.workspaceFolders?.length || 0;
    const added = vscode.workspace.updateWorkspaceFolders(insertAt, 0, ...foldersToAdd);
    if (!added) {
        throw new Error('VS Code refused to update workspace folders.');
    }
}

function sendFailure(source: BackendMessage, dependencies: WorkspaceFolderPickerDependencies, error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    dependencies.sendToBackend(folderEvent(source, 'error', 'Could not add folders to the VS Code workspace.', reason));
}

async function addSelectedFolders(
    message: BackendMessage,
    dependencies: WorkspaceFolderPickerDependencies,
) {
    const selectedFolders = await chooseWorkspaceFolders();
    if (!selectedFolders || selectedFolders.length === 0) {
        dependencies.sendToBackend(folderEvent(message, 'completed', 'Folder picker was cancelled.', 'workspace.add_folder.cancelled'));
        return;
    }

    const foldersToAdd = newWorkspaceFolders(selectedFolders);
    if (foldersToAdd.length === 0) {
        dependencies.sendToBackend(folderEvent(message, 'completed', 'Selected folders are already in the VS Code workspace.', 'workspace.add_folder.noop'));
        await dependencies.reportCapabilities();
        return;
    }

    await addFoldersToWorkspace(foldersToAdd);
    dependencies.sendToBackend(folderEvent(message, 'completed', `Added ${foldersToAdd.length} folder${foldersToAdd.length === 1 ? '' : 's'} to the VS Code workspace.`, 'workspace.add_folder.added'));
    await dependencies.reportCapabilities(true);
}

export async function handleProjectAddFolder(
    message: BackendMessage,
    dependencies: WorkspaceFolderPickerDependencies,
) {
    dependencies.sendToBackend(folderEvent(message, 'dispatched', 'VS Code folder picker opened on the desktop.', 'workspace.add_folder.dialog'));
    try {
        await addSelectedFolders(message, dependencies);
    } catch (error) {
        sendFailure(message, dependencies, error);
    }
}
