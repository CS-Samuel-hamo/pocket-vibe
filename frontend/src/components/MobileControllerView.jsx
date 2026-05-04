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
        ? 'EXECUTION ACTIVE'
        : hostConnected
            ? 'HOST READY'
            : 'HOST OFFLINE';
    const projectLabel =
        activeProject?.project_name ||
        sessionInfo.project_state?.project_name ||
        'Project unavailable';
    const projectCountLabel = projectRegistry.length > 1
        ? `${projectRegistry.length} projects`
        : '1 project';
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
            title: status === 'connected' ? 'Desktop host needs attention.' : 'Connection needs recovery.',
            detail: visibleRecoveryHints[0] || diagnostics?.lastFailureReason,
            tone: 'danger',
        }
        : null;
    const approvalBanner = pendingApproval
        ? {
            title: `${pendingApproval.tool_name || 'Approval'} is waiting.`,
            detail: (pendingApproval.files || []).length > 0
                ? (pendingApproval.files || []).slice(0, 2).join(', ')
                : 'Review and decide from the phone.',
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
        const projectName = project?.project_name || 'project';

        if (projectId && projectId !== sessionInfo.active_project_id) {
            handleProjectSelect(projectId);
            Toast.show({ content: `Switching to ${projectName}` });
        } else {
            Toast.show({ content: `Opened ${projectName}` });
        }

        closeTools();
    };

    const handleProjectAddFolder = () => {
        if (!hostConnected) {
            Toast.show({ icon: 'fail', content: 'Desktop host is offline.' });
            return;
        }

        send({ type: 'command.dispatch', action: 'project.addFolder' });
        Toast.show({ content: 'Open the VS Code folder picker on desktop.' });
    };

    const handlePromptSkillDraft = (skill) => {
        setInputVal(skill.prompt);
        closeTools();
        Toast.show({ content: `${skill.label} drafted` });
    };

    const handlePromptSkillSend = (skill) => {
        if (!capabilityStates?.prompt?.enabled) {
            Toast.show({
                icon: 'fail',
                content: capabilityStates?.prompt?.reason || 'Prompt is unavailable.',
            });
            return;
        }

        handleSend(skill.prompt);
        closeTools();
        Toast.show({ icon: 'success', content: `${skill.label} sent` });
    };

    const handleCopyDebugBundle = async () => {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(debugBundle);
                Toast.show({ icon: 'success', content: 'Debug bundle copied' });
                return;
            }

            Toast.show({ icon: 'fail', content: 'Clipboard is unavailable in this browser.' });
        } catch (error) {
            Toast.show({
                icon: 'fail',
                content: error instanceof Error ? error.message : 'Could not copy debug bundle.',
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
                            Tools
                        </Button>
                        <Button
                            size="mini"
                            color="danger"
                            fill="outline"
                            disabled={capabilityStates?.kill ? !capabilityStates.kill.enabled : false}
                            onClick={handleKill}
                        >
                            Kill
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
                                    Reconnect
                                </Button>
                                <Button size="small" fill="outline" onClick={onOpenConnectionSetup}>
                                    Link
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
                                    Reject
                                </Button>
                                <Button
                                    size="small"
                                    fill="solid"
                                    color="primary"
                                    disabled={capabilityStates?.approve ? !capabilityStates.approve.enabled : false}
                                    onClick={onApprove}
                                >
                                    Approve
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
