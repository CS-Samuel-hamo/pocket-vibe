import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getActiveHostDescriptor,
    buildRuntimeDiagnostics,
    getActiveRuntimeDescriptor,
    getCapabilityState,
    getRuntimeLifecycleState,
} from '../src/utils/runtimeCapabilities.js';

const readyRuntime = {
    id: 'codex-cli',
    label: 'Codex CLI',
    supports: ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'],
    dispatch_mode: 'raw_prompt',
    approval_mode: 'terminal_yes_no',
    interrupt_mode: 'ctrl_c',
    health: 'ready',
    source: 'terminal',
    attached: true,
    launchable: true,
    status_detail: 'Codex CLI is attached to this workspace.',
};

const degradedRuntime = {
    id: 'continue-ext',
    label: 'Continue',
    supports: ['prompt', 'focus', 'read_context'],
    dispatch_mode: 'clipboard_fallback',
    approval_mode: 'unsupported',
    interrupt_mode: 'unsupported',
    health: 'degraded',
    source: 'extension',
    attached: true,
    launchable: false,
    status_detail: 'Continue is attached via clipboard fallback.',
};

const launchableTerminal = {
    id: 'claude-code',
    label: 'Claude Code',
    supports: ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'],
    dispatch_mode: 'raw_prompt',
    approval_mode: 'terminal_yes_no',
    interrupt_mode: 'ctrl_c',
    health: 'degraded',
    source: 'terminal',
    attached: false,
    launchable: true,
    status_detail: 'Claude Code is available to launch from VS Code.',
};

test('getActiveRuntimeDescriptor returns the active runtime', () => {
    const runtime = getActiveRuntimeDescriptor(
        { active_runtime: 'codex-cli', runtime_catalog: [readyRuntime] },
        {},
    );
    assert.equal(runtime?.id, 'codex-cli');
});

test('getActiveHostDescriptor returns the active host from capabilities or registry', () => {
    assert.equal(
        getActiveHostDescriptor({ host: { id: 'host-a', label: 'Host A' } }, {})?.id,
        'host-a',
    );
    assert.equal(
        getActiveHostDescriptor(
            { host_registry: [{ id: 'host-a' }, { id: 'host-b' }], active_host_id: 'host-b' },
            {},
        )?.id,
        'host-b',
    );
});

test('getCapabilityState marks degraded clipboard runtimes correctly', () => {
    const state = getCapabilityState(degradedRuntime, 'prompt');
    assert.equal(state.state, 'degraded');
    assert.equal(state.enabled, true);
    assert.match(state.reason, /clipboard/i);
});

test('getCapabilityState marks unsupported approval as unavailable', () => {
    const state = getCapabilityState(degradedRuntime, 'approve');
    assert.equal(state.state, 'unavailable');
    assert.equal(state.enabled, false);
    assert.match(state.reason, /approval/i);
});

test('getCapabilityState disables prompt when no runtime is active', () => {
    const state = getCapabilityState(null, 'prompt');
    assert.equal(state.state, 'unavailable');
    assert.equal(state.enabled, false);
    assert.match(state.reason, /no active runtime/i);
});

test('getCapabilityState can use host-level capabilities without a runtime', () => {
    const state = getCapabilityState(null, 'prompt', {
        host: {
            id: 'native-host',
            label: 'Native Host',
            capabilities: ['prompt'],
            health: 'degraded',
            last_error: 'Prompt dispatch uses native host fallback.',
        },
    });

    assert.equal(state.state, 'degraded');
    assert.equal(state.enabled, true);
    assert.match(state.reason, /native host fallback/i);
});

test('getCapabilityState blocks host-level unsupported capabilities', () => {
    const state = getCapabilityState(null, 'prompt', {
        host: {
            id: 'read-only-host',
            label: 'Read Only Host',
            capabilities: [],
            health: 'degraded',
        },
    });

    assert.equal(state.state, 'unavailable');
    assert.equal(state.enabled, false);
    assert.match(state.reason, /unsupported/i);
});

test('getRuntimeLifecycleState marks launchable runtimes explicitly', () => {
    const state = getRuntimeLifecycleState(launchableTerminal, 'codex-cli');
    assert.equal(state.state, 'launchable');
    assert.equal(state.canLaunch, true);
    assert.equal(state.canAttach, false);
});

test('getCapabilityState limits detached terminal capabilities', () => {
    const runScriptState = getCapabilityState(launchableTerminal, 'run_script');
    const promptState = getCapabilityState(launchableTerminal, 'prompt');
    assert.equal(runScriptState.enabled, false);
    assert.equal(runScriptState.state, 'unavailable');
    assert.equal(promptState.enabled, true);
    assert.equal(promptState.state, 'degraded');
});

test('buildRuntimeDiagnostics surfaces the latest failure reason', () => {
    const diagnostics = buildRuntimeDiagnostics(
        [
            { type: 'execution.event', phase: 'dispatched', message: 'Prompt sent.', target_runtime: 'codex-cli' },
            { type: 'kill.result', ok: false, reason: 'unsupported', message: 'Interrupt unsupported.' },
        ],
        { bridge_connected: true },
        { active_runtime: 'codex-cli', runtime_catalog: [readyRuntime] },
    );

    assert.equal(diagnostics.bridgeConnected, true);
    assert.equal(diagnostics.lastDispatchTarget, 'codex-cli');
    assert.equal(diagnostics.lastFailureReason, 'unsupported');
    assert.match(diagnostics.runtimeStatusDetail, /attached/i);
});
