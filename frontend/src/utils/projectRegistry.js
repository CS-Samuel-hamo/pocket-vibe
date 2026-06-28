export function getActiveProject(sessionInfo = {}) {
    const registry = sessionInfo.project_registry || [];
    const activeProjectId = sessionInfo.active_project_id || null;
    return (
        registry.find((project) => project.project_id === activeProjectId) ||
        registry[0] ||
        null
    );
}

function toTimestamp(value) {
    if (!value) {
        return 0;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function truncatePreview(value, limit = 110) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) {
        return '';
    }
    return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function createProjectActivity(project) {
    return {
        project,
        lastReply: '',
        lastIssue: '',
        lastEvent: '',
        lastActivityAt: 0,
    };
}

function approvalBelongsToProject(pendingApproval, project, activeProjectId) {
    if (!pendingApproval || !project) {
        return false;
    }

    if (pendingApproval.project_id) {
        return pendingApproval.project_id === project.project_id;
    }

    return project.project_id === activeProjectId;
}

function getProjectActivityMap(projectRegistry = [], messages = [], history = []) {
    const activityMap = new Map(
        projectRegistry.map((project) => [project.project_id, createProjectActivity(project)]),
    );

    const ensureActivity = (projectId) => {
        if (!projectId || !activityMap.has(projectId)) {
            return null;
        }
        return activityMap.get(projectId);
    };

    messages.forEach((message) => {
        const activity = ensureActivity(message.project_id);
        if (!activity) {
            return;
        }

        activity.lastActivityAt = Math.max(activity.lastActivityAt, toTimestamp(message.timestamp));

        if (message.type === 'assistant') {
            const reply = message.content || message.message;
            if (reply) {
                activity.lastReply = truncatePreview(reply);
            }
            return;
        }

        if (message.type === 'execution.event' && message.phase === 'error') {
            activity.lastIssue = truncatePreview(message.message || message.reason);
            return;
        }

        if (message.type === 'kill.result' && message.ok === false) {
            activity.lastIssue = truncatePreview(message.message || message.reason);
            return;
        }

        if (message.type === 'approval.result' && message.ok === false) {
            activity.lastIssue = truncatePreview(message.reason || message.decision);
            return;
        }

        const genericEvent = message.message || message.content;
        if (genericEvent) {
            activity.lastEvent = truncatePreview(genericEvent, 90);
        }
    });

    history.forEach((entry) => {
        const activity = ensureActivity(entry.project_id);
        if (!activity) {
            return;
        }

        activity.lastActivityAt = Math.max(activity.lastActivityAt, toTimestamp(entry.timestamp));

        if ((entry.ok === false || /fail|error|offline|rejected/i.test(String(entry.message || ''))) && entry.message) {
            activity.lastIssue = truncatePreview(entry.message);
            return;
        }

        if (entry.message) {
            activity.lastEvent = truncatePreview(entry.message, 90);
        }
    });

    return activityMap;
}

export function buildProjectInboxEntries({
    sessionInfo = {},
    messages = [],
    history = [],
    pendingApproval = null,
    limit = 4,
} = {}) {
    const projectRegistry = sessionInfo.project_registry || [];
    const activeProjectId = sessionInfo.active_project_id || null;
    const activityMap = getProjectActivityMap(projectRegistry, messages, history);

    return projectRegistry
        .map((project) => {
            const activity = activityMap.get(project.project_id) || createProjectActivity(project);
            const isActive = project.project_id === activeProjectId;
            const hasPendingApproval = approvalBelongsToProject(pendingApproval, project, activeProjectId);
            const hasIssue = Boolean(activity.lastIssue || project.last_error || project.runtime_health === 'offline');
            const hostLabel = project.host_label || project.bridge_label || 'Desktop Host';
            const runtimeLabel = project.runtime_label || project.active_runtime || 'Desktop Host';
            const health = project.runtime_health || 'offline';
            const previewLabel = hasPendingApproval
                ? 'Approval'
                : activity.lastIssue || project.last_error
                    ? 'Issue'
                    : activity.lastReply
                        ? 'Last Reply'
                        : 'Status';
            const previewText = hasPendingApproval
                ? `${pendingApproval.tool_name || 'Approval'} is waiting on this project.`
                : activity.lastIssue
                    ? activity.lastIssue
                    : project.last_error
                        ? truncatePreview(project.last_error)
                        : activity.lastReply
                            ? activity.lastReply
                            : activity.lastEvent
                                ? activity.lastEvent
                                : getProjectSwitchState(project, activeProjectId).detail;
            const tone = hasPendingApproval
                ? 'warning'
                : hasIssue
                    ? 'danger'
                    : health === 'degraded'
                        ? 'warning'
                        : 'healthy';

            return {
                project_id: project.project_id,
                project_name: project.project_name || 'Project',
                hostLabel,
                runtimeLabel,
                health,
                isActive,
                hasPendingApproval,
                hasIssue,
                previewLabel,
                previewText,
                lastActivityAt: activity.lastActivityAt,
                tone,
                actionLabel: isActive ? 'Current' : 'Open',
            };
        })
        .sort((left, right) => (
            Number(right.isActive) - Number(left.isActive)
            || Number(right.hasPendingApproval) - Number(left.hasPendingApproval)
            || Number(right.hasIssue) - Number(left.hasIssue)
            || right.lastActivityAt - left.lastActivityAt
            || String(left.project_name || '').localeCompare(String(right.project_name || ''))
        ))
        .slice(0, limit);
}

export function getProjectSwitchState(project, activeProjectId) {
    if (!project) {
        return {
            isActive: false,
            actionLabel: 'Open',
            detail: 'No project metadata is available yet.',
        };
    }

    const isActive = project.project_id === activeProjectId;
    const runtimeLabel = project.runtime_label || project.active_runtime || 'Desktop Host';
    const health = project.runtime_health || 'offline';
    const hostLabel = project.host_label || project.bridge_label || 'Desktop Host';
    const detail =
        project.status_detail ||
        project.last_error ||
        `${hostLabel} - ${runtimeLabel} - ${health}`;

    return {
        isActive,
        actionLabel: 'Open',
        detail,
    };
}
