import React, { useState, useEffect } from 'react';
import { Modal, Button as AntButton, TextArea as AntTextArea } from 'antd-mobile';
import './ConfirmDialog.css';

const ConfirmDialog = ({ visible, context, onConfirm, onReject, onAsk, timeout = 300 }) => {
  const [countdown, setCountdown] = useState(timeout);
  const [customResponse, setCustomResponse] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!visible) {
      // 重置状态
      setCountdown(timeout);
      setIsExpired(false);
      setCustomResponse('');
      return;
    }
    const tick = () => setCountdown(prev => {
      if (prev > 1) return prev - 1;
      setIsExpired(true);
      onReject('n');
      return 0;
    });
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [visible, timeout, onReject]);

  // 格式化上下文，高亮关键信息
  const formatContext = (text) => {
    if (!text) return null;

    return text.split('\n').map((line, idx) => {
      // 高亮文件修改
      if (line.includes('diff --git') || line.includes('@@')) return <div key={idx} className="context-line diff-line">{line}</div>;
      // 高亮确认提示
      if (line.match(/(Apply|Confirm|Proceed|y\/n|Commit|Add|Run|Would you like|Shall I)/i)) return <div key={idx} className="context-line confirm-prompt">{line}</div>;
      // 高亮添加的行
      if (line.startsWith('+') && !line.startsWith('+++')) return <div key={idx} className="context-line added-line">{line}</div>;
      // 高亮删除的行
      if (line.startsWith('-') && !line.startsWith('---')) return <div key={idx} className="context-line removed-line">{line}</div>;
      return <div key={idx} className="context-line normal-line">{line}</div>;
    });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isExpired) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      title={
        <div className="confirm-header">
          <span className="confirm-title">⚠️ 需要确认</span>
          <div className="confirm-timer">
            剩余时间: <span className={countdown < 60 ? 'timer-warning' : ''}>{formatTime(countdown)}</span>
          </div>
        </div>
      }
      content={
        <div className="confirm-content">
          <div className="context-box">
            {formatContext(context)}
          </div>

          <div className="custom-response-section">
            <div className="custom-response-label">自定义回复（可选）:</div>
            <AntTextArea
              placeholder="输入自定义回复，或留空使用默认选项"
              value={customResponse}
              onChange={val => setCustomResponse(val)}
              rows={2}
              className="custom-response-input"
            />
          </div>
        </div>
      }
      actions={[
        {
          key: 'reject',
          text: '✗ 拒绝',
          onClick: () => onReject(customResponse || 'n')
        },
        {
          key: 'ask',
          text: '? 询问',
          onClick: () => onAsk(customResponse || 'Can you explain?')
        },
        {
          key: 'confirm',
          text: '✓ 确认',
          primary: true,
          onClick: () => onConfirm(customResponse || 'y')
        }
      ]}
      closeOnAction={false}
      closeOnMaskClick={false}
    />
  );
};

export default ConfirmDialog;
