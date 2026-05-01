import { useState, useCallback, useRef } from 'react';

/**
 * useApprovalQueue - Logic hook for managing pending write approvals.
 * Separated from UI for React Native portability.
 *
 * Manages:
 * - Queue of pending tool_call confirmations
 * - Auto-hide when queue is empty
 * - Approval history persistence
 */
export function useApprovalQueue() {
    const [pendingApproval, setPendingApproval] = useState(null);
    const [history, setHistory] = useState([]);
    const timerRef = useRef(null);

    const enqueue = useCallback((approval) => {
        // approval: { id, tool_name, files: string[], risk: 'low'|'med'|'high', context: string }
        setPendingApproval(approval);
    }, []);

    const approve = useCallback(() => {
        if (!pendingApproval) return null;
        const record = {
            ...pendingApproval,
            decision: 'approved',
            timestamp: new Date().toISOString(),
        };
        setHistory(prev => [record, ...prev]);
        const result = { confirm_id: pendingApproval.id, response: 'yes' };
        setPendingApproval(null);
        return result;
    }, [pendingApproval]);

    const reject = useCallback((reason = '') => {
        if (!pendingApproval) return null;
        const record = {
            ...pendingApproval,
            decision: 'rejected',
            reason,
            timestamp: new Date().toISOString(),
        };
        setHistory(prev => [record, ...prev]);
        const result = { confirm_id: pendingApproval.id, response: 'no', reason };
        setPendingApproval(null);
        return result;
    }, [pendingApproval]);

    const hasPending = pendingApproval !== null;

    return { pendingApproval, hasPending, history, enqueue, approve, reject };
}
