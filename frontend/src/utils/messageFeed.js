const HIDDEN_CONSOLE_TYPES = new Set(['session.state', 'capabilities', 'hello', 'pong', 'key_exchange']);

function coerceString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function getMessageContent(message) {
    if (!message || typeof message !== 'object') {
        return '';
    }

    return (
        coerceString(message.content) ||
        coerceString(message.message) ||
        coerceString(message.prompt)
    );
}

export function normalizeIncomingMessage(message) {
    if (!message || typeof message !== 'object') {
        return message;
    }

    const normalized = { ...message };

    if (!normalized.content) {
        const content = getMessageContent(normalized);
        if (content) {
            normalized.content = content;
        }
    }

    if (normalized.type === 'approval.request' && !normalized.id) {
        normalized.id = normalized.approval_id;
    }

    if (normalized.type === 'approval.response' && !normalized.id) {
        normalized.id = normalized.approval_id;
    }

    if (normalized.type === 'context.result' && !normalized.lines) {
        normalized.lines = [];
    }

    return normalized;
}

function comparableFields(message) {
    return [
        message.type,
        message.phase,
        message.state,
        message.category,
        message.reason,
        message.target_runtime,
        message.file,
        message.line_start,
        message.line_end,
        getMessageContent(message),
    ];
}

function shouldMergePendingUser(previousMessage, nextMessage) {
    if (!previousMessage || !nextMessage) {
        return false;
    }

    return (
        previousMessage.type === 'user' &&
        previousMessage.local === true &&
        nextMessage.type === 'user' &&
        nextMessage.local !== true &&
        getMessageContent(previousMessage) === getMessageContent(nextMessage)
    );
}

export function isConsecutiveDuplicate(previousMessage, nextMessage) {
    if (!previousMessage || !nextMessage) {
        return false;
    }

    if (previousMessage.local || nextMessage.local) {
        return false;
    }

    if (previousMessage.seq_id && nextMessage.seq_id && previousMessage.seq_id === nextMessage.seq_id) {
        return true;
    }

    const previousFields = comparableFields(previousMessage);
    const nextFields = comparableFields(nextMessage);
    return previousFields.every((field, index) => field === nextFields[index]);
}

export function appendIncomingMessage(previousMessages, incomingMessage) {
    const nextMessage = normalizeIncomingMessage(incomingMessage);
    if (!nextMessage) {
        return previousMessages;
    }

    if (nextMessage.seq_id && previousMessages.some((message) => message.seq_id === nextMessage.seq_id)) {
        return previousMessages;
    }

    if (nextMessage.type === 'diff' && previousMessages.length > 0) {
        const lastMessage = previousMessages[previousMessages.length - 1];
        if (lastMessage.type === 'diff' && lastMessage.file === nextMessage.file) {
            return [
                ...previousMessages.slice(0, -1),
                {
                    ...lastMessage,
                    ...nextMessage,
                    content: `${lastMessage.content || ''}\n${nextMessage.content || ''}`.trim(),
                },
            ];
        }
    }

    const lastMessage = previousMessages[previousMessages.length - 1];
    if (shouldMergePendingUser(lastMessage, nextMessage)) {
        return [
            ...previousMessages.slice(0, -1),
            {
                ...lastMessage,
                ...nextMessage,
                local: false,
            },
        ];
    }

    if (isConsecutiveDuplicate(lastMessage, nextMessage)) {
        return previousMessages;
    }

    return [...previousMessages, nextMessage];
}

export function shouldHideInConsole(message) {
    if (!message || HIDDEN_CONSOLE_TYPES.has(message.type)) {
        return true;
    }

    const content = getMessageContent(message);

    if (message.type === 'audit.event' && message.category === 'session' && /client (joined|left) room/i.test(content)) {
        return true;
    }

    if (
        message.type === 'execution.event' &&
        ['dispatch', 'dispatched', 'completed', 'thinking'].includes(message.phase)
    ) {
        if (/(prompt|command|workspace focus) dispatched to desktop host/i.test(content)) {
            return true;
        }

        if (/^Prompt sent to /i.test(content)) {
            return true;
        }

        if (/^Codex CLI exec session started\./i.test(content)) {
            return true;
        }

        if (/^Codex CLI is thinking\.\.\./i.test(content)) {
            return true;
        }

        if (/^Codex CLI completed\./i.test(content)) {
            return true;
        }
    }

    if (
        message.type === 'execution.event' &&
        message.phase === 'output' &&
        /^Running .* in Pocket Vibe Shell\./i.test(content)
    ) {
        return true;
    }

    return false;
}
