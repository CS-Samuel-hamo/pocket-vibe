function getMessageContent(message) {
    if (!message || typeof message !== 'object') {
        return '';
    }

    if (typeof message.content === 'string' && message.content.trim()) {
        return message.content.trim();
    }
    if (typeof message.message === 'string' && message.message.trim()) {
        return message.message.trim();
    }
    if (typeof message.prompt === 'string' && message.prompt.trim()) {
        return message.prompt.trim();
    }

    return '';
}

export function getLastAssistantReply(messages = []) {
    const reply = [...messages].reverse().find((message) => message.type === 'assistant' && getMessageContent(message));
    return reply
        ? {
            content: getMessageContent(reply),
            runtime: reply.target_runtime || null,
            timestamp: reply.timestamp || null,
        }
        : null;
}

export function getRecentControlEvents(messages = [], history = [], limit = 4) {
    const auditEvents = history
        .filter((item) => {
            const detail = item.message || item.approval_id || '';
            if (!detail) {
                return false;
            }

            const category = String(item.category || item.action || '').toLowerCase();
            if (category === 'session' && /client (joined|left) room/i.test(detail)) {
                return false;
            }

            return true;
        })
        .slice(0, limit * 2)
        .map((item, index) => ({
            key: `history-${index}-${item.timestamp || item.message || 'event'}`,
            title: item.category || item.action || 'event',
            detail: item.message || item.approval_id || 'No details',
            timestamp: item.timestamp || null,
        }));

    const messageEvents = [...messages]
        .reverse()
        .filter((message) => {
            if (message.type === 'kill.result' || message.type === 'approval.result') {
                return true;
            }
            return message.type === 'execution.event' && ['error', 'runtime'].includes(message.phase);
        })
        .slice(0, limit * 2)
        .map((message, index) => ({
            key: `message-${index}-${message.seq_id || message.timestamp || message.reason || 'event'}`,
            title: message.type === 'kill.result'
                ? 'kill'
                : message.type === 'approval.result'
                    ? 'approval'
                    : message.phase || message.type,
            detail: getMessageContent(message) || message.reason || 'No details',
            timestamp: message.timestamp || null,
        }));

    return [...auditEvents, ...messageEvents]
        .filter((event, index, events) => events.findIndex((candidate) => candidate.title === event.title && candidate.detail === event.detail) === index)
        .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))
        .slice(0, limit);
}
