import React from 'react';
import { Button } from 'antd-mobile';

function runtimeStateLabel(state) {
    if (state === 'ready') return '运行时就绪';
    if (state === 'degraded') return '降级可用';
    if (state === 'offline') return '运行时离线';
    return state || '运行时未知';
}

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
    projectInboxEntries = [],
    onProjectSelect,
}) {
    return (
        <section className={`remote-home-card ${connectionTone}`}>
            <div className="remote-home-card-main">
                <div className="remote-home-eyebrow">
                    {hostConnected ? '桌面已连接' : '桌面离线'}
                </div>
                <div className="remote-home-title">{projectLabel}</div>
                <div className="remote-home-meta">
                    <span>{runtimeLabel}</span>
                    <span>{runtimeStateLabel(activeRuntimeState)}</span>
                    <span>{pendingApproval ? '等待审批' : '无需审批'}</span>
                </div>
            </div>
            <div className="remote-home-actions">
                <Button size="small" fill="solid" color="primary" onClick={onOpenSkills}>
                    技能
                </Button>
                <Button size="small" fill="outline" onClick={onOpenFiles}>
                    文件
                </Button>
                <Button size="small" fill="outline" onClick={onOpenProjects}>
                    {projectCountLabel}
                </Button>
            </div>
            {projectInboxEntries.length > 0 && (
                <div className="remote-project-inbox">
                    <div className="remote-project-inbox-header">
                        <span>Project Inbox</span>
                        <Button size="mini" fill="none" onClick={onOpenProjects}>All</Button>
                    </div>
                    <div className="remote-project-inbox-list">
                        {projectInboxEntries.map((entry) => (
                            <Button
                                key={entry.project_id}
                                fill="none"
                                className={`remote-project-inbox-card ${entry.tone} ${entry.isActive ? 'active' : ''}`}
                                onClick={() => onProjectSelect?.(entry.project_id)}
                            >
                                <div className="remote-project-inbox-title-row">
                                    <strong>{entry.project_name}</strong>
                                    <span>{entry.isActive ? 'Current' : entry.actionLabel}</span>
                                </div>
                                <div className="remote-project-inbox-meta">
                                    {entry.hostLabel} · {entry.runtimeLabel} · {entry.health}
                                </div>
                                <div className="remote-project-inbox-preview-label">{entry.previewLabel}</div>
                                <div className="remote-project-inbox-preview">{entry.previewText}</div>
                            </Button>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}
