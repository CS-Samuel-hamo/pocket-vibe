import * as vscode from 'vscode';
import WebSocket from 'ws';

interface BackendMessage {
    type: string;
    [key: string]: any;
}

export interface ConnectionOptions {
    backendUrl?: string | null;
    authToken?: string | null;
    promptForToken?: boolean;
    showConnectionErrors?: boolean;
    isReconnect?: boolean;
}

export type ConnectionStatus = 'configure' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface BackendConnectionState {
    socket: WebSocket | null;
    reconnectTimer: NodeJS.Timeout | null;
    reconnectAttempt: number;
    manualDisconnect: boolean;
    lastConnectionConfig: { backendUrl: string; authToken: string } | null;
}

export interface BackendConnectionDependencies {
    bridgeRole: string;
    resolveBackendUrl(): Promise<string | null>;
    resolveAuthToken(promptIfMissing?: boolean): Promise<string | null>;
    persistConnectionSettings(backendUrl: string, authToken: string): void;
    updateStatusBar(status: ConnectionStatus): void;
    handleMessage(message: BackendMessage): Promise<void>;
    ensurePreferredRuntimeReady(): Promise<void>;
    reportCapabilities(includeHello?: boolean): Promise<void>;
}

export function createBackendConnectionState(): BackendConnectionState {
    return {
        socket: null,
        reconnectTimer: null,
        reconnectAttempt: 0,
        manualDisconnect: false,
        lastConnectionConfig: null,
    };
}

function clearReconnectTimer(state: BackendConnectionState) {
    if (!state.reconnectTimer) {
        return;
    }
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
}

function closeSocket(
    state: BackendConnectionState,
    dependencies: BackendConnectionDependencies,
    updateStatus = false,
) {
    if (state.socket) {
        const current = state.socket;
        state.socket = null;
        current.removeAllListeners();
        current.close();
    }
    if (!updateStatus) {
        return;
    }
    void dependencies.resolveAuthToken(false).then((token) => {
        dependencies.updateStatusBar(token ? 'disconnected' : 'configure');
    });
}

function scheduleReconnect(
    state: BackendConnectionState,
    dependencies: BackendConnectionDependencies,
) {
    if (state.manualDisconnect || state.reconnectTimer || !state.lastConnectionConfig) {
        return;
    }

    const delay = Math.min(30000, 1000 * 2 ** state.reconnectAttempt);
    state.reconnectAttempt += 1;
    dependencies.updateStatusBar('connecting');
    state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        void connectToBackend(state, dependencies, {
            backendUrl: state.lastConnectionConfig?.backendUrl ?? null,
            authToken: state.lastConnectionConfig?.authToken ?? null,
            promptForToken: false,
            showConnectionErrors: false,
            isReconnect: true,
        });
    }, delay);
}

function attachSocketHandlers(
    state: BackendConnectionState,
    dependencies: BackendConnectionDependencies,
    ws: WebSocket,
    options: ConnectionOptions,
) {
    ws.on('open', () => {
        if (state.socket !== ws) {
            return;
        }
        state.reconnectAttempt = 0;
        clearReconnectTimer(state);
        dependencies.updateStatusBar('connected');
        void dependencies.ensurePreferredRuntimeReady().then(() => dependencies.reportCapabilities(true));
    });

    ws.on('message', (data: any) => {
        try {
            const message = JSON.parse(String(data)) as BackendMessage;
            void dependencies.handleMessage(message);
        } catch (error) {
            console.error('Pocket Vibe: failed to parse message', error);
        }
    });

    ws.on('close', () => {
        if (state.socket === ws) {
            state.socket = null;
        }
        dependencies.updateStatusBar('disconnected');
        if (!state.manualDisconnect) {
            scheduleReconnect(state, dependencies);
        }
    });

    ws.on('error', (error: Error) => {
        console.error('Pocket Vibe bridge error:', error);
        if (state.socket === ws) {
            dependencies.updateStatusBar('error');
        }
        if (options.showConnectionErrors ?? !options.isReconnect) {
            void vscode.window.showWarningMessage(`Pocket Vibe bridge error: ${error.message}`);
        }
    });
}

export async function connectToBackend(
    state: BackendConnectionState,
    dependencies: BackendConnectionDependencies,
    options: ConnectionOptions = {},
) {
    const backendUrl = options.backendUrl?.trim() || (await dependencies.resolveBackendUrl());
    const authToken =
        options.authToken?.trim() ||
        (await dependencies.resolveAuthToken(options.promptForToken ?? true));
    if (!backendUrl || !authToken) {
        dependencies.updateStatusBar('configure');
        return;
    }

    state.lastConnectionConfig = { backendUrl, authToken };
    dependencies.persistConnectionSettings(backendUrl, authToken);
    state.manualDisconnect = false;
    state.reconnectAttempt = options.isReconnect ? state.reconnectAttempt : 0;
    clearReconnectTimer(state);
    closeSocket(state, dependencies, false);

    const url = `${backendUrl}?role=${dependencies.bridgeRole}&token=${encodeURIComponent(authToken)}`;
    dependencies.updateStatusBar('connecting');

    const ws = new WebSocket(url);
    state.socket = ws;
    attachSocketHandlers(state, dependencies, ws, options);
}

export function disconnectFromBackend(
    state: BackendConnectionState,
    dependencies: BackendConnectionDependencies,
) {
    state.manualDisconnect = true;
    state.reconnectAttempt = 0;
    clearReconnectTimer(state);
    closeSocket(state, dependencies, true);
}

export function isBackendConnected(state: BackendConnectionState): boolean {
    return Boolean(state.socket && state.socket.readyState === WebSocket.OPEN);
}

export function sendBackendMessage(state: BackendConnectionState, data: BackendMessage) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify(data));
    }
}
