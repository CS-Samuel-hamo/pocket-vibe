import fs from 'fs';
import os from 'os';
import path from 'path';

import type { RuntimeId } from './runtimeRegistry';

export interface RuntimeLaunchSpec {
    runtimeId: RuntimeId;
    terminalName: string;
    command: string;
}

interface RuntimeLaunchTemplate {
    runtimeId: RuntimeId;
    terminalName: string;
    command: string;
}

const TERMINAL_RUNTIME_SPECS: Record<string, RuntimeLaunchTemplate> = {
    'codex-cli': {
        runtimeId: 'codex-cli',
        terminalName: 'Pocket Vibe 路 codex-cli',
        command: 'codex',
    },
    'claude-code': {
        runtimeId: 'claude-code',
        terminalName: 'Pocket Vibe 路 claude-code',
        command: 'claude-code',
    },
    opencode: {
        runtimeId: 'opencode',
        terminalName: 'Pocket Vibe 路 opencode',
        command: 'opencode',
    },
    antigravity: {
        runtimeId: 'antigravity',
        terminalName: 'Pocket Vibe 路 antigravity',
        command: 'antigravity',
    },
};

function pickLatestCodexBinary(extensionRoot: string): string | null {
    if (!fs.existsSync(extensionRoot)) {
        return null;
    }

    const candidates = fs
        .readdirSync(extensionRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('openai.chatgpt-'))
        .map((entry) => path.join(extensionRoot, entry.name, 'bin', 'windows-x86_64', 'codex.exe'))
        .filter((candidate) => fs.existsSync(candidate))
        .sort((left, right) => right.localeCompare(left));

    return candidates[0] || null;
}

function resolveCodexCommand(): string {
    const override = process.env.POCKET_VIBE_CODEX_PATH?.trim();
    if (override && fs.existsSync(override)) {
        return override;
    }

    if (process.platform === 'win32') {
        const antigravityCodex = pickLatestCodexBinary(
            path.join(os.homedir(), '.antigravity', 'extensions'),
        );
        if (antigravityCodex) {
            return antigravityCodex;
        }
    }

    return 'codex';
}

export function resolveRuntimeLaunchSpec(runtimeId?: string | null): RuntimeLaunchSpec | null {
    if (!runtimeId) {
        return null;
    }

    const template = TERMINAL_RUNTIME_SPECS[runtimeId];
    if (!template) {
        return null;
    }

    if (template.runtimeId === 'codex-cli') {
        return {
            ...template,
            command: resolveCodexCommand(),
        };
    }

    return { ...template };
}

export function looksLikeExecutablePath(command: string): boolean {
    return path.isAbsolute(command);
}
