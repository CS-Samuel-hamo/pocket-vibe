import React, { useState, useEffect } from 'react';
import { Button as AntButton, CapsuleTabs, Popup, Space, Toast } from 'antd-mobile';
import { EditSOutline, AddOutline } from 'antd-mobile-icons';

const SmartPhrases = ({ visible, onClose, onPhraseSelect }) => {
    const [phrases, setPhrases] = useState([]);
    const [activeCategory, setActiveCategory] = useState('quality');

    useEffect(() => {
        if (visible) fetchPhrases();
    }, [visible]);

    const fetchPhrases = async () => {
        try {
            const res = await fetch('/api/phrases');
            const data = await res.json();
            setPhrases(data);
        } catch (e) {
            Toast.show('Failed to fetch phrases');
        }
    };

    const categories = [...new Set(phrases.map(p => p.category))];

    return (
        <Popup
            visible={visible}
            onMaskClick={onClose}
            position='bottom'
            bodyStyle={{ borderTopLeftRadius: '12px', borderTopRightRadius: '12px', minHeight: '40vh' }}
        >
            <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>Smart Phrases</h3>
                    <Space>
                        <AntButton size='mini' color='primary' fill='outline' icon={<AddOutline />}>New</AntButton>
                        <span onClick={onClose} style={{ color: '#999' }}>Close</span>
                    </Space>
                </div>

                <CapsuleTabs activeKey={activeCategory} onChange={setActiveCategory}>
                    {categories.map(cat => (
                        <CapsuleTabs.Tab title={cat} key={cat}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                {phrases.filter(p => p.category === cat).map(p => (
                                    <AntButton
                                        key={p.id}
                                        size='small'
                                        onClick={() => onPhraseSelect(p.content)}
                                        style={{ '--border-radius': '20px' }}
                                    >
                                        {p.label}
                                    </AntButton>
                                ))}
                            </div>
                        </CapsuleTabs.Tab>
                    ))}
                </CapsuleTabs>
            </div>
        </Popup>
    );
};

export default SmartPhrases;
