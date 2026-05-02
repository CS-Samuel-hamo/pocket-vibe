import React, { useMemo, useState } from 'react';
import { Button, Popup, Toast } from 'antd-mobile';
import {
    AlertTriangle,
    Bug,
    Cable,
    FolderSearch,
    FolderTree,
    Layers,
    Link2,
    PencilLine,
    RefreshCw,
    Rocket,
    Sparkles,
    Terminal,
    X,
} from 'lucide-react';

import CommandPanel from './CommandPanel';
import ConsolePanel from './ConsolePanel';
import OmniSearchDrawer from './OmniSearchDrawer';
import VoicePromptInput from './VoicePromptInput';
import { getRecentControlEvents } from '../utils/controlHome';
import { buildProjectInboxEntries, getProjectSwitchState } from '../utils/projectRegistry';
import { buildPromptSkillCards } from '../utils/promptSkills';
import { getRuntimeLifecycleState } from '../utils/runtimeCapabilities';
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
    const projectInboxEntries = useMemo(
        () => buildProjectInboxEntries({
            sessionInfo,
            messages,
            history,
            pendingApproval,
            limit: 4,
        }),
        [sessionInfo, messages, history, pendingApproval],
    );
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
    const activeProjectPreview = projectInboxEntries.find((entry) => entry.isActive) || projectInboxEntries[0];

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
                            <Button size="small" fill="solid" color="primary" onClick={() => openToolsView('skills')}>
                                Vibe
                            </Button>
                            <Button size="small" fill="outline" onClick={() => openToolsView('files')}>
                                Files
                            </Button>
                            <Button size="small" fill="outline" onClick={() => openToolsView('projects')}>
                                {projectCountLabel}
                            </Button>
                        </div>
                    </section>

                    {projectInboxEntries.length > 1 && (
                        <section className="project-inbox-strip">
                            <div className="project-inbox-header">
                                <div>
                                    <div className="project-inbox-title">Projects</div>
                                    <div className="project-inbox-copy">
                                        Current: {activeProjectPreview?.project_name || projectLabel}
                                    </div>
                                </div>
                                <Button size="mini" fill="outline" onClick={() => openToolsView('projects')}>
                                    All
                                </Button>
                            </div>

                            <div className="project-inbox-list">
                                {projectInboxEntries.map((entry) => (
                                    <button
                                        key={entry.project_id}
                                        type="button"
                                        className={`project-inbox-card ${entry.tone} ${entry.isActive ? 'active' : ''}`}
                                        onClick={() => handleProjectSelectClick(entry.project_id)}
                                    >
                                        <div className="project-inbox-card-row">
                                            <span className="project-inbox-card-title">{entry.project_name}</span>
                                            <span className={`project-inbox-card-chip ${entry.isActive ? 'active' : entry.tone}`}>
                                                {entry.actionLabel}
                                            </span>
                                        </div>
                                        <div className="project-inbox-card-meta">
                                            {entry.hostLabel} - {entry.runtimeLabel} - {entry.health}
                                        </div>
                                        {entry.isActive ? (
                                            <>
                                                <div className="project-inbox-card-preview-label">{entry.previewLabel}</div>
                                                <div className="project-inbox-card-preview">{entry.previewText}</div>
                                            </>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

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

            <Popup
                visible={toolsVisible}
                onMaskClick={closeTools}
                bodyStyle={{
                    height: '78vh',
                    backgroundColor: 'var(--bg-deep)',
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                }}
            >
                <div className="tools-sheet">
                    <div className="tools-sheet-header">
                        <div className="tools-sheet-heading">
                            <div className="tools-sheet-kicker">Actions</div>
                            <div className="tools-sheet-title">
                                {toolsView === 'menu'
                                    ? 'Tools'
                                    : toolsView === 'skills'
                                        ? 'Vibe skills'
                                    : toolsView === 'scripts'
                                        ? 'Project scripts'
                                        : toolsView === 'projects'
                                            ? 'Project switcher'
                                        : toolsView === 'runtime'
                                            ? 'Runtime manager'
                                            : 'Support'}
                            </div>
                        </div>
                        <div className="tools-sheet-header-actions">
                            {toolsView !== 'menu' && (
                                <Button size="mini" fill="outline" onClick={() => setToolsView('menu')}>
                                    Back
                                </Button>
                            )}
                            <Button size="mini" fill="outline" onClick={closeTools}>
                                <X size={16} />
                            </Button>
                        </div>
                    </div>

                    <div className="tools-sheet-body">
                        {toolsView === 'menu' && (
                            <div className="tools-menu-layout">
                                <div className="tools-menu-section">
                                    <div className="tools-menu-section-title">Main Actions</div>
                                    <div className="tools-menu-copy">
                                        The actions you should need most from the phone.
                                    </div>
                                    <div className="tools-primary-actions">
                                        <Button block fill="solid" color="primary" onClick={() => openToolsView('skills')}>
                                            <Sparkles size={16} /> Vibe Skills
                                        </Button>
                                        <Button block fill="outline" onClick={() => openToolsView('files')}>
                                            <FolderSearch size={16} /> Search Files
                                        </Button>
                                        <Button block fill="outline" onClick={() => openToolsView('projects')}>
                                            <FolderTree size={16} /> Projects
                                        </Button>
                                    </div>
                                </div>

                                <div className="tools-menu-section subdued">
                                    <div className="tools-menu-section-title">Advanced</div>
                                    <div className="tools-secondary-actions">
                                        <Button block fill="outline" onClick={() => openToolsView('scripts')}>
                                            <Terminal size={16} /> Run Script
                                        </Button>
                                        <Button block fill="outline" onClick={() => openToolsView('runtime')}>
                                            <Layers size={16} /> Switch Runtime
                                        </Button>
                                        <Button block fill="outline" onClick={() => openToolsView('support')}>
                                            <Bug size={16} /> Connection & Debug
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {toolsView === 'skills' && (
                            <div className="skill-deck">
                                <div className="tools-menu-copy skill-deck-copy">
                                    Reusable prompt skills inspired by MCP prompts, Cline approvals, Aider diffs, and coding-agent task briefs.
                                </div>
                                {promptSkills.map((skill) => (
                                    <section key={skill.id} className="skill-card">
                                        <div className="skill-card-main">
                                            <div className="skill-card-row">
                                                <span className="skill-card-title">{skill.label}</span>
                                                <span className="skill-card-chip">{skill.category}</span>
                                            </div>
                                            <div className="skill-card-summary">{skill.summary}</div>
                                        </div>
                                        <div className="skill-card-actions">
                                            <Button size="mini" fill="outline" onClick={() => handlePromptSkillDraft(skill)}>
                                                <PencilLine size={14} /> Draft
                                            </Button>
                                            <Button
                                                size="mini"
                                                color="primary"
                                                fill="solid"
                                                disabled={!capabilityStates?.prompt?.enabled}
                                                onClick={() => handlePromptSkillSend(skill)}
                                            >
                                                Send
                                            </Button>
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}

                        {toolsView === 'scripts' && (
                            <CommandPanel
                                commands={sessionInfo.project_state?.available_commands || []}
                                onCommandClick={(command) => {
                                    handleRunCommand(command);
                                    closeTools();
                                }}
                                runtimeCatalog={capabilityInfo.runtime_catalog || []}
                                activeRuntime={capabilityInfo.active_runtime || sessionInfo.active_runtime}
                                runScriptState={capabilityStates?.run_script}
                            />
                        )}

                        {toolsView === 'projects' && (
                            <div className="runtime-deck tools-runtime-deck">
                                {projectRegistry.length > 0 ? (
                                    projectRegistry.map((project) => {
                                        const switchState = getProjectSwitchState(
                                            project,
                                            sessionInfo.active_project_id,
                                        );

                                        return (
                                            <div
                                                key={project.project_id}
                                                className={`runtime-card ${switchState.isActive ? 'active' : ''} ${project.runtime_health || 'offline'}`}
                                            >
                                                <div className="runtime-card-main">
                                                    <div className="runtime-card-title-row">
                                                        <span className="runtime-card-title">{project.project_name}</span>
                                                        <span className={`runtime-state-chip ${switchState.isActive ? 'active' : 'attached'}`}>
                                                            {project.bridge_label || 'Desktop Host'}
                                                        </span>
                                                    </div>
                                                    <div className="runtime-card-meta">
                                                        {project.runtime_label || project.active_runtime || 'Desktop Host'}
                                                        {' - '}
                                                        {project.runtime_health || 'offline'}
                                                    </div>
                                                    <div className="runtime-card-detail">
                                                        {project.workspace_path || switchState.detail}
                                                    </div>
                                                </div>
                                                <div className="runtime-card-actions">
                                                    <Button
                                                        size="mini"
                                                        fill={switchState.isActive ? 'solid' : 'outline'}
                                                        color={switchState.isActive ? 'primary' : 'default'}
                                                        onClick={() => handleProjectSelectClick(project.project_id)}
                                                    >
                                                        {switchState.actionLabel}
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="tools-empty">No connected desktop projects are available yet.</div>
                                )}
                            </div>
                        )}

                        {toolsView === 'runtime' && (
                            <div className="runtime-deck tools-runtime-deck">
                                {runtimeCatalog.map((runtime) => {
                                    const lifecycle = getRuntimeLifecycleState(
                                        runtime,
                                        capabilityInfo.active_runtime || sessionInfo.active_runtime,
                                    );
                                    const runtimeAction = getRuntimeActionForRuntime(runtimeActionState, runtime.id);
                                    const displayState = runtimeAction?.isPending ? runtimeAction.stateLabel : lifecycle.state;
                                    const displayLabel = runtimeAction?.isPending ? runtimeAction.stateLabel : lifecycle.label;
                                    const disableLaunch = runtimeAction?.isPending || !lifecycle.canLaunch;
                                    const disableAttach = runtimeAction?.isPending || !lifecycle.canAttach;
                                    const detail = runtimeAction?.detail || lifecycle.reason;

                                    return (
                                        <div
                                            key={runtime.id}
                                            className={`runtime-card ${lifecycle.isActive ? 'active' : ''} ${displayState}`}
                                        >
                                            <div className="runtime-card-main">
                                                <div className="runtime-card-title-row">
                                                    <span className="runtime-card-title">{runtime.label}</span>
                                                    <span className={`runtime-state-chip ${displayState}`}>{displayLabel}</span>
                                                </div>
                                                <div className="runtime-card-meta">
                                                    {runtime.dispatch_mode}
                                                    {runtime.source === 'extension' ? ' fallback' : ''}
                                                </div>
                                                <div className="runtime-card-detail">{detail}</div>
                                            </div>
                                            <div className="runtime-card-actions">
                                                <Button
                                                    size="mini"
                                                    fill="outline"
                                                    disabled={disableAttach}
                                                    onClick={() => handleRuntimeAttachClick(runtime.id)}
                                                >
                                                    {runtimeAction?.attachLabel || 'Use'}
                                                </Button>
                                                <Button
                                                    size="mini"
                                                    color="primary"
                                                    fill="solid"
                                                    disabled={disableLaunch}
                                                    onClick={() => handleRuntimeLaunchClick(runtime.id)}
                                                >
                                                    {runtimeAction?.launchLabel || 'Launch'}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {toolsView === 'support' && (
                            <div className="tools-support-stack">
                                <section className="tools-support-card">
                                    <div className="tools-support-title">Recovery</div>
                                    <div className="tools-support-actions">
                                        <Button fill="outline" onClick={onReconnect}>
                                            <RefreshCw size={15} /> Reconnect
                                        </Button>
                                        <Button fill="outline" onClick={onOpenConnectionSetup}>
                                            <Link2 size={15} /> Link
                                        </Button>
                                        <Button fill="outline" onClick={onResetConnection}>
                                            <Rocket size={15} /> Reset
                                        </Button>
                                        <Button fill="outline" onClick={handleCopyDebugBundle}>
                                            <Cable size={15} /> Copy Debug
                                        </Button>
                                    </div>
                                </section>

                                {visibleRecoveryHints.length > 0 && (
                                    <section className="tools-support-card">
                                        <div className="tools-support-title">Hints</div>
                                        <div className="tools-support-list">
                                            {visibleRecoveryHints.map((hint) => (
                                                <div key={hint} className="tools-support-line">
                                                    <AlertTriangle size={14} />
                                                    <span>{hint}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                <section className="tools-support-card">
                                    <div className="tools-support-title">Recent events</div>
                                    {recentEvents.length > 0 ? (
                                        <div className="tools-support-list">
                                            {recentEvents.map((event) => (
                                                <div key={event.key} className="support-event">
                                                    <div className="support-event-title">{event.title}</div>
                                                    <div className="support-event-detail">{event.detail}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="tools-empty">No recent critical events.</div>
                                    )}
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            </Popup>

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
