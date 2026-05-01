import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import CodePanel from './CodePanel';
import ConsolePanel from './ConsolePanel';
import { buildMobileLink } from '../utils/connectionConfig';

export default function DesktopTerminalView({
    messages = [],
    thinking = false,
    messagesEndRef,
    activeFiles = [],
    currentFileIndex = 0,
    setCurrentFileIndex,
    send,
    setInputVal,
    sessionToken,
    sessionInfo,
    capabilityInfo,
    activeRuntime,
    diagnostics,
    apiBaseUrl,
    backendWsBaseUrl,
}) {
    const [localIp, setLocalIp] = useState(window.location.hostname);

    useEffect(() => {
        fetch(`${apiBaseUrl}/api/sys/ip`)
            .then((response) => response.json())
            .then((data) => {
                if (data.ip) {
                    setLocalIp(data.ip);
                }
            })
            .catch((error) => console.log('Could not fetch LAN IP', error));
    }, [apiBaseUrl]);

    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.type !== 'workspace.focus' || !lastMsg.file) {
            return;
        }

        const index = activeFiles.findIndex((file) => file.name === lastMsg.file);
        if (index !== -1 && index !== currentFileIndex) {
            setCurrentFileIndex(index);
        }
    }, [activeFiles, currentFileIndex, messages, setCurrentFileIndex]);

    const token = sessionToken || 'demo-room';
    const usesLoopbackHost = ['127.0.0.1', 'localhost', '0.0.0.0'].includes(window.location.hostname);
    const frontendPort = window.location.port || '5173';
    const mobileBaseUrl = usesLoopbackHost
        ? `${window.location.protocol}//${localIp}:${frontendPort}/`
        : `${window.location.origin}/`;
    const mobileLink = buildMobileLink({
        mobileBaseUrl,
        token,
        backendWsUrl: backendWsBaseUrl,
        apiBaseUrl,
    });
    const activeRuntimeLabel = activeRuntime?.label || 'Desktop Host';
    const runtimeHealth = activeRuntime?.health || 'offline';
    const runtimeError = activeRuntime?.last_error || diagnostics?.lastFailureReason;

    return (
        <div className="desktop-view" style={{ display: 'flex', height: '100%', width: '100%' }}>
            <div className="desktop-console" style={{ width: '400px', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
                <ConsolePanel messages={messages} thinking={thinking} messagesEndRef={messagesEndRef} />

                <div style={{ padding: '16px', background: '#1e1e1e', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#ccc', textAlign: 'center' }}>
                        <strong>Scan to Open Remote Control</strong><br />
                        <span style={{ fontSize: '11px', color: '#888' }}>Runtime: {activeRuntimeLabel}</span><br />
                        <span style={{ fontSize: '11px', color: runtimeHealth === 'ready' ? '#4ec9b0' : runtimeHealth === 'degraded' ? '#ffb347' : '#ff8080' }}>
                            Health: {runtimeHealth}
                        </span><br />
                        <span style={{ fontSize: '11px', color: '#888' }}>Session: {token}</span>
                    </div>
                    <div style={{ padding: '8px', background: 'white', borderRadius: '8px' }}>
                        <QRCodeCanvas value={mobileLink} size={120} />
                    </div>
                    <a href={mobileLink} target="_blank" rel="noreferrer" style={{ fontSize: '11px', color: '#007acc', wordBreak: 'break-all' }}>
                        {mobileLink}
                    </a>
                    <div style={{ width: '100%', fontSize: '10px', color: '#8b94a7', display: 'grid', gap: 6 }}>
                        <div>
                            <strong style={{ color: '#cfd5df' }}>Backend WS</strong><br />
                            <span style={{ wordBreak: 'break-all' }}>{backendWsBaseUrl}</span>
                        </div>
                        <div>
                            <strong style={{ color: '#cfd5df' }}>API Base</strong><br />
                            <span style={{ wordBreak: 'break-all' }}>{apiBaseUrl}</span>
                        </div>
                    </div>
                    {runtimeError && runtimeError !== 'No recent failures.' && (
                        <div style={{ fontSize: '11px', color: '#ff8080', textAlign: 'center' }}>
                            Last issue: {runtimeError}
                        </div>
                    )}
                </div>
            </div>

            <div className="desktop-code" style={{ flex: 1, overflow: 'hidden' }}>
                <CodePanel
                    activeFiles={activeFiles}
                    currentFileIndex={currentFileIndex}
                    onFileChange={(index) => {
                        setCurrentFileIndex(index);
                        if (activeFiles[index]) {
                            void send({ type: 'workspace.focus', file: activeFiles[index].name });
                        }
                    }}
                    onLineSelect={(file, start, end) => {
                        setInputVal((value) => `${value} @${file}#L${start}${end !== start ? `-${end}` : ''} `);
                        void send({ type: 'workspace.focus', file, line: start, flash: true });
                    }}
                />
            </div>
        </div>
    );
}
