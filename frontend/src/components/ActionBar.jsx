import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, X, Clock } from 'lucide-react';
import { Button as AntButton } from 'antd-mobile';

/**
 * ActionBar - Bottom-anchored approval bar with dynamic visibility and file badges.
 */
const ActionBar = ({ pendingApproval, onApprove, onReject, approvalState }) => {
    const [timeLeft, setTimeLeft] = useState(60);

    useEffect(() => {
        if (!pendingApproval) {
            setTimeLeft(60);
            return;
        }
        const timer = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [pendingApproval]);

    if (!pendingApproval) return null;

    return (
        <div className="action-bar" id="actionBar">
            <div className="action-bar-info">
                <div className="action-bar-left">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`risk-badge ${pendingApproval.risk || 'med'}`}>
                                {pendingApproval.risk?.toUpperCase() || 'MEDIUM'} RISK
                            </span>
                            <span className="action-bar-label">{pendingApproval.tool_name}</span>
                        </div>
                        <div className="action-bar-files">
                            {pendingApproval.files?.map((f, i) => (
                                <span key={i} className="file-badge">{f}</span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="action-bar-timer">
                    <Clock size={12} style={{ marginRight: 4 }} />
                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                </div>
            </div>

            {/* Command/Arguments Preview */}
            <div className="action-bar-context">
                <pre>{typeof pendingApproval.context === 'string' ? pendingApproval.context : JSON.stringify(pendingApproval.context, null, 2)}</pre>
            </div>

            <div className="action-bar-buttons">
                <AntButton
                    className="btn btn-reject"
                    onClick={() => onReject('n')}
                    disabled={approvalState ? !approvalState.enabled : false}
                >
                    <X size={16} /> NO (Reject)
                </AntButton>
                <AntButton
                    className="btn btn-approve"
                    onClick={() => onApprove('y')}
                    disabled={approvalState ? !approvalState.enabled : false}
                >
                    <Check size={16} /> YES (Approve)
                </AntButton>
            </div>

            {approvalState && approvalState.state !== 'available' && (
                <div className="action-bar-hint" style={{ color: approvalState.state === 'degraded' ? '#ffaa00' : '#ff8080' }}>
                    {approvalState.reason}
                </div>
            )}

            <div className="action-bar-hint">
                Type <kbd>/y</kbd> to approve or <kbd>/n</kbd> to reject
            </div>

        </div>
    );
};

export default ActionBar;
