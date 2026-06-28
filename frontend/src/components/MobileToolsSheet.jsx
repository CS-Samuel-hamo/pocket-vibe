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
    if (view === 'menu') return '工具';
    if (view === 'skills') return 'Vibe 技能';
    if (view === 'scripts') return '项目脚本';
    if (view === 'projects') return '项目切换';
    if (view === 'runtime') return '运行时管理';
    return '连接与调试';
}

function ToolsMenu({ openToolsView }) {
    return (
        <div className="tools-menu-layout">
            <div className="tools-menu-section">
                <div className="tools-menu-section-title">常用操作</div>
                <div className="tools-menu-copy">手机端最常用的控制入口。</div>
                <div className="tools-primary-actions">
                    <Button block fill="solid" color="primary" onClick={() => openToolsView('skills')}>
                        <Sparkles size={16} /> Vibe 技能
                    </Button>
                    <Button block fill="outline" onClick={() => openToolsView('files')}>
                        <FolderSearch size={16} /> 搜索文件
                    </Button>
                    <Button block fill="outline" onClick={() => openToolsView('projects')}>
                        <FolderTree size={16} /> 项目
                    </Button>
                </div>
            </div>

            <div className="tools-menu-section subdued">
                <div className="tools-menu-section-title">高级</div>
                <div className="tools-secondary-actions">
                    <Button block fill="outline" onClick={() => openToolsView('scripts')}>
                        <Terminal size={16} /> 执行脚本
                    </Button>
                    <Button block fill="outline" onClick={() => openToolsView('runtime')}>
                        <Layers size={16} /> 切换运行时
                    </Button>
                    <Button block fill="outline" onClick={() => openToolsView('support')}>
                        <Bug size={16} /> 连接与调试
                    </Button>
                </div>
            </div>
        </div>
    );
}

function SkillsDeck({ promptSkills, capabilityStates, onDraft, onSend }) {
    const promptReady = capabilityStates?.prompt?.enabled;

    return (
        <div className="skill-deck">
            <div className="tools-menu-copy skill-deck-copy">
                可复用的任务提示词，用于快速发起项目简报、验收、排障和变更总结。
            </div>
            {promptSkills.map((skill) => (
                <section key={skill.id} className="skill-card">
                    <div className="skill-card-main">
                        <div className="skill-card-row">
                            <span className="skill-card-title">{skill.label}</span>
                            <span className={`skill-card-chip risk-${skill.riskLevel || 'low'}`}>
                                {skill.intent || skill.category}
                            </span>
                        </div>
                        <div className="skill-card-summary">{skill.summary}</div>
                        <div className="skill-card-metadata">
                            <div>
                                <span>Outcome</span>
                                <strong>{skill.outcome}</strong>
                            </div>
                            <div>
                                <span>Next</span>
                                <strong>{skill.nextStep}</strong>
                            </div>
                        </div>
                    </div>
                    <div className="skill-card-actions">
                        <Button size="mini" fill="outline" onClick={() => onDraft(skill)}>
                            <PencilLine size={14} /> 填入
                        </Button>
                        <Button
                            size="mini"
                            color="primary"
                            fill="solid"
                            disabled={!promptReady || skill.directSend === false}
                            onClick={() => onSend(skill)}
                        >
                            发送
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
                    <div className="project-picker-title">添加项目文件夹</div>
                    <div className="project-picker-copy">
                        会在桌面端打开 VS Code 文件夹选择器；如果没有弹窗，请重载 VS Code。
                    </div>
                </div>
                <Button size="mini" fill="outline" disabled={!hostConnected} onClick={onProjectAddFolder}>
                    打开选择器
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
                                    {switchState.isActive ? '当前' : '打开'}
                                </Button>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="tools-empty">还没有可用的桌面项目。</div>
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
                const displayLabel = runtimeAction?.isPending ? runtimeAction.statusLabel : lifecycle.label;
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
                                {runtime.source === 'extension' ? ' 降级模式' : ''}
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
                                {runtimeAction?.attachLabel || '使用'}
                            </Button>
                            <Button
                                size="mini"
                                color="primary"
                                fill="solid"
                                disabled={runtimeAction?.isPending || !lifecycle.canLaunch}
                                onClick={() => onLaunch(runtime.id)}
                            >
                                {runtimeAction?.launchLabel || '启动'}
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
                <div className="tools-support-title">恢复连接</div>
                <div className="tools-support-actions">
                    <Button fill="outline" onClick={onReconnect}>
                        <RefreshCw size={15} /> 重连
                    </Button>
                    <Button fill="outline" onClick={onOpenConnectionSetup}>
                        <Link2 size={15} /> 连接
                    </Button>
                    <Button fill="outline" onClick={onResetConnection}>
                        <Rocket size={15} /> 重置
                    </Button>
                    <Button fill="outline" onClick={onCopyDebugBundle}>
                        <Cable size={15} /> 复制调试信息
                    </Button>
                </div>
            </section>

            {visibleRecoveryHints.length > 0 && (
                <section className="tools-support-card">
                    <div className="tools-support-title">提示</div>
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
                <div className="tools-support-title">最近关键事件</div>
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
                    <div className="tools-empty">暂无关键事件。</div>
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
                        <div className="tools-sheet-kicker">操作</div>
                        <div className="tools-sheet-title">{toolsTitle(toolsView)}</div>
                    </div>
                    <div className="tools-sheet-header-actions">
                        {toolsView !== 'menu' && (
                            <Button size="mini" fill="outline" onClick={() => setToolsView('menu')}>
                                返回
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
