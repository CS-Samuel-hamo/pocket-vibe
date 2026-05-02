import { spawnSync } from 'child_process';

import { looksLikeExecutablePath } from './runtimeLaunch';

export function isCommandAvailable(command: string): boolean {
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
