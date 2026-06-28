import assert from 'assert/strict';

import {
    createRuntimeDescriptor,
    selectActiveRuntime,
    capabilityIsSupported,
    type RuntimeDescriptor,
} from '../runtimeRegistry';

const readyTerminal = createRuntimeDescriptor(
    {
        id: 'codex-cli',
        label: 'Codex CLI',
        source: 'terminal',
        supports: ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'],
        dispatch_mode: 'raw_prompt',
        approval_mode: 'terminal_yes_no',
        interrupt_mode: 'ctrl_c',
    },
    {
        available: true,
        attached: true,
        launchable: true,
        terminalName: 'codex',
    },
);

const degradedExtension = createRuntimeDescriptor(
    {
        id: 'continue-ext',
        label: 'Continue',
        source: 'extension',
        supports: ['prompt', 'focus', 'read_context'],
        dispatch_mode: 'clipboard_fallback',
        approval_mode: 'unsupported',
        interrupt_mode: 'unsupported',
    },
    {
        available: true,
        attached: true,
        launchable: false,
        extensionId: 'continue.continue',
    },
);

const launchableTerminal = createRuntimeDescriptor(
    {
        id: 'claude-code',
        label: 'Claude Code',
        source: 'terminal',
        supports: ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'],
        dispatch_mode: 'raw_prompt',
        approval_mode: 'terminal_yes_no',
        interrupt_mode: 'ctrl_c',
    },
    {
        available: true,
        attached: false,
        launchable: true,
        status_detail: 'Claude Code is available to launch from VS Code.',
    },
);

const offlineRuntime = createRuntimeDescriptor(
    {
        id: 'opencode',
        label: 'OpenCode',
        source: 'terminal',
        supports: ['prompt', 'focus', 'read_context', 'approve', 'kill', 'run_script'],
        dispatch_mode: 'raw_prompt',
        approval_mode: 'terminal_yes_no',
        interrupt_mode: 'ctrl_c',
    },
    {
        available: false,
    },
);

assert.equal(readyTerminal.health, 'ready');
assert.equal(readyTerminal.attached, true);
assert.equal(readyTerminal.launchable, true);
assert.equal(readyTerminal.dispatch_mode, 'raw_prompt');
assert.equal(readyTerminal.approval_mode, 'terminal_yes_no');
assert.equal(readyTerminal.interrupt_mode, 'ctrl_c');
assert.equal(capabilityIsSupported(readyTerminal, 'kill'), true);

assert.equal(degradedExtension.health, 'degraded');
assert.equal(degradedExtension.attached, true);
assert.equal(degradedExtension.launchable, false);
assert.equal(degradedExtension.dispatch_mode, 'clipboard_fallback');
assert.equal(capabilityIsSupported(degradedExtension, 'prompt'), true);
assert.equal(capabilityIsSupported(degradedExtension, 'approve'), false);

assert.equal(offlineRuntime.health, 'offline');
assert.match(offlineRuntime.last_error || '', /not detected/i);
assert.equal(capabilityIsSupported(offlineRuntime, 'prompt'), false);

assert.equal(launchableTerminal.health, 'degraded');
assert.equal(launchableTerminal.attached, false);
assert.equal(launchableTerminal.launchable, true);
assert.match(launchableTerminal.status_detail || '', /launch/i);

const active = selectActiveRuntime(
    [offlineRuntime, degradedExtension, readyTerminal] as RuntimeDescriptor[],
    '',
    'codex',
);

assert.equal(active?.id, 'codex-cli');

const preferred = selectActiveRuntime(
    [degradedExtension, readyTerminal] as RuntimeDescriptor[],
    'continue-ext',
    '',
);

assert.equal(preferred?.id, 'continue-ext');
