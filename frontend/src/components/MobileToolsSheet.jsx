import React from 'react';
import { Button, Popup } from 'antd-mobile';
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
import { getProjectSwitchState } from '../utils/projectRegistry';
import { getRuntimeLifecycleState } from '../utils/runtimeCapabilities';
import { getRuntimeActionForRuntime } from '../utils/runtimeActionState';

function toolsTitle(view) {
    if (view === 'menu') return 'Tools';
    if (view === 'skills') return 'Vibe skills';
    if (view === 'scripts') return 'Project scripts';
    if (view === 'projects') return 'Project switcher';
    if (view === 'runtime') return 'Runtime manager';
    return 'Support';
}

function ToolsMenu({ openToolsView }) {
    return (
        <div className="tools-menu-layout">
            <div className="tools-menu-section">
                <div className="tools-menu-section-title">Main Actions</div>
                <div className="tools-menu-copy">The actions you should need most from the phone.</div>
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
    );
}

function SkillsDeck({ promptSkills, capabilityStates, onDraft, onSend }) {
    return (
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
                        <Button size="mini" fill="outline" onClick={() => onDraft(skill)}>
                            <PencilLine size={14} /> Draft
                        </Button>
                        <Button
                            size="mini"
                            color="primary"
                            fill="solid"
                            disabled={!capabilityStates?.prompt?.enabled}
                            onClick={() => onSend(skill)}
                        >
                            Send
                        </Button>
                    </div>
                </section>
            ))}
        </div>
    );
}

function ProjectDeck({
    hostConnected,
    projectRegistry,
    activeProjectId,
    onProjectAddFolder,
    onProjectSelect,
}) {
    return (
        <div className="runtime-deck tools-runtime-deck">
            <section className="project-picker-action">
                <div>
                    <div className="project-picker-title">Add a project folder</div>
                    <div className="project-picker-copy">
                        Opens a VS Code folder picker on desktop. If nothing opens, reload VS Code.
                    </div>
                </div>
                <Button size="mini" fill="outline" disabled={!hostConnected} onClick={onProjectAddFolder}>
                    Open Picker
                </Button>
            </section>
            {projectRegistry.length > 0 ? (
                projectRegistry.map((project) => {
                    const switchState = getProjectSwitchState(project, activeProjectId);
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
                                    onClick={() => onProjectSelect(project.project_id)}
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
    );
}

function RuntimeDeck({ runtimeCatalog, activeRuntimeId, runtimeActionState, onLaunch, onAttach }) {
    return (
        <div className="runtime-deck tools-runtime-deck">
            {runtimeCatalog.map((runtime) => {
                const lifecycle = getRuntimeLifecycleState(runtime, activeRuntimeId);
                const runtimeAction = getRuntimeActionForRuntime(runtimeActionState, runtime.id);
                const displayState = runtimeAction?.isPending ? runtimeAction.stateLabel : lifecycle.state;
                const displayLabel = runtimeAction?.isPending ? runtimeAction.stateLabel : lifecycle.label;
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
                                disabled={runtimeAction?.isPending || !lifecycle.canAttach}
                                onClick={() => onAttach(runtime.id)}
                            >
                                {runtimeAction?.attachLabel || 'Use'}
                            </Button>
                            <Button
                                size="mini"
                                color="primary"
                                fill="solid"
                                disabled={runtimeAction?.isPending || !lifecycle.canLaunch}
                                onClick={() => onLaunch(runtime.id)}
                            >
                                {runtimeAction?.launchLabel || 'Launch'}
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function SupportDeck({
    visibleRecoveryHints,
    recentEvents,
    onReconnect,
    onOpenConnectionSetup,
    onResetConnection,
    onCopyDebugBundle,
}) {
    return (
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
                    <Button fill="outline" onClick={onCopyDebugBundle}>
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
    );
}

export default function MobileToolsSheet({
    visible,
    toolsView,
    setToolsView,
    closeTools,
    openToolsView,
    promptSkills,
    capabilityStates,
    onPromptSkillDraft,
    onPromptSkillSend,
    sessionInfo,
    capabilityInfo,
    runScriptState,
    onRunCommand,
    hostConnected,
    projectRegistry,
    onProjectAddFolder,
    onProjectSelect,
    runtimeCatalog,
    runtimeActionState,
    onRuntimeLaunch,
    onRuntimeAttach,
    visibleRecoveryHints,
    recentEvents,
    onReconnect,
    onOpenConnectionSetup,
    onResetConnection,
    onCopyDebugBundle,
}) {
    return (
        <Popup
            visible={visible}
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
                        <div className="tools-sheet-title">{toolsTitle(toolsView)}</div>
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
                    {toolsView === 'menu' && <ToolsMenu openToolsView={openToolsView} />}
                    {toolsView === 'skills' && (
                        <SkillsDeck
                            promptSkills={promptSkills}
                            capabilityStates={capabilityStates}
                            onDraft={onPromptSkillDraft}
                            onSend={onPromptSkillSend}
                        />
                    )}
                    {toolsView === 'scripts' && (
                        <CommandPanel
                            commands={sessionInfo.project_state?.available_commands || []}
                            onCommandClick={onRunCommand}
                            runtimeCatalog={capabilityInfo.runtime_catalog || []}
                            activeRuntime={capabilityInfo.active_runtime || sessionInfo.active_runtime}
                            runScriptState={runScriptState}
                        />
                    )}
                    {toolsView === 'projects' && (
                        <ProjectDeck
                            hostConnected={hostConnected}
                            projectRegistry={projectRegistry}
                            activeProjectId={sessionInfo.active_project_id}
                            onProjectAddFolder={onProjectAddFolder}
                            onProjectSelect={onProjectSelect}
                        />
                    )}
                    {toolsView === 'runtime' && (
                        <RuntimeDeck
                            runtimeCatalog={runtimeCatalog}
                            activeRuntimeId={capabilityInfo.active_runtime || sessionInfo.active_runtime}
                            runtimeActionState={runtimeActionState}
                            onLaunch={onRuntimeLaunch}
                            onAttach={onRuntimeAttach}
                        />
                    )}
                    {toolsView === 'support' && (
                        <SupportDeck
                            visibleRecoveryHints={visibleRecoveryHints}
                            recentEvents={recentEvents}
                            onReconnect={onReconnect}
                            onOpenConnectionSetup={onOpenConnectionSetup}
                            onResetConnection={onResetConnection}
                            onCopyDebugBundle={onCopyDebugBundle}
                        />
                    )}
                </div>
            </div>
        </Popup>
    );
}
