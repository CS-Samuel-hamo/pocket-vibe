import React, { useState, useEffect } from 'react';
import { useSpeechRecognition } from 'react-speech-recognition';
import { Button as AntButton, Toast } from 'antd-mobile';
import { MicrophoneOutlined, AudioOutlined } from '@ant-design/icons';
import './VoiceInput.css';

const VoiceInput = ({ onResult, onTranscriptChange }) => {
  const [isListening, setIsListening] = useState(false);
  const [browserSupport, setBrowserSupport] = useState(true);

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable
  } = useSpeechRecognition();

  useEffect(() => {
    if (!browserSupportsSpeechRecognition) {
      setBrowserSupport(false);
      Toast.show({ content: '您的浏览器不支持语音输入，请使用Chrome或Safari', duration: 3000 });
    }
  }, [browserSupportsSpeechRecognition]);

  useEffect(() => {
    // 实时传递转录文本
    if (transcript && onTranscriptChange) {
      onTranscriptChange(transcript);
    }
  }, [transcript, onTranscriptChange]);

  const handleStartListening = async () => {
    if (!browserSupport) {
      Toast.show({ content: '浏览器不支持语音输入', duration: 2000 });
      return;
    }

    if (!isMicrophoneAvailable) {
      Toast.show({ content: '请允许使用麦克风', duration: 2000 });
      return;
    }

    try {
      resetTranscript();
      setIsListening(true);

      // 开始语音识别
      SpeechRecognition.startListening({ continuous: true, language: 'zh-CN', interimResults: true });

      Toast.show({ content: '正在听...', duration: 1000 });
    } catch (error) {
      console.error('Speech recognition error:', error);
      Toast.show({ content: '语音启动失败，请重试', duration: 2000 });
      setIsListening(false);
    }
  };

  const handleStopListening = () => {
    SpeechRecognition.stopListening();
    setIsListening(false);

    if (transcript && onResult) {
      onResult(transcript);
    }
    Toast.show({ content: '语音识别完成', duration: 1000 });
  };

  // 处理触摸事件（移动端更友好）
  const handleTouchStart = (e) => {
    e.preventDefault();
    handleStartListening();
  };

  const handleTouchEnd = (e) => {
    e.preventDefault();
    handleStopListening();
  };

  if (!browserSupport) {
    return (
      <AntButton disabled className="voice-btn disabled" icon={<MicrophoneOutlined />}>不支持</AntButton>
    );
  }

  return (
    <div className="voice-input-container">
      <AntButton
        className={`voice-btn ${isListening ? 'listening' : ''}`}
        onMouseDown={handleStartListening}
        onMouseUp={handleStopListening}
        onMouseLeave={isListening ? handleStopListening : undefined}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        icon={isListening ? <AudioOutlined spin /> : <MicrophoneOutlined />}
      >
        {isListening ? '录音中...' : '按住说话'}
      </AntButton>

      {isListening && transcript && (
        <div className="transcript-preview">
          {transcript}
        </div>
      )}
    </div>
  );
};

export default VoiceInput;
