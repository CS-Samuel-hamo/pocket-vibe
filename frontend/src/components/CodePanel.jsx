import React, { useState } from 'react';
import { FileCode, MoreHorizontal } from 'lucide-react';

/**
 * CodePanel - Displays source code and unified diffs.
 * Supports line-level selection to satisfy the "@file#L" requirement.
 */
const CodePanel = ({ activeFiles = [], currentFileIndex = 0, onFileChange, onLineSelect }) => {
    const [selectedLines, setSelectedLines] = useState(null); // { start, end }

    const activeFileData = activeFiles[currentFileIndex] || { name: 'No files', lines: [] };

    const handleLineClick = (lineNum) => {
        // Simple logic for toggle selection or multi-select could be added here
        setSelectedLines({ start: lineNum, end: lineNum });
        if (onLineSelect) {
            onLineSelect(activeFileData.name, lineNum, lineNum);
        }
    };

    return (
        <div className="code-panel">
            {/* File Tabs */}
            <div className="file-tabs">
                {activeFiles.map((f, i) => (
                    <div
                        key={i}
                        className={`file-tab ${i === currentFileIndex ? 'active' : ''}`}
                        onClick={() => onFileChange(i)}
                    >
                        {f.name}
                        {f.modified && <span className="tab-dot modified" />}
                    </div>
                ))}
            </div>

            {/* Diff/Code Content */}
            <div className="diff-content">
                {activeFileData.hunks ? activeFileData.hunks.map((hunk, hi) => (
                    <React.Fragment key={hi}>
                        <div className="diff-hunk-header">
                            <MoreHorizontal size={12} style={{ marginRight: 8 }} />
                            {hunk.header}
                        </div>
                        {hunk.lines.map((line, li) => (
                            <div
                                key={li}
                                className={`diff-line ${line.type} ${selectedLines?.start === line.ln ? 'selected' : ''}`}
                                onClick={() => handleLineClick(line.ln)}
                            >
                                <span className="gutter">{line.ln || ''}</span>
                                <span className="sign">{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ''}</span>
                                <span className="code">{line.content}</span>
                            </div>
                        ))}
                    </React.Fragment>
                )) : (
                    <div className="empty-state">No changes pending.</div>
                )}
            </div>

        </div>
    );
};

export default CodePanel;
