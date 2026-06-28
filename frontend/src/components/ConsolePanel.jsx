import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Toast } from 'antd-mobile';
import { BrainCircuit, Terminal, Volume2 } from 'lucide-react';

import { isFeatureEnabled } from '../config/features';
import { buildConsoleEntries } from '../utils/consoleEntries';

const LONG_USER_PROMPT_LIMIT = 260;

const ConsolePanel = ({ messages, messagesEndRef, thinking }) => {
    const panelRef = useRef(null);
    const shouldStickToBottomRef = useRef(true);
    const [expandedGroups, setExpandedGroups] = useState({});
    const [expandedEntries, setExpandedEntries] = useState({});

    const renderedMessages = useMemo(
        () => buildConsoleEntries(messages),
        [messages],
    );

    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) {
            return undefined;
        }

        const updateStickiness = () => {
            const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
            shouldStickToBottomRef.current = distanceFromBottom < 72;
        };

        updateStickiness();
        panel.addEventListener('scroll', updateStickiness, { passive: true });
        return () => panel.removeEventListener('scroll', updateStickiness);
    }, []);

    useEffect(() => {
        if (!shouldStickToBottomRef.current) {
            return undefined;
        }

        const scrollToBottom = () => {
            const panel = panelRef.current;
            if (panel) {
                panel.scrollTop = panel.scrollHeight;
            }
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        };

        const animationFrame = window.requestAnimationFrame(scrollToBottom);
        const timeout = window.setTimeout(scrollToBottom, 120);
        return () => {
            window.cancelAnimationFrame(animationFrame);
            window.clearTimeout(timeout);
        };
    }, [messagesEndRef, renderedMessages.length]);

    const toggleGroup = (groupKey) => {
        setExpandedGroups((current) => ({
            ...current,
            [groupKey]: !current[groupKey],
        }));
    };

    const toggleEntry = (entryKey) => {
        setExpandedEntries((current) => ({
            ...current,
            [entryKey]: !current[entryKey],
        }));
    };

    const handleRead = () => {
        if (!isFeatureEnabled('isPro')) {
            Toast.show('Voice readout is a Pro feature.');
            return;
        }
        const lastLines = renderedMessages
            .slice(-3)
            .map((item) => {
                if (item.kind === 'command-group') {
                    return item.previewLines.join('. ');
                }
                return item.entry.content;
            })
            .join('. ');
        if (lastLines) {
            const utterance = new SpeechSynthesisUtterance(lastLines);
            utterance.lang = 'zh-CN';
            window.speechSynthesis.speak(utterance);
        }
    };

    return (
        <div className="terminal-panel" id="terminalPanel" ref={panelRef}>
            <div className="terminal-label">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Terminal size={14} style={{ marginRight: 6 }} />
                    CONVERSATION
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {thinking && (
                        <div className="thinking-indicator">
                            <BrainCircuit size={12} className="thinking-dot" />
                            <span>AI 思考中...</span>
                        </div>
                    )}
                    <Volume2
                        size={14}
                        onClick={handleRead}
                        style={{ cursor: 'pointer', color: isFeatureEnabled('isPro') ? '#4caf50' : '#888' }}
                    />
                </div>
            </div>
            <div className="terminal-content">
                {renderedMessages.map((item) => {
                    if (item.kind === 'command-group') {
                        const isExpanded = Boolean(expandedGroups[item.key]);
                        const visibleLines = isExpanded ? item.lines : item.previewLines;
                        return (
                            <article key={item.key} className={`line command command-group ${item.tone || 'neutral'}`}>
                                <div className="line-header">
                                    <span className="line-label">{item.label}</span>
                                    <span className="line-badge">{item.badge}</span>
                                    <span className="line-meta">{item.meta || '脚本输出'}</span>
                                </div>
                                <div className="line-group-preview">
                                    {visibleLines.map((line, index) => (
                                        <div key={`${item.key}-${index}`} className="text line-group-line">
                                            {line}
                                        </div>
                                    ))}
                                </div>
                                {!isExpanded && item.hiddenCount > 0 ? (
                                    <div className="line-group-more">{item.hiddenCount} more lines hidden.</div>
                                ) : null}
                                <div className="line-group-actions">
                                    <Button size="mini" fill="outline" onClick={() => toggleGroup(item.key)}>
                                        {isExpanded ? 'Collapse' : 'Show Output'}
                                    </Button>
                                </div>
                            </article>
                        );
                    }

                    const { entry } = item;
                    const isLongUserPrompt =
                        entry.variant === 'user' && entry.content.length > LONG_USER_PROMPT_LIMIT;
                    const isExpanded = Boolean(expandedEntries[item.key]);
                    const visibleContent = isLongUserPrompt && !isExpanded
                        ? `${entry.content.slice(0, LONG_USER_PROMPT_LIMIT).trimEnd()}...`
                        : entry.content;

                    return (
                        <article
                            key={item.key}
                            className={`line ${entry.variant}${entry.local ? ' pending' : ''}${isLongUserPrompt ? ' compact-prompt' : ''}`}
                        >
                            <div className="line-header">
                                <span className="line-label">{entry.label}</span>
                                {entry.badge ? <span className="line-badge">{entry.badge}</span> : null}
                                {isLongUserPrompt ? <span className="line-badge">PROMPT</span> : null}
                                {entry.local ? <span className="line-meta">Sending...</span> : null}
                            </div>
                            <div className="text">{visibleContent}</div>
                            {isLongUserPrompt ? (
                                <div className="line-group-actions compact-prompt-actions">
                                    <Button size="mini" fill="outline" onClick={() => toggleEntry(item.key)}>
                                        {isExpanded ? 'Collapse Prompt' : 'Show Full Prompt'}
                                    </Button>
                                </div>
                            ) : null}
                        </article>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

export default ConsolePanel;
