import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Toast } from 'antd-mobile';
import { BrainCircuit, Terminal, Volume2 } from 'lucide-react';

import { isFeatureEnabled } from '../config/features';
import { buildConsoleEntries } from '../utils/consoleEntries';

const ConsolePanel = ({ messages, messagesEndRef, thinking }) => {
    const panelRef = useRef(null);
    const shouldStickToBottomRef = useRef(true);
    const [expandedGroups, setExpandedGroups] = useState({});

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
        if (shouldStickToBottomRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [messagesEndRef, renderedMessages]);

    const toggleGroup = (groupKey) => {
        setExpandedGroups((current) => ({
            ...current,
            [groupKey]: !current[groupKey],
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
                    CONSOLE
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {thinking && (
                        <div className="thinking-indicator">
                            <BrainCircuit size={12} className="thinking-dot" />
                            <span>AGENT THINKING...</span>
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
                                    <span className="line-meta">{item.meta || 'Script output'}</span>
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
                    return (
                        <article
                            key={item.key}
                            className={`line ${entry.variant}${entry.local ? ' pending' : ''}`}
                        >
                            <div className="line-header">
                                <span className="line-label">{entry.label}</span>
                                {entry.badge ? <span className="line-badge">{entry.badge}</span> : null}
                                {entry.local ? <span className="line-meta">Sending...</span> : null}
                            </div>
                            <div className="text">{entry.content}</div>
                        </article>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

export default ConsolePanel;
