export function buildPreview(content, limit = 80) {
    const lines = String(content || '').split('\n');
    return {
        lineCount: lines.length,
        preview: lines.slice(0, limit).join('\n'),
        truncated: lines.length > limit,
    };
}
