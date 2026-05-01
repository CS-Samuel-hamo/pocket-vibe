import React, { useEffect, useMemo, useState } from 'react';
import { Button, Switch } from 'antd-mobile';
import { Activity, PauseCircle } from 'lucide-react';

const VibeWalkingMode = ({ messages = [] }) => {
    const [isActive, setIsActive] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const consoleLogs = useMemo(
        () =>
            messages
                .filter((message) => message.type === 'log' || message.type === 'execution.event')
                .map((message) => message.content || message.message)
                .filter(Boolean),
        [messages],
    );

    useEffect(() => {
        if (!isActive || consoleLogs.length === 0 || !window.speechSynthesis) {
            return;
        }

        const utterance = new SpeechSynthesisUtterance(consoleLogs[consoleLogs.length - 1]);
        utterance.rate = 1.0;
        utterance.onend = () => setIsSpeaking(false);
        setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    }, [consoleLogs, isActive]);

    return (
        <div className="apple-vibe-card">
            <div className="vibe-card-header">
                <div className="vibe-icon-bg">
                    <Activity size={20} color="#30D158" />
                </div>
                <div className="vibe-info">
                    <div className="vibe-title">Walking Mode</div>
                    <div className="vibe-subtitle">Voice summaries for live execution output</div>
                </div>
                <Switch
                    checked={isActive}
                    onChange={(checked) => {
                        setIsActive(checked);
                        if (!checked && window.speechSynthesis) {
                            window.speechSynthesis.cancel();
                            setIsSpeaking(false);
                        }
                    }}
                    style={{ '--checked-color': 'var(--accent-green)' }}
                />
            </div>

            <div className="vibe-card-content">
                <p className="vibe-description">
                    {isActive
                        ? isSpeaking
                            ? 'Reading the latest execution update.'
                            : 'Listening for fresh console events.'
                        : 'Enable to hear execution updates while away from the desk.'}
                </p>
                {isSpeaking && (
                    <Button size="mini" pill className="vibe-action-btn" onClick={() => window.speechSynthesis.cancel()}>
                        <PauseCircle size={14} style={{ marginRight: 4 }} /> Pause
                    </Button>
                )}
            </div>
        </div>
    );
};

export default VibeWalkingMode;
