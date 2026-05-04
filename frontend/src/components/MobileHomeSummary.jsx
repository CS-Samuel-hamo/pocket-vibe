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
        </section>
    );
}
