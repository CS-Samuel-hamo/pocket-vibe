// frontend/src/components/VoicePromptInput.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, StopCircle } from 'lucide-react';
import { Button, Toast } from 'antd-mobile';

const VoicePromptInput = ({ value: externalValue, onChange, onSend, disabled = false, disabledReason = '' }) => {
    const [localValue, setLocalValue] = useState(externalValue || '');
    const [isRecording, setIsRecording] = useState(false);
    const recognitionRef = useRef(null);

    // Sync external value only if it changes from outside (e.g. clear)
    useEffect(() => {
        if (externalValue !== localValue) {
            setLocalValue(externalValue || '');
        }
    }, [externalValue]);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('speechRecognition' in window)) {
            console.warn('Speech recognition not supported');
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'zh-CN';

        recognitionRef.current.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            setLocalValue((value) => {
                const nextValue = value + transcript;
                onChange?.(nextValue);
                return nextValue;
            });
        };

        recognitionRef.current.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            setIsRecording(false);
            Toast.show({ content: '语音识别失败: ' + event.error, icon: 'fail' });
        };

        recognitionRef.current.onend = () => setIsRecording(false);
    }, []);

    const toggleVoice = () => {
        if (!recognitionRef.current) {
            Toast.show({ content: '浏览器不支持语音识别', icon: 'fail' });
            return;
        }

        if (isRecording) {
            recognitionRef.current.stop();
        } else {
            recognitionRef.current.start();
            setIsRecording(true);
            Toast.show({ content: '正在录音...', icon: 'success' });
        }
    };

    const handleSendClick = () => {
        if (disabled) {
            Toast.show({ content: disabledReason || '当前无法发送指令。', icon: 'fail' });
            return;
        }
        if (localValue.trim()) {
            onSend(localValue);
            onChange?.('');
            setLocalValue(''); // Clear locally
        }
    };

    return (
        <div className="apple-input-wrapper">
            <div className="apple-input-container">
                <Button
                    className={`voice-toggle-btn ${isRecording ? 'active' : ''}`}
                    onClick={toggleVoice}
                >
                    {isRecording ? <StopCircle size={20} color="#FF453A" /> : <Mic size={20} />}
                </Button>

                <input
                    className="apple-native-input"
                    placeholder={disabled ? (disabledReason || '当前无法发送指令') : '输入指令...'}
                    value={localValue}
                    disabled={disabled}
                    onChange={(e) => {
                        setLocalValue(e.target.value);
                        onChange?.(e.target.value);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendClick()}
                />

                <Button
                    className={`apple-send-btn ${localValue.trim() ? 'active' : ''}`}
                    disabled={disabled || !localValue.trim()}
                    onClick={handleSendClick}
                >
                    <Send size={18} />
                </Button>
            </div>
        </div>
    );
};

export default VoicePromptInput;
