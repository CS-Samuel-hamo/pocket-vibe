export function formatLineTarget(file?: string, lines?: number[], line?: number): string {
    const selectedLines =
        Array.isArray(lines) && lines.length > 0 ? lines.join(',') : line ? String(line) : 'unknown';
    return `${file ?? 'unknown'}:${selectedLines}`;
}
