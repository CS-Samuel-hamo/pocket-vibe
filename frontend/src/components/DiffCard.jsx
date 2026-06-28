import React, { useState } from 'react';
import ReactDiffViewer from 'react-diff-viewer';
import { Card, Button as AntButton, Collapse } from 'antd-mobile';
import './DiffCard.css';

const diffStyles = {
  variables: {
    light: {
      diffViewerBackground: '#ffffff',
      gutterBackground: '#f5f5f5',
      addedBackground: '#e6ffed',
      addedColor: '#24292e',
      addedGutterBackground: '#cdffd8',
      removedBackground: '#ffeef0',
      removedColor: '#24292e',
      removedGutterBackground: '#ffdce0',
      wordAddedBackground: '#acf2bd',
      wordRemovedBackground: '#fdb8c0',
      gutterColor: '#6e7781',
    }
  },
  contentText: {
    fontSize: '12px',
    fontFamily: 'Consolas, Monaco, monospace',
  },
  gutter: {
    minWidth: '30px',
    padding: '0 8px',
  }
};

const DiffCard = ({ file, content, oldValue = '', newValue = '', onConfirm, onReject }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 如果没有提供oldValue和newValue，尝试从content解析
  const parseDiffContent = (diffContent) => {
    if (!diffContent) return { oldCode: '', newCode: '' };

    const lines = diffContent.split('\n');
    let oldCode = [];
    let newCode = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) continue;

      if (line.startsWith('@@')) { inHunk = true; continue; }
      if (!inHunk) continue;

      if (line.startsWith('+') && !line.startsWith('+++')) newCode.push(line.substring(1));
      else if (line.startsWith('-') && !line.startsWith('---')) oldCode.push(line.substring(1));
      else if (line.startsWith(' ')) { const code = line.substring(1); oldCode.push(code); newCode.push(code); }
      else if (line === '') { oldCode.push(''); newCode.push(''); }
    }

    return {
      oldCode: oldCode.join('\n'),
      newCode: newCode.join('\n')
    };
  };

  // 使用传入的值或解析content
  const { oldCode, newCode } = (oldValue || newValue)
    ? { oldCode: oldValue, newCode: newValue }
    : parseDiffContent(content);

  // 如果没有解析出内容，直接显示原始content
  const hasParsedContent = oldCode || newCode;

  return (
    <Card className="diff-card">
      <div className="diff-card-header">
        <div className="file-info">
          <span className="file-icon">📄</span>
          <span className="file-name">{file || 'unknown'}</span>
        </div>
        <div className="diff-badge">DIFF</div>
      </div>

      <Collapse activeKey={isExpanded ? ['1'] : []}>
        <Collapse.Panel key="1" title={isExpanded ? '收起' : '展开查看'}>
          <div className="diff-content">
            {hasParsedContent ? (
              <ReactDiffViewer
                oldValue={oldCode}
                newValue={newCode}
                splitView={false}
                showDiffOnly={false}
                hideLineNumbers={false}
                styles={diffStyles}
              />
            ) : (
              <pre className="raw-diff">{content}</pre>
            )}
          </div>
        </Collapse.Panel>
      </Collapse>

      {(onConfirm || onReject) && (
        <div className="diff-actions">
          {onReject && (
            <AntButton onClick={onReject} className="action-btn reject-btn">
              ✗ 拒绝
            </AntButton>
          )}
          {onConfirm && (
            <AntButton onClick={onConfirm} className="action-btn confirm-btn" color='primary'>
              ✓ 确认
            </AntButton>
          )}
        </div>
      )}
    </Card>
  );
};

export default DiffCard;
