import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Toast } from 'antd-mobile';
import ConnectionSetupView from './components/ConnectionSetupView';
import DesktopTerminalView from './components/DesktopTerminalView';
import MobileControllerView from './components/MobileControllerView';
import { useApprovalQueue } from './hooks/useApprovalQueue';
import { useOpenVibeWS } from './hooks/useOpenVibeWS';
import {
    buildMobileLink,
    clearConnectionProfile,
    readSavedConnectionProfile,
} from './utils/connectionConfig';
import {
    buildRuntimeDiagnostics,
    getActiveHostDescriptor,
    getActiveRuntimeDescriptor,
    getCapabilityState,
} from './utils/runtimeCapabilities';
import {
    buildRecoveryHints,
    buildSupportDebugBundle,
} from './utils/supportDiagnostics';
import { getActiveProject } from './utils/projectRegistry';
import {
    createRuntimeActionState,
    reconcileRuntimeActionWithCapabilities,
    reduceRuntimeActionWithEvent,
} from './utils/runtimeActionState';
import { resolveConnectionConfig } from './utils/connectionConfig';
import './App.css';

function App() {
    const savedConnection = readSavedConnectionProfile();
    const connectionConfig = resolveConnectionConfig({
        search: window.location.search,
        locationProtocol: window.location.protocol,
        locationHostname: window.location.hostname,
        userAgent: navigator.userAgent,
        savedConfig: savedConnection,
    });
    const URL_TOKEN = connectionConfig.token;
    const isMobileClient = connectionConfig.isMobileClient;
    const WS_URL = connectionConfig.wsUrl;
    const API_BASE_URL = connectionConfig.apiBaseUrl;
    const wantsConnectionSetup = connectionConfig.params.get('configure') === '1';
    const { status, messages, send, addMsg } = useOpenVibeWS(WS_URL);
    const { pendingApproval, enqueue, approve, reject } = useApprovalQueue();
    const messagesEndRef = useRef(null);

    const [inputVal, setInputVal] = useState('');
    const [thinking, setThinking] = useState(false);
    const [sessionInfo, setSessionInfo] = useState({
        room_token: URL_TOKEN,
        bridge_connected: false,
        host_connected: false,
        active_runtime: null,
        active_host_id: null,
        active_project_id: null,
        host_registry: [],
        project_registry: [],
        project_state: { active_files: [], all_files: [], available_commands: [], project_name: '' },
    });
    const [capabilityInfo, setCapabilityInfo] = useState({
        runtime_catalog: [],
        session_capabilities: [],
        active_runtime: null,
    });
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [runtimeActionState, setRuntimeActionState] = useState(null);
    const [history, setHistory] = useState(() => {
        const saved = localStorage.getItem('audit_history');
        return saved ? JSON.parse(saved) : [];
    });

    const activeRuntime = useMemo(
        () => getActiveRuntimeDescriptor(capabilityInfo, sessionInfo),
        [capabilityInfo, sessionInfo],
    );
    const activeHost = useMemo(
        () => getActiveHostDescriptor(capabilityInfo, sessionInfo),
        [capabilityInfo, sessionInfo],
    );
    const activeProject = useMemo(() => getActiveProject(sessionInfo), [sessionInfo]);
    const capabilityStates = useMemo(
        () => ({
            approve: getCapabilityState(activeRuntime, 'approve', { thinking, host: activeHost }),
            kill: getCapabilityState(activeRuntime, 'kill', { thinking, host: activeHost }),
            run_script: getCapabilityState(activeRuntime, 'run_script', { thinking, host: activeHost }),
            prompt: getCapabilityState(activeRuntime, 'prompt', { thinking, host: activeHost }),
        }),
        [activeHost, activeRuntime, thinking],
    );
    const diagnostics = useMemo(
        () => buildRuntimeDiagnostics(messages, sessionInfo, capabilityInfo),
        [messages, sessionInfo, capabilityInfo],
    );
    const connectionProfile = useMemo(
        () => ({
            token: URL_TOKEN,
            backendWsBaseUrl: connectionConfig.backendWsBaseUrl,
            apiBaseUrl: connectionConfig.apiBaseUrl,
            hasSavedConfig: connectionConfig.hasSavedConfig,
            pageUrl: window.location.href,
        }),
        [URL_TOKEN, connectionConfig.apiBaseUrl, connectionConfig.backendWsBaseUrl, connectionConfig.hasSavedConfig],
    );
    const recoveryHints = useMemo(
        () => buildRecoveryHints({
            status,
            sessionInfo,
            activeRuntime,
            diagnostics,
            capabilityInfo,
            connectionProfile,
        }),
        [status, sessionInfo, activeRuntime, diagnostics, capabilityInfo, connectionProfile],
    );
    const debugBundle = useMemo(
        () => buildSupportDebugBundle({
            status,
            sessionInfo,
            capabilityInfo,
            activeRuntime,
            diagnostics,
            connectionProfile,
        }),
        [status, sessionInfo, capabilityInfo, activeRuntime, diagnostics, connectionProfile],
    );

    const activeFiles = useMemo(() => {
        const fileMap = new Map();

        messages
            .filter((message) => message.type === 'diff' && message.file)
            .forEach((message) => {
                const existing = fileMap.get(message.file) || { name: message.file, modified: true, hunks: null };
                fileMap.set(message.file, {
                    ...existing,
                    ...message,
                    name: message.file,
                    modified: true,
                });
            });

        (sessionInfo.project_state?.active_files || []).forEach((fileName) => {
            if (!fileMap.has(fileName)) {
                fileMap.set(fileName, { name: fileName, modified: false, hunks: null });
            }
        });

        return Array.from(fileMap.values());
    }, [messages, sessionInfo.project_state]);

    useEffect(() => {
        localStorage.setItem('audit_history', JSON.stringify(history));
    }, [history]);

    useEffect(() => {
        setRuntimeActionState((current) =>
            reconcileRuntimeActionWithCapabilities(current, capabilityInfo, sessionInfo),
        );
    }, [capabilityInfo, sessionInfo]);

    useEffect(() => {
        if (!runtimeActionState || runtimeActionState.status === 'pending') {
            return undefined;
        }

        const timeoutMs = runtimeActionState.status === 'success' ? 4500 : 9000;
        const timer = setTimeout(() => {
            setRuntimeActionState((current) => (
                current?.updatedAt === runtimeActionState.updatedAt ? null : current
            ));
        }, timeoutMs);

        return () => clearTimeout(timer);
    }, [runtimeActionState]);

    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) {
            return;
        }

        if (lastMsg.type === 'approval.request') {
            enqueue({
                id: lastMsg.approval_id || lastMsg.id,
                tool_name: lastMsg.tool_name || 'approval',
                files: lastMsg.files || [],
                risk: lastMsg.risk || 'med',
                context: lastMsg.context,
                project_id: lastMsg.project_id || sessionInfo.active_project_id,
                host_id: lastMsg.host_id || sessionInfo.active_host_id,
            });
            return;
        }

        if (lastMsg.type === 'session.state') {
            setSessionInfo((prev) => ({
                ...prev,
                ...lastMsg,
                project_state: lastMsg.project_state || prev.project_state,
            }));
            return;
        }

        if (lastMsg.type === 'capabilities') {
            setCapabilityInfo((prev) => ({ ...prev, ...lastMsg }));
            return;
        }

        if (lastMsg.type === 'execution.event') {
            setRuntimeActionState((current) =>
                reduceRuntimeActionWithEvent(
                    current,
                    lastMsg,
                    capabilityInfo.runtime_catalog || [],
                ),
            );
            setThinking(lastMsg.phase === 'thinking');
            return;
        }

        if (lastMsg.type === 'status') {
            setThinking(lastMsg.state === 'thinking');
            return;
        }

        if (lastMsg.type === 'audit.event') {
            setHistory((prev) => [
                {
                    category: lastMsg.category,
                    message: lastMsg.message,
                    timestamp: lastMsg.timestamp || new Date().toISOString(),
                    action: lastMsg.action,
                    approval_id: lastMsg.approval_id,
                    decision: lastMsg.decision,
                    ok: lastMsg.ok,
                    project_id: lastMsg.project_id,
                    host_id: lastMsg.host_id,
                },
                ...prev,
            ]);
        }
    }, [
        capabilityInfo.runtime_catalog,
        enqueue,
        messages,
        sessionInfo.active_host_id,
        sessionInfo.active_project_id,
    ]);

    const handleSend = (text) => {
        if (!text.trim()) {
            return;
        }
        if (!capabilityStates.prompt.enabled) {
            Toast.show({ icon: 'fail', content: capabilityStates.prompt.reason });
            return;
        }

        addMsg({
            type: 'user',
            content: text,
            timestamp: new Date().toISOString(),
            local: true,
            project_id: activeProject?.project_id,
            host_id: activeProject?.host_id || sessionInfo.active_host_id,
        });
        void send({
            type: 'prompt.submit',
            prompt: text,
            project_id: activeProject?.project_id,
        });
        setInputVal('');
    };

    const handleApproval = (decision) => {
        if (!pendingApproval) {
            return;
        }
        if (!capabilityStates.approve.enabled) {
            Toast.show({ icon: 'fail', content: capabilityStates.approve.reason });
            return;
        }

        const normalizedDecision = decision === 'approved' ? 'approved' : 'rejected';
        const queueResult = normalizedDecision === 'approved' ? approve() : reject();
        setHistory((prev) => [
            {
                category: 'approval',
                message: `Approval ${normalizedDecision}`,
                timestamp: new Date().toISOString(),
                approval_id: pendingApproval.id,
                decision: normalizedDecision,
                project_id: pendingApproval.project_id || activeProject?.project_id,
                host_id: pendingApproval.host_id || activeProject?.host_id || sessionInfo.active_host_id,
            },
            ...prev,
        ]);

        void send({
            type: 'approval.response',
            approval_id: queueResult?.confirm_id || pendingApproval.id,
            decision: normalizedDecision,
            project_id: pendingApproval.project_id || activeProject?.project_id,
        });

        Toast.show({
            icon: normalizedDecision === 'approved' ? 'success' : 'fail',
            content: normalizedDecision === 'approved' ? '已批准' : '已拒绝',
        });
    };

    const handleRunCommand = (command) => {
        if (!capabilityStates.run_script.enabled) {
            Toast.show({ icon: 'fail', content: capabilityStates.run_script.reason });
            return;
        }
        void send({
            type: 'command.dispatch',
            action: 'run_script',
            command,
            project_id: activeProject?.project_id,
        });
    };

    const handleKill = () => {
        if (!capabilityStates.kill.enabled) {
            Toast.show({ icon: 'fail', content: capabilityStates.kill.reason });
            return;
        }
        void send({
            type: 'kill.request',
            project_id: activeProject?.project_id,
            target_runtime: capabilityInfo.active_runtime || sessionInfo.active_runtime,
            reason: 'mobile-kill-switch',
        });
        Toast.show({ icon: 'success', content: '已发送 Kill 请求' });
    };

    const handleRuntimeLaunch = (runtimeId) => {
        if (!runtimeId) {
            return;
        }
        const runtime = (capabilityInfo.runtime_catalog || []).find((item) => item.id === runtimeId) || { id: runtimeId };
        setRuntimeActionState(createRuntimeActionState('launch', runtime));
        void send({
            type: 'command.dispatch',
            action: 'runtime.launch',
            project_id: activeProject?.project_id,
            target_runtime: runtimeId,
        });
        Toast.show({ icon: 'success', content: `正在启动 ${runtime.label || runtimeId}` });
    };

    const handleRuntimeAttach = (runtimeId) => {
        if (!runtimeId) {
            return;
        }
        const runtime = (capabilityInfo.runtime_catalog || []).find((item) => item.id === runtimeId) || { id: runtimeId };
        setRuntimeActionState(createRuntimeActionState('attach', runtime));
        void send({
            type: 'command.dispatch',
            action: 'runtime.attach',
            project_id: activeProject?.project_id,
            target_runtime: runtimeId,
        });
        Toast.show({ icon: 'success', content: `正在切换到 ${runtime.label || runtimeId}` });
    };

    const handleProjectSelect = (projectId) => {
        if (!projectId) {
            return;
        }
        void send({ type: 'project.select', project_id: projectId });
        Toast.show({ icon: 'success', content: '正在切换项目' });
    };

    const handleOpenConnectionSetup = () => {
        const target = new URL(
            buildMobileLink({
                mobileBaseUrl: `${window.location.origin}${window.location.pathname}`,
                token: URL_TOKEN || savedConnection?.token || '',
                backendWsUrl: connectionConfig.backendWsBaseUrl,
                apiBaseUrl: connectionConfig.apiBaseUrl,
            }),
        );
        target.searchParams.set('configure', '1');
        window.location.assign(target.toString());
    };

    const handleClearSavedConnection = () => {
        clearConnectionProfile();
        const target = new URL(`${window.location.origin}${window.location.pathname}`);
        if (wantsConnectionSetup) {
            target.searchParams.set('configure', '1');
        }
        window.location.assign(target.toString());
    };

    const handleReconnect = () => {
        window.location.reload();
    };

    const handleResetConnection = () => {
        clearConnectionProfile();
        const target = new URL(`${window.location.origin}${window.location.pathname}`);
        target.searchParams.set('configure', '1');
        window.location.assign(target.toString());
    };

    if (!URL_TOKEN || wantsConnectionSetup) {
        const initialProfile = {
            token: URL_TOKEN || savedConnection?.token || '',
            backendWsUrl: connectionConfig.backendWsBaseUrl || savedConnection?.backendWsUrl || '',
            apiBaseUrl: connectionConfig.apiBaseUrl || savedConnection?.apiBaseUrl || '',
        };

        return (
            <ConnectionSetupView
                initialProfile={initialProfile}
                mode={wantsConnectionSetup ? 'reconnect' : 'setup'}
                onClearSaved={handleClearSavedConnection}
            />
        );
    }

    if (isMobileClient) {
        return (
            <div className="app mobile-app">
                <MobileControllerView
                    messages={messages}
                    messagesEndRef={messagesEndRef}
                    thinking={thinking}
                    pendingApproval={pendingApproval}
                    history={history}
                    inputVal={inputVal}
                    setInputVal={setInputVal}
                    handleSend={handleSend}
                    onApprove={() => handleApproval('approved')}
                    onReject={() => handleApproval('rejected')}
                    send={send}
                    status={status}
                    sessionInfo={sessionInfo}
                    capabilityInfo={capabilityInfo}
                    activeRuntime={activeRuntime}
                    activeProject={activeProject}
                    diagnostics={diagnostics}
                    capabilityStates={capabilityStates}
                    runtimeActionState={runtimeActionState}
                    recoveryHints={recoveryHints}
                    debugBundle={debugBundle}
                    onOpenConnectionSetup={handleOpenConnectionSetup}
                    onReconnect={handleReconnect}
                    onResetConnection={handleResetConnection}
                    handleRunCommand={handleRunCommand}
                    handleKill={handleKill}
                    handleRuntimeLaunch={handleRuntimeLaunch}
                    handleRuntimeAttach={handleRuntimeAttach}
                    handleProjectSelect={handleProjectSelect}
                    apiBaseUrl={API_BASE_URL}
                />
            </div>
        );
    }

    return (
        <div className="app desktop-app">
            <DesktopTerminalView
                messages={messages}
                messagesEndRef={messagesEndRef}
                thinking={thinking}
                activeFiles={activeFiles}
                currentFileIndex={currentFileIndex}
                setCurrentFileIndex={setCurrentFileIndex}
                send={send}
                setInputVal={setInputVal}
                sessionToken={URL_TOKEN}
                sessionInfo={sessionInfo}
                capabilityInfo={capabilityInfo}
                activeRuntime={activeRuntime}
                diagnostics={diagnostics}
                apiBaseUrl={API_BASE_URL}
                backendWsBaseUrl={connectionConfig.backendWsBaseUrl}
            />
        </div>
    );
}

export default App;
