import React from 'react';
import { Button, Grid } from 'antd-mobile';
import { Terminal } from 'lucide-react';

const CommandPanel = ({
    commands = [],
    onCommandClick,
    runtimeCatalog = [],
    activeRuntime = null,
    runScriptState,
}) => {
    const activeRuntimeDescriptor =
        runtimeCatalog.find((runtime) => runtime.id === activeRuntime) || null;
    const activeRuntimeLabel = activeRuntimeDescriptor?.label || '桌面宿主';

    return (
        <div className="command-panel" style={{ padding: '12px' }}>
            <div style={{ marginBottom: '12px', color: '#666', fontSize: '14px', fontWeight: 'bold' }}>
                项目脚本
            </div>
            <div style={{ marginBottom: '12px', color: '#8b94a7', fontSize: '12px', lineHeight: 1.5 }}>
                自动发现受支持的 <code>package.json</code> 或 <code>Makefile</code> 脚本，并在桌面端独立 shell 中执行。
                如果 shell 集成可用，输出会回传到手机 Console。当前运行时：{activeRuntimeLabel}。
            </div>
            {runScriptState && runScriptState.state !== 'available' && (
                <div style={{ marginBottom: '12px', color: runScriptState.state === 'degraded' ? '#ffb347' : '#ff8080', fontSize: '12px' }}>
                    {runScriptState.reason}
                </div>
            )}
            <Grid columns={2} gap={10}>
                {commands.length > 0 ? (
                    commands.map((command, index) => (
                        <Grid.Item key={index}>
                            <Button
                                block
                                color="primary"
                                fill="outline"
                                size="small"
                                onClick={() => onCommandClick(command.command)}
                                disabled={runScriptState ? !runScriptState.enabled : false}
                                style={{ height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Terminal size={14} style={{ marginRight: '4px' }} />
                                <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {command.name.replace('npm run ', '')}
                                </span>
                            </Button>
                        </Grid.Item>
                    ))
                ) : (
                    <div style={{ gridColumn: 'span 2', padding: '20px', textAlign: 'center', color: '#999' }}>
                        仓库根目录或已支持的工作区文件夹里没有发现可运行脚本。
                    </div>
                )}
            </Grid>
        </div>
    );
};

export default CommandPanel;
