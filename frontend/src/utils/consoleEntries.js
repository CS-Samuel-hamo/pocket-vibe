import { getMessageContent, shouldHideInConsole } from './messageFeed.js';

const COMMAND_GROUP_MIN_LINES = 3;
const COMMAND_GROUP_PREVIEW_LINES = 3;
const COMMAND_ERROR_PATTERN = /\b(error|failed|exception|traceback|enoent|cannot|not found|syntaxerror)\b/i;
const COMMAND_WARNING_PATTERN = /\b(warn(?:ing)?|deprecated)\b/i;
const COMMAND_SUCCESS_PATTERN = /\b(built in|completed successfully|succeeded|success|done|passed|compiled successfully|finished)\b/i;

function formatRuntimeBadge(runtimeId) {
    if (!runtimeId) {
        return '';
    }
    return String(runtimeId).replace(/[-_]/g, ' ').toUpperCase();
}

export function toConsoleEntry(message) {
    if (!message || shouldHideInConsole(message)) {
        return null;
    }

    if (message.type === 'diff') {
        return {
            variant: 'system',
            label: 'DIFF',
            badge: message.file ? 'PATCH' : '',
            content: message.file ? `Diff updated for ${message.file}` : 'Diff updated',
            local: false,
        };
    }

    if (message.type === 'context.result') {
        const start = message.line_start ?? '?';
        const end = message.line_end ?? start;
        return {
            variant: 'system',
            label: 'CTX',
            badge: `${start}-${end}`,
            content: message.file ? `Context loaded from ${message.file}` : 'Context loaded',
            local: false,
        };
    }

    const content = getMessageContent(message);
    if (!content) {
        return null;
    }

    switch (message.type) {
        case 'user':
            return {
                variant: 'user',
                label: 'YOU',
                badge: '',
                content,
                local: Boolean(message.local),
            };
        case 'assistant':
            return {
                variant: 'assistant',
                label: 'AI',
                badge: formatRuntimeBadge(message.target_runtime),
                content,
                local: false,
            };
        case 'command':
            return {
                variant: 'command',
                label: 'CMD',
                badge: '',
                content,
                local: false,
            };
        case 'status':
            return {
                variant: message.state === 'error' ? 'error' : 'system',
                label: 'HOST',
                badge: String(message.state || 'status').replace(/_/g, ' ').toUpperCase(),
                content,
                local: false,
            };
        case 'execution.event':
            return {
                variant: message.phase === 'error' ? 'error' : 'system',
                label: 'SYS',
                badge: String(message.phase || 'event').replace(/_/g, ' ').toUpperCase(),
                content,
                local: false,
            };
        case 'approval.request':
            return {
                variant: 'system',
                label: 'REVIEW',
                badge: String(message.risk || 'pending').toUpperCase(),
                content,
                local: false,
            };
        case 'approval.result':
            return {
                variant: message.ok ? 'system' : 'error',
                label: 'REVIEW',
                badge: message.ok ? 'DONE' : 'FAILED',
                content,
                local: false,
            };
        case 'kill.result':
            return {
                variant: message.ok ? 'system' : 'error',
                label: 'KILL',
                badge: message.ok ? 'SENT' : 'FAILED',
                content,
                local: false,
            };
        case 'audit.event':
            return {
                variant: 'system',
                label: 'AUDIT',
                badge: String(message.category || 'event').toUpperCase(),
                content,
                local: false,
            };
        case 'log':
        case 'sys':
            return {
                variant: 'system',
                label: 'LOG',
                badge: '',
                content,
                local: false,
            };
        default:
            return {
                variant: 'system',
                label: String(message.type || 'event').slice(0, 12).toUpperCase(),
                badge: '',
                content,
                local: Boolean(message.local),
            };
    }
}

function createSingleEntry(source, entry, index) {
    return {
        kind: 'single',
        key: `${source.seq_id || source.timestamp || source.content || source.message || 'entry'}-${index}`,
        source,
        entry,
    };
}

function dedupeLines(lines) {
    return lines.filter(
        (line, index) => line && lines.findIndex((candidate) => candidate === line) === index,
    );
}

function buildCommandPreview(lines) {
    const commandLine = lines.find((line) => line.startsWith('$ ')) || lines[0] || '';
    const bodyLines = lines.filter((line, index) => !(index === 0 && line === commandLine));
    const errorLines = bodyLines.filter((line) => COMMAND_ERROR_PATTERN.test(line));
    const warningLines = bodyLines.filter((line) => COMMAND_WARNING_PATTERN.test(line));
    const successLines = bodyLines.filter((line) => COMMAND_SUCCESS_PATTERN.test(line));
    const tailLine = [...bodyLines].reverse().find((line) => line.trim()) || '';

    if (errorLines.length > 0) {
        return {
            tone: 'error',
            meta: 'Script failed',
            previewLines: dedupeLines([commandLine, ...errorLines.slice(-2)]).slice(0, COMMAND_GROUP_PREVIEW_LINES),
        };
    }

    if (warningLines.length > 0 && successLines.length > 0) {
        return {
            tone: 'warning',
            meta: 'Script completed with warnings',
            previewLines: dedupeLines([commandLine, warningLines.at(-1), successLines.at(-1)]).slice(0, COMMAND_GROUP_PREVIEW_LINES),
        };
    }

    if (successLines.length > 0) {
        return {
            tone: 'success',
            meta: 'Script completed',
            previewLines: dedupeLines([commandLine, successLines.at(-1)]).slice(0, COMMAND_GROUP_PREVIEW_LINES),
        };
    }

    if (warningLines.length > 0) {
        return {
            tone: 'warning',
            meta: 'Script output',
            previewLines: dedupeLines([commandLine, warningLines.at(-1), tailLine]).slice(0, COMMAND_GROUP_PREVIEW_LINES),
        };
    }

    return {
        tone: 'neutral',
        meta: 'Script output',
        previewLines: dedupeLines([commandLine, tailLine]).slice(0, COMMAND_GROUP_PREVIEW_LINES),
    };
}

export function buildConsoleEntries(messages = []) {
    const normalized = messages
        .map((message) => ({
            source: message,
            entry: toConsoleEntry(message),
        }))
        .filter((item) => item.entry);

    const grouped = [];

    for (let index = 0; index < normalized.length; index += 1) {
        const current = normalized[index];
        if (!current || current.entry.variant !== 'command') {
            grouped.push(createSingleEntry(current.source, current.entry, index));
            continue;
        }

        const commandItems = [current];
        let offset = index + 1;
        while (offset < normalized.length && normalized[offset].entry.variant === 'command') {
            commandItems.push(normalized[offset]);
            offset += 1;
        }

        if (commandItems.length < COMMAND_GROUP_MIN_LINES) {
            commandItems.forEach((item, commandIndex) => {
                grouped.push(createSingleEntry(item.source, item.entry, index + commandIndex));
            });
            index = offset - 1;
            continue;
        }

        const lines = commandItems.map((item) => item.entry.content);
        const preview = buildCommandPreview(lines);
        grouped.push({
            kind: 'command-group',
            key: `${commandItems[0].source.seq_id || commandItems[0].source.timestamp || 'command-group'}-${lines.length}`,
            label: 'CMD',
            badge: `${lines.length} LINES`,
            variant: 'command',
            lines,
            previewLines: preview.previewLines,
            hiddenCount: Math.max(0, lines.length - preview.previewLines.length),
            tone: preview.tone,
            meta: preview.meta,
        });

        index = offset - 1;
    }

    return grouped;
}
