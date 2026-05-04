import React from 'react';
import { Button } from 'antd-mobile';

export default function MobileHomeSummary({
    connectionTone,
    hostConnected,
    projectLabel,
    runtimeLabel,
    activeRuntimeState,
    pendingApproval,
    projectCountLabel,
    onOpenSkills,
    onOpenFiles,
    onOpenProjects,
}) {
    return (
        <section className={`remote-home-card ${connectionTone}`}>
            <div className="remote-home-card-main">
                <div className="remote-home-eyebrow">
                    {hostConnected ? 'Host connected' : 'Host offline'}
                </div>
                <div className="remote-home-title">{projectLabel}</div>
                <div className="remote-home-meta">
                    <span>{runtimeLabel}</span>
                    <span>{activeRuntimeState}</span>
                    <span>{pendingApproval ? 'approval pending' : 'approval clear'}</span>
                </div>
            </div>
            <div className="remote-home-actions">
                <Button size="small" fill="solid" color="primary" onClick={onOpenSkills}>
                    Vibe
                </Button>
                <Button size="small" fill="outline" onClick={onOpenFiles}>
                    Files
                </Button>
                <Button size="small" fill="outline" onClick={onOpenProjects}>
                    {projectCountLabel}
                </Button>
            </div>
        </section>
    );
}
