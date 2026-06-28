export interface CodexExecPacket {
    type: string;
    [key: string]: unknown;
}

export function buildCodexExecArgs(workspaceFolder: string, outputPath?: string): string[] {
    const args = [
        'exec',
        '--json',
        '--skip-git-repo-check',
        '-C',
        workspaceFolder,
        '--dangerously-bypass-approvals-and-sandbox',
    ];
    if (outputPath) {
        args.push('--output-last-message', outputPath);
    }
    args.push('-');
    return args;
}

export function parseCodexExecLine(line: string, runtimeId = 'codex-cli'): CodexExecPacket[] {
    const trimmed = line.trim();
    if (!trimmed) {
        return [];
    }

    let payload: Record<string, any>;
    try {
        payload = JSON.parse(trimmed);
    } catch {
        return [];
    }

    if (payload.type === 'turn.started') {
        return [
            {
                type: 'execution.event',
                phase: 'thinking',
                message: 'Codex CLI is thinking...',
                target_runtime: runtimeId,
                reason: 'codex.exec',
            },
        ];
    }

    if (payload.type === 'item.completed' && payload.item?.type === 'agent_message' && payload.item.text) {
        return [
            {
                type: 'assistant',
                content: String(payload.item.text),
                message: String(payload.item.text),
                target_runtime: runtimeId,
            },
        ];
    }

    if (payload.type === 'turn.completed') {
        return [
            {
                type: 'execution.event',
                phase: 'completed',
                message: 'Codex CLI completed.',
                target_runtime: runtimeId,
                reason: 'codex.exec',
            },
        ];
    }

    return [];
}
