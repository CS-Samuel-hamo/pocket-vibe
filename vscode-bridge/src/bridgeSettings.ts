import * as vscode from 'vscode';

export async function resolveBackendUrl(promptIfMissing = true): Promise<string | null> {
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

export async function resolveAuthToken(promptIfMissing = false): Promise<string | null> {
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

export function persistConnectionSettings(backendUrl: string, authToken: string) {
    const config = vscode.workspace.getConfiguration('pocketVibe');
    void config.update('backendWsUrl', backendUrl, vscode.ConfigurationTarget.Global);
    void config.update('authToken', authToken, vscode.ConfigurationTarget.Global);
}
