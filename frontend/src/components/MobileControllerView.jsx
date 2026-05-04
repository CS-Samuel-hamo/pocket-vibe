import React, { useMemo, useState } from 'react';
import { Button, Toast } from 'antd-mobile';

import ConsolePanel from './ConsolePanel';
import MobileHomeSummary from './MobileHomeSummary';
import MobileToolsSheet from './MobileToolsSheet';
import OmniSearchDrawer from './OmniSearchDrawer';
import VoicePromptInput from './VoicePromptInput';
import { getRecentControlEvents } from '../utils/controlHome';
import { buildPromptSkillCards } from '../utils/promptSkills';
import { getRuntimeActionForRuntime } from '../utils/runtimeActionState';

export default function MobileControllerView({
    messages,
    thinking,
    messagesEndRef,
    pendingApproval,
    history,
    inputVal,
    setInputVal,
    handleSend,
    onApprove,
    onReject,
    send,
    status,
    sessionInfo,
    capabilityInfo,
    activeRuntime,
    activeProject,
    diagnostics,
    capabilityStates,
    runtimeActionState,
    recoveryHints,
    debugBundle,
    onOpenConnectionSetup,
    onReconnect,
    onResetConnection,
    handleRunCommand,
    handleKill,
    handleRuntimeLaunch,
    handleRuntimeAttach,
    handleProjectSelect,
    apiBaseUrl,
}) {
    const [omniVisible, setOmniVisible] = useState(false);
    const [toolsVisible, setToolsVisible] = useState(false);
    const [toolsView, setToolsView] = useState('menu');

    const runtimeLabel = activeRuntime?.label || 'Desktop Host';
    const runtimeCatalog = capabilityInfo.runtime_catalog || [];
    const projectRegistry = sessionInfo.project_registry || [];
    const hostConnected = sessionInfo.host_connected ?? sessionInfo.bridge_connected;
    const runtimeSummaryState = runtimeActionState?.runtimeId
        ? getRuntimeActionForRuntime(runtimeActionState, runtimeActionState.runtimeId)
        : null;
    const recentEvents = useMemo(() => getRecentControlEvents(messages, history, 6), [messages, history]);
    const visibleRecoveryHints = (recoveryHints || []).slice(0, 2);
    const promptSkills = useMemo(
        () => buildPromptSkillCards({ activeProject, activeRuntime, sessionInfo }),
        [activeProject, activeRuntime, sessionInfo],
    );

    const connectionTone = status === 'connected' && hostConnected ? 'healthy' : 'danger';
    const statusLabel = thinking
        ? '执行中'
        : hostConnected
            ? '桌面就绪'
            : '桌面离线';
    const projectLabel =
        activeProject?.project_name ||
        sessionInfo.project_state?.project_name ||
        'Project unavailable';
    const projectCountLabel = projectRegistry.length > 1
        ? `${projectRegistry.length} 个项目`
        : '1 个项目';
    const activeRuntimeState = activeRuntime?.health || 'offline';

    const runtimeBanner = runtimeSummaryState
        ? {
            title: runtimeSummaryState.headline,
            detail: runtimeSummaryState.detail,
            tone: runtimeSummaryState.status === 'error'
                ? 'danger'
                : runtimeSummaryState.status === 'blocked'
                    ? 'warning'
                    : 'healthy',
        }
        : null;
    const connectionBanner = status !== 'connected' || !hostConnected
        ? {
            title: status === 'connected' ? '桌面宿主需要处理' : '连接需要恢复',
            detail: visibleRecoveryHints[0] || diagnostics?.lastFailureReason,
            tone: 'danger',
        }
        : null;
    const approvalBanner = pendingApproval
        ? {
            title: `${pendingApproval.tool_name || '审批'} 正在等待处理`,
            detail: (pendingApproval.files || []).length > 0
                ? (pendingApproval.files || []).slice(0, 2).join(', ')
                : '请在手机上查看并决定。',
            risk: String(pendingApproval.risk || 'med').toUpperCase(),
        }
        : null;

    const closeTools = () => {
        setToolsVisible(false);
        setToolsView('menu');
    };

    const handleRuntimeLaunchClick = (runtimeId) => {
        handleRuntimeLaunch(runtimeId);
        closeTools();
    };

    const handleRuntimeAttachClick = (runtimeId) => {
        handleRuntimeAttach(runtimeId);
        closeTools();
    };

    const handleProjectSelectClick = (projectId) => {
        const project = projectRegistry.find((entry) => entry.project_id === projectId);
        const projectName = project?.project_name || '项目';

        if (projectId && projectId !== sessionInfo.active_project_id) {
            handleProjectSelect(projectId);
            Toast.show({ content: `正在切换到 ${projectName}` });
        } else {
            Toast.show({ content: `已打开 ${projectName}` });
        }

        closeTools();
    };

    const handleProjectAddFolder = () => {
        if (!hostConnected) {
            Toast.show({ icon: 'fail', content: '桌面宿主离线。' });
            return;
        }

        send({ type: 'command.dispatch', action: 'project.addFolder' });
        Toast.show({ content: '请在桌面端选择 VS Code 文件夹。' });
    };

    const handlePromptSkillDraft = (skill) => {
        setInputVal(skill.prompt);
        closeTools();
        Toast.show({ content: `已填入${skill.label}` });
    };

    const handlePromptSkillSend = (skill) => {
        if (!capabilityStates?.prompt?.enabled) {
            Toast.show({
                icon: 'fail',
                content: capabilityStates?.prompt?.reason || '当前无法发送指令。',
            });
            return;
        }

        handleSend(skill.prompt);
        closeTools();
        Toast.show({ icon: 'success', content: `已发送${skill.label}` });
    };

    const handleCopyDebugBundle = async () => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(debugBundle);
                Toast.show({ icon: 'success', content: '已复制调试信息' });
                return;
            }

            Toast.show({ icon: 'fail', content: '当前浏览器无法访问剪贴板。' });
        } catch (error) {
            Toast.show({
                icon: 'fail',
                content: error instanceof Error ? error.message : '无法复制调试信息。',
            });
        }
    };

    const openWorkspaceSearch = () => {
        closeTools();
        setOmniVisible(true);
    };

    const openToolsView = (view) => {
        if (view === 'files') {
            openWorkspaceSearch();
            return;
        }
        setToolsView(view);
        setToolsVisible(true);
    };

    const handleRunCommandClick = (command) => {
        handleRunCommand(command);
        closeTools();
    };

    return (
        <>
            <div className="mobile-view main-stage">
                <header className="header mobile-remote-header">
                    <div className="header-left">
                        <span className="header-title">Pocket Vibe</span>
                        <div className="remote-header-row">
                            <div className="driver-badge">{runtimeLabel}</div>
                            <div className={`mode-indicator ${thinking ? 'build' : 'plan'}`}>
                                {statusLabel}
                            </div>
                        </div>
                    </div>
                    <div className="header-actions compact-actions">
                        <Button size="mini" fill="outline" onClick={() => setToolsVisible(true)}>
                            工具
                        </Button>
                        <Button
                            size="mini"
                            color="danger"
                            fill="outline"
                            disabled={capabilityStates?.kill ? !capabilityStates.kill.enabled : false}
                            onClick={handleKill}
                        >
                            中断
                        </Button>
                        <div className={`status-dot ${status === 'connected' ? 'online' : 'offline'}`} />
                    </div>
                </header>

                <div className="mobile-content remote-chat-shell" style={{ opacity: status === 'connected' ? 1 : 0.72 }}>
                    <MobileHomeSummary
                        connectionTone={connectionTone}
                        hostConnected={hostConnected}
                        projectLabel={projectLabel}
                        runtimeLabel={runtimeLabel}
                        activeRuntimeState={activeRuntimeState}
                        pendingApproval={pendingApproval}
                        projectCountLabel={projectCountLabel}
                        onOpenSkills={() => openToolsView('skills')}
                        onOpenFiles={() => openToolsView('files')}
                        onOpenProjects={() => openToolsView('projects')}
                    />

                    {connectionBanner && (
                        <section className={`remote-banner ${connectionBanner.tone}`}>
                            <div className="remote-banner-copy">
                                <div className="remote-banner-title">{connectionBanner.title}</div>
                                <div className="remote-banner-detail">{connectionBanner.detail}</div>
                            </div>
                            <div className="remote-banner-actions">
                                <Button size="small" fill="solid" color="primary" onClick={onReconnect}>
                                    重连
                                </Button>
                                <Button size="small" fill="outline" onClick={onOpenConnectionSetup}>
                                    连接
                                </Button>
                            </div>
                        </section>
                    )}

                    {approvalBanner && (
                        <section className="remote-banner warning">
                            <div className="remote-banner-copy">
                                <div className="remote-banner-title">{approvalBanner.title}</div>
                                <div className="remote-banner-detail">{approvalBanner.detail}</div>
                            </div>
                            <div className="remote-approval-meta">{approvalBanner.risk}</div>
                            <div className="remote-banner-actions">
                                <Button
                                    size="small"
                                    fill="outline"
                                    color="danger"
                                    disabled={capabilityStates?.approve ? !capabilityStates.approve.enabled : false}
                                    onClick={onReject}
                                >
                                    拒绝
                                </Button>
                                <Button
                                    size="small"
                                    fill="solid"
                                    color="primary"
                                    disabled={capabilityStates?.approve ? !capabilityStates.approve.enabled : false}
                                    onClick={onApprove}
                                >
                                    同意
                                </Button>
                            </div>
                        </section>
                    )}

                    {runtimeBanner && (
                        <section className={`remote-banner ${runtimeBanner.tone}`}>
                            <div className="remote-banner-copy">
                                <div className="remote-banner-title">{runtimeBanner.title}</div>
                                <div className="remote-banner-detail">{runtimeBanner.detail}</div>
                            </div>
                        </section>
                    )}

                    <div className="remote-console-shell">
                        <ConsolePanel messages={messages} thinking={thinking} messagesEndRef={messagesEndRef} />
                    </div>
                </div>

                <footer className="footer remote-footer">
                    <VoicePromptInput
                        value={inputVal}
                        onChange={setInputVal}
                        onSend={handleSend}
                        disabled={!capabilityStates?.prompt?.enabled}
                        disabledReason={capabilityStates?.prompt?.reason}
                    />
                </footer>
            </div>

            <MobileToolsSheet
                visible={toolsVisible}
                toolsView={toolsView}
                setToolsView={setToolsView}
                closeTools={closeTools}
                openToolsView={openToolsView}
                promptSkills={promptSkills}
                capabilityStates={capabilityStates}
                onPromptSkillDraft={handlePromptSkillDraft}
                onPromptSkillSend={handlePromptSkillSend}
                sessionInfo={sessionInfo}
                capabilityInfo={capabilityInfo}
                runScriptState={capabilityStates?.run_script}
                onRunCommand={handleRunCommandClick}
                hostConnected={hostConnected}
                projectRegistry={projectRegistry}
                onProjectAddFolder={handleProjectAddFolder}
                onProjectSelect={handleProjectSelectClick}
                runtimeCatalog={runtimeCatalog}
                runtimeActionState={runtimeActionState}
                onRuntimeLaunch={handleRuntimeLaunchClick}
                onRuntimeAttach={handleRuntimeAttachClick}
                visibleRecoveryHints={visibleRecoveryHints}
                recentEvents={recentEvents}
                onReconnect={onReconnect}
                onOpenConnectionSetup={onOpenConnectionSetup}
                onResetConnection={onResetConnection}
                onCopyDebugBundle={handleCopyDebugBundle}
            />

            <OmniSearchDrawer
                visible={omniVisible}
                onClose={() => setOmniVisible(false)}
                allFiles={sessionInfo.project_state?.all_files || []}
                send={send}
                apiUrl={apiBaseUrl}
                projectId={activeProject?.project_id || sessionInfo.active_project_id}
                onAddContext={(file) => {
                    setInputVal((currentValue) => {
                        const trimmedValue = String(currentValue || '').trimEnd();
                        return trimmedValue ? `${trimmedValue} @${file} ` : `@${file} `;
                    });
                }}
            />
        </>
    );
}
