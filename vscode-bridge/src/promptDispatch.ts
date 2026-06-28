import { startCodexExecPrompt } from './codexExecRuntime';
import { isCommandAvailable } from './commandAvailability';
import type { BackendMessage } from './workspaceProjects';
import { createProjectScopedSender, resolveWorkspaceRootPath } from './workspaceProjects';
import type { RuntimeAdapter } from './runtimeAdapters';
import type { RuntimeDescriptor, RuntimeId } from './runtimeRegistry';

interface PromptDispatchDependencies {
    sendToBackend(data: BackendMessage): void;
    reportCapabilities(): Promise<void>;
    recordRuntimeError(runtimeId: RuntimeId, reason: string): void;
}

export async function dispatchPromptToRuntime(
    prompt: string,
    runtimeContext: { adapter: RuntimeAdapter; descriptor: RuntimeDescriptor },
    message: BackendMessage,
    dependencies: PromptDispatchDependencies,
) {
    if (runtimeContext.descriptor.id !== 'codex-cli') {
        await runtimeContext.adapter.sendPrompt(prompt);
        return;
    }

    await startCodexExecPrompt(
        prompt,
        runtimeContext.descriptor,
        {
            sendToBackend: createProjectScopedSender(message, dependencies.sendToBackend),
            reportCapabilities: dependencies.reportCapabilities,
            recordRuntimeError: dependencies.recordRuntimeError,
            isCommandAvailable,
        },
        resolveWorkspaceRootPath(message),
    );
}
