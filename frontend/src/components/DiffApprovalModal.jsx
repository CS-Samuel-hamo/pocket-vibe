import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal, Space, Tag } from 'antd-mobile';

const DiffLine = ({ line }) => {
    let color = '#d4d4d4';
    let bgColor = 'transparent';
    let fontWeight = 'normal';

    if (line.startsWith('+')) {
        color = '#a6e22e';
        bgColor = 'rgba(166, 226, 46, 0.1)';
        fontWeight = 'bold';
    } else if (line.startsWith('-')) {
        color = '#f92672';
        bgColor = 'rgba(249, 38, 114, 0.1)';
    }

    return (
        <div
            style={{
                color,
                backgroundColor: bgColor,
                fontWeight,
                fontFamily: 'monospace',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                padding: '2px 4px',
                wordBreak: 'break-all',
            }}
        >
            {line}
        </div>
    );
};

const DiffContent = ({ diffData, messages, send, onReject, onApprove, onClose }) => {
    const [extraContextBefore, setExtraContextBefore] = useState([]);
    const [extraContextAfter, setExtraContextAfter] = useState([]);
    const [targetFile, setTargetFile] = useState(null);
    const [startLine, setStartLine] = useState(1);
    const [endLine, setEndLine] = useState(100);

    useEffect(() => {
        if (!messages || messages.length === 0) {
            return;
        }

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.type === 'context.result' && lastMsg.file === targetFile) {
            if (lastMsg.position === 'before') {
                setExtraContextBefore(lastMsg.lines || []);
            } else if (lastMsg.position === 'after') {
                setExtraContextAfter(lastMsg.lines || []);
            }
        }
    }, [messages, targetFile]);

    useEffect(() => {
        if (diffData?.files && diffData.files.length > 0) {
            setTargetFile(diffData.files[0]);
            const match = String(diffData.context || '').match(/@@ -\d+,\d+ \+(\d+),(\d+) @@/);
            if (match) {
                const nextStartLine = parseInt(match[1], 10);
                const count = parseInt(match[2], 10);
                setStartLine(Math.max(1, nextStartLine));
                setEndLine(nextStartLine + count);
            }
        }
    }, [diffData]);

    const lines = useMemo(() => {
        if (!diffData) {
            return [];
        }

        let rawData = diffData.context || diffData.content || diffData.arguments || '';
        if (typeof rawData === 'object') {
            try {
                rawData = JSON.stringify(rawData, null, 2);
            } catch {
                rawData = String(rawData);
            }
        }
        return String(rawData).split('\n').filter(Boolean).slice(0, 15);
    }, [diffData]);

    const riskConfig = {
        extreme: { color: 'danger', text: 'High Risk' },
        high: { color: 'warning', text: 'Elevated Risk' },
        med: { color: 'primary', text: 'Edit Review' },
        low: { color: 'success', text: 'Low Risk' },
    };
    const risk = riskConfig[diffData?.risk] || riskConfig.med;

    return (
        <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 'bold', color: '#fff' }}>Approval Preview</div>
                <Tag color={risk.color} fill="outline">{risk.text}</Tag>
            </div>

            <div style={{ color: '#aaa', fontSize: 12, marginBottom: 8 }}>
                Tool: <strong style={{ color: '#fff' }}>{diffData?.tool_name || 'edit'}</strong>
            </div>

            <Card style={{ margin: '12px 0', backgroundColor: '#1e1e1e', overflowX: 'hidden', padding: 0, borderRadius: 8 }}>
                {targetFile && (
                    <div
                        onClick={() => {
                            const newStart = Math.max(1, startLine - 10);
                            void send({
                                type: 'context.request',
                                file: targetFile,
                                line_start: newStart,
                                line_end: startLine,
                                position: 'before',
                            });
                            setStartLine(newStart);
                        }}
                        style={{ textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: 11, cursor: 'pointer', borderBottom: '1px solid #333' }}
                    >
                        Show previous lines
                    </div>
                )}

                {extraContextBefore.map((line, index) => <DiffLine key={`before-${index}`} line={`  ${line}`} />)}

                {lines.length > 0 ? lines.map((line, index) => <DiffLine key={index} line={line} />) : <div style={{ color: '#666', padding: 12 }}>No content visible.</div>}
                {lines.length === 15 && <div style={{ color: '#888', fontSize: 12, textAlign: 'center', padding: 4 }}>... truncated ...</div>}

                {extraContextAfter.map((line, index) => <DiffLine key={`after-${index}`} line={`  ${line}`} />)}

                {targetFile && (
                    <div
                        onClick={() => {
                            const newEnd = endLine + 10;
                            void send({
                                type: 'context.request',
                                file: targetFile,
                                line_start: endLine,
                                line_end: newEnd,
                                position: 'after',
                            });
                            setEndLine(newEnd);
                        }}
                        style={{ textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: 11, cursor: 'pointer', borderTop: '1px solid #333' }}
                    >
                        Show next lines
                    </div>
                )}
            </Card>
            <Space block direction="horizontal" style={{ '--gap': '12px', marginTop: 16 }}>
                <Button block color="danger" fill="outline" size="large" onClick={() => { onReject(diffData.id); onClose(); }}>
                    Reject
                </Button>
                <Button block color="primary" size="large" onClick={() => { onApprove(diffData.id); onClose(); }}>
                    Approve
                </Button>
            </Space>
        </div>
    );
};

const DiffApprovalModal = ({ visible, diffData, onApprove, onReject, onClose, messages, send }) => {
    if (!visible || !diffData) {
        return null;
    }

    return (
        <Modal
            visible={visible}
            closeOnMaskClick={false}
            onClose={onClose}
            content={<DiffContent diffData={diffData} messages={messages} send={send} onApprove={onApprove} onReject={onReject} onClose={onClose} />}
        />
    );
};

export default DiffApprovalModal;
