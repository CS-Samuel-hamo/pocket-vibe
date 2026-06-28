import React, { useState, useEffect } from 'react';
import { List, NavBar, Popup, Toast } from 'antd-mobile';
import { FolderOutline, FileOutline, LeftOutline } from 'antd-mobile-icons';

const FileNavigator = ({ visible, onClose, onFileSelect }) => {
    const [path, setPath] = useState('.');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible) fetchFiles(path);
    }, [visible, path]);

    const fetchFiles = async (currentPath) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/files/list?path=${currentPath}`);
            const data = await res.json();
            if (data.error) Toast.show(data.error);
            else setFiles(data);
        } catch (e) {
            Toast.show('Failed to fetch files');
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        const parts = path.split('/');
        if (parts.length > 1) {
            parts.pop();
            setPath(parts.join('/'));
        } else {
            setPath('.');
        }
    };

    return (
        <Popup
            visible={visible}
            onMaskClick={onClose}
            position='right'
            bodyStyle={{ width: '80vw' }}
        >
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                <NavBar
                    back={path !== '.' ? 'Back' : null}
                    onBack={handleBack}
                    right={<span onClick={onClose}>Close</span>}
                >
                    Explorer
                </NavBar>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <List header={`Current: ${path}`}>
                        {files.map(file => (
                            <List.Item
                                key={file.path}
                                prefix={file.is_dir ? <FolderOutline /> : <FileOutline />}
                                onClick={() => {
                                    if (file.is_dir) setPath(file.path);
                                    else onFileSelect(file.path);
                                }}
                            >
                                {file.name}
                            </List.Item>
                        ))}
                    </List>
                </div>
            </div>
        </Popup>
    );
};

export default FileNavigator;
