import React from 'react';
import DiffCard from './DiffCard';

const MessageStream = ({ messages, messagesEndRef }) => {
    const renderMessage = (msg, i) => {
        switch (msg.type) {
            case 'user':
                return (
                    <div key={i} className="message user-message">
                        <div className="message-content">{msg.content}</div>
                    </div>
                );
            case 'log':
            case 'sys':
                return (
                    <div key={i} className="message log-message">
                        <div className="message-content">{msg.content}</div>
                    </div>
                );
            case 'diff':
                return (
                    <div key={i} className="message diff-message">
                        <DiffCard file={msg.file} content={msg.content} />
                    </div>
                );
            case 'status':
                return (
                    <div key={i} className="message status-message">
                        [{msg.state}] {msg.message}
                    </div>
                );
            default:
                return (
                    <div key={i} className="message log-message">
                        <div className="message-content">{JSON.stringify(msg)}</div>
                    </div>
                );
        }
    };

    return (
        <div className="messages-container">
            {messages.map((msg, i) => renderMessage(msg, i))}
            <div ref={messagesEndRef} />
        </div>
    );
};

export default MessageStream;
