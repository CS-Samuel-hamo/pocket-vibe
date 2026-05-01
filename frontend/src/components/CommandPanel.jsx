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
    const activeRuntimeLabel = activeRuntimeDescriptor?.label || 'Desktop Host';

    return (
        <div className="command-panel" style={{ padding: '12px' }}>
            <div style={{ marginBottom: '12px', color: '#666', fontSize: '14px', fontWeight: 'bold' }}>
                Project Scripts
            </div>
            <div style={{ marginBottom: '12px', color: '#8b94a7', fontSize: '12px', lineHeight: 1.5 }}>
                Discovered from supported <code>package.json</code> or <code>Makefile</code> files and executed in a
                dedicated desktop shell. Output streams back to the mobile console when shell integration is available.
                The current host runtime is {activeRuntimeLabel}.
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
                        No runnable scripts were found in the repo root or supported workspace folders.
                    </div>
                )}
            </Grid>
        </div>
    );
};

export default CommandPanel;
