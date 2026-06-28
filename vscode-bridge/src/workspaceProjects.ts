import path from 'path';
import * as vscode from 'vscode';

interface HostMetadata {
    id: string;
    label: string;
}

export interface BackendMessage {
    type: string;
    [key: string]: any;
}

export interface WorkspaceProjectMetadata {
    id: string;
    name: string;
    root_path: string | null;
    host_id: string;
    host_label: string;
    platform: 'vscode';
    bridge_label: string;
}

function normalizePath(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }
    return path.resolve(value);
}

function projectId(hostId: string, rootPath: string | null): string {
    return rootPath ? `${hostId}::${rootPath.toLowerCase()}` : `${hostId}::default`;
}

function folderProject(folder: vscode.WorkspaceFolder, host: HostMetadata, bridgeLabel: string): WorkspaceProjectMetadata {
    const rootPath = normalizePath(folder.uri.fsPath);
    return {
        id: projectId(host.id, rootPath),
        name: folder.name,
        root_path: rootPath,
        host_id: host.id,
        host_label: host.label,
        platform: 'vscode',
        bridge_label: bridgeLabel,
    };
}

function fallbackProject(host: HostMetadata, bridgeLabel: string): WorkspaceProjectMetadata {
    return {
        id: projectId(host.id, null),
        name: 'No Workspace',
        root_path: null,
        host_id: host.id,
        host_label: host.label,
        platform: 'vscode',
        bridge_label: bridgeLabel,
    };
}

export function buildWorkspaceProjectMetadata(host: HostMetadata, bridgeLabel: string): WorkspaceProjectMetadata & {
    projects: WorkspaceProjectMetadata[];
} {
    const projects = (vscode.workspace.workspaceFolders || []).map((folder) => folderProject(folder, host, bridgeLabel));
    const primaryProject = projects[0] || fallbackProject(host, bridgeLabel);
    return {
        ...primaryProject,
        projects: projects.length > 0 ? projects : [primaryProject],
    };
}

export function resolveWorkspaceRootPath(message: BackendMessage): string | undefined {
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length === 0) {
        return undefined;
    }

    const targetRoot = normalizePath(String(message.target_project_root || '').trim());
    if (targetRoot) {
        const matchingFolder = folders.find((folder) => normalizePath(folder.uri.fsPath)?.toLowerCase() === targetRoot.toLowerCase());
        if (matchingFolder) {
            return normalizePath(matchingFolder.uri.fsPath) || undefined;
        }
    }

    const targetProjectId = String(message.project_id || '').trim();
    if (targetProjectId) {
        const hostId = String(message.host_id || '').trim();
        const matchingFolder = folders.find((folder) => {
            const rootPath = normalizePath(folder.uri.fsPath);
            return rootPath && hostId && projectId(hostId, rootPath) === targetProjectId;
        });
        if (matchingFolder) {
            return normalizePath(matchingFolder.uri.fsPath) || undefined;
        }
    }

    return normalizePath(folders[0].uri.fsPath) || undefined;
}

export function projectContextFromMessage(message: BackendMessage): Partial<BackendMessage> {
    return {
        project_id: message.project_id,
    };
}

export function withProjectContext(data: BackendMessage, source: BackendMessage): BackendMessage {
    return {
        ...projectContextFromMessage(source),
        ...data,
    };
}

export function createProjectScopedSender(
    source: BackendMessage,
    send: (data: BackendMessage) => void,
): (data: BackendMessage) => void {
    return (data: BackendMessage) => send(withProjectContext(data, source));
}
