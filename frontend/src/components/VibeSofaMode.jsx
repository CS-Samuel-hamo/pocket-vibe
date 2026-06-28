// frontend/src/components/VibeSofaMode.jsx
import React, { useState, useEffect } from 'react';
import { Card, Switch, Space } from 'antd-mobile';
import { Monitor } from 'lucide-react';
import { isFeatureEnabled } from '../config/features';

// Typography not available in antd-mobile, using plain span/p or styled components

const VibeSofaMode = () => {
    const [isActive, setIsActive] = useState(false);

    const toggleSofa = (checked) => {
        setIsActive(checked);
        // 切换全局 class 以放大字体和调整布局
        if (checked) {
            document.body.classList.add('sofa-mode-active');
        } else {
            document.body.classList.remove('sofa-mode-active');
        }
    };

    // 清理副作用
    useEffect(() => {
        return () => document.body.classList.remove('sofa-mode-active');
    }, []);

    return (
        <Card title="🛋️ Sofa Mode（沙发模式）" style={{ margin: 12 }}>
            <Space align="center" style={{ marginBottom: 12 }}>
                <Switch checked={isActive} onChange={toggleSofa} />
                <span>
                    {isActive ? '已开启 - 横屏大屏沉浸阅读' : '点击开启，大字体舒适阅读'}
                </span>
            </Space>

            {!isFeatureEnabled('isPro') && (
                <div>
                    <div>
                        <span style={{ color: '#ff8f1f', fontSize: 13 }}>
                            Pro 版解锁沉浸深色护眼与自动滚动
                        </span>
                    </div>
                </div>
            )}
        </Card>
    );
};

export default VibeSofaMode;
