import React, { useEffect, useMemo, useState } from 'react';
import { Button, NavBar, Popup, SearchBar, Toast } from 'antd-mobile';
import { FileCode, Link2, Plus, X } from 'lucide-react';

function getBaseName(filePath) {
    const segments = String(filePath || '').split(/[\\/]/);
    return segments[segments.length - 1] || filePath;
}

function buildPreview(content) {
    const lines = String(content || '').split('\n');
    return {
        lineCount: lines.length,
        preview: lines.slice(0, 80).join('\n'),
        truncated: lines.length > 80,
    };
}

export default function OmniSearchDrawer({
    visible,
    onClose,
    allFiles = [],
    send,
    apiUrl,
    projectId,
    onAddContext,
}) {
    const [query, setQuery] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!visible) {
            setQuery('');
            setSelectedFile(null);
            setFileContent('');
            setIsLoading(false);
        }
    }, [visible]);

    const filteredFiles = useMemo(() => {
        if (!query) {
            return allFiles.slice(0, 40);
        }
        const lowerQuery = query.toLowerCase();
        return allFiles.filter((file) => file.toLowerCase().includes(lowerQuery)).slice(0, 40);
    }, [allFiles, query]);

    const preview = useMemo(() => buildPreview(fileContent), [fileContent]);

    const handleFileClick = async (file) => {
        setSelectedFile(file);
        setFileContent('');
        setIsLoading(true);
        try {
            const projectQuery = projectId ? `&project_id=${encodeURIComponent(projectId)}` : '';
            const response = await fetch(`${apiUrl}/api/files/read?path=${encodeURIComponent(file)}${projectQuery}`);
            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }
            setFileContent(data.content);
        } catch (error) {
            Toast.show({ icon: 'fail', content: '无法加载文件预览' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddContext = () => {
        if (!selectedFile) {
            return;
        }
        onAddContext?.(selectedFile);
        Toast.show({ icon: 'success', content: '已加入输入框' });
        onClose();
    };

    const handleOpenOnDesktop = () => {
        if (!selectedFile) {
            return;
        }
        void send({ type: 'workspace.focus', file: selectedFile, flash: true, project_id: projectId });
        Toast.show({ icon: 'success', content: '已在桌面宿主打开' });
        onClose();
    };

    return (
        <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ height: '90vh', backgroundColor: 'var(--bg-deep)' }}>
            <div className="omni-drawer">
                <NavBar
                    right={<X onClick={onClose} size={20} color="var(--text-primary)" />}
                    backArrow={false}
                    style={{ '--background-color': 'transparent', color: 'var(--text-primary)' }}
                >
                    {selectedFile ? '文件上下文' : '搜索文件'}
                </NavBar>

                {!selectedFile ? (
                    <div className="omni-search-view" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 45px)' }}>
                        <div style={{ padding: '0 12px 12px' }}>
                            <SearchBar
                                placeholder="搜索要引用的文件"
                                onChange={(value) => setQuery(value)}
                                autoFocus
                                style={{ '--background': 'var(--bg-elevated)', '--color': 'var(--text-primary)' }}
                            />
                        </div>
                        <div className="omni-search-copy">
                            选择一个文件后，可以加入输入框，或在桌面宿主中打开。
                        </div>
                        <div className="omni-list" style={{ flex: 1, overflowY: 'auto' }}>
                            {filteredFiles.map((file, index) => (
                                <div key={index} className="omni-item" onClick={() => handleFileClick(file)}>
                                    <FileCode size={16} color="var(--accent-purple)" />
                                    <div className="omni-item-copy">
                                        <div className="omni-item-title">{getBaseName(file)}</div>
                                        <div className="omni-item-path">{file}</div>
                                    </div>
                                </div>
                            ))}
                            {filteredFiles.length === 0 && (
                                <div className="loading-state">没有匹配的文件。</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="omni-reader-view" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 45px)' }}>
                        <div className="omni-reader-header" onClick={() => setSelectedFile(null)}>
                            返回搜索
                        </div>
                        <div className="omni-file-summary">
                            <div className="omni-file-name">{getBaseName(selectedFile)}</div>
                            <div className="omni-file-path">{selectedFile}</div>
                            <div className="omni-file-actions">
                                <Button size="small" color="primary" fill="solid" onClick={handleAddContext}>
                                    <Plus size={15} /> 加入上下文
                                </Button>
                                <Button size="small" fill="outline" onClick={handleOpenOnDesktop}>
                                    <Link2 size={15} /> 在桌面打开
                                </Button>
                            </div>
                            <div className="omni-file-meta">
                                正在预览前 {Math.min(preview.lineCount, 80)} 行
                                {preview.truncated ? `，共 ${preview.lineCount} 行` : ''}。
                            </div>
                        </div>
                        <div className="omni-reader-content">
                            {isLoading ? (
                                <div className="loading-state">正在加载文件预览...</div>
                            ) : (
                                <pre className="code-block">{preview.preview}</pre>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Popup>
    );
}
