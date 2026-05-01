import { useCallback, useEffect, useRef, useState } from 'react';
import * as crypto from '../crypto';
import { appendIncomingMessage, normalizeIncomingMessage } from '../utils/messageFeed';

export function useOpenVibeWS(wsUrl) {
    const [status, setStatus] = useState('disconnected');
    const [messages, setMessages] = useState([]);
    const ws = useRef(null);
    const reconnectAttempt = useRef(0);
    const reconnectTimer = useRef(null);
    const sharedSecret = useRef(null);
    const keyPair = useRef(null);
    const lastSeqId = useRef(0);

    const addMsg = useCallback((incomingMsg) => {
        const newMsg = normalizeIncomingMessage(incomingMsg);
        setMessages((prev) => {
            if (!newMsg) {
                return prev;
            }

            if (newMsg.seq_id) {
                lastSeqId.current = Math.max(lastSeqId.current, newMsg.seq_id);
            }

            return appendIncomingMessage(prev, newMsg);
        });
    }, []);

    const send = useCallback(async (data, options = {}) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            return;
        }

        const payload = JSON.stringify(data);
        const shouldEncrypt = !options.plain && sharedSecret.current && data.type !== 'key_exchange';
        if (shouldEncrypt) {
            const encrypted = await crypto.encrypt(payload, sharedSecret.current);
            ws.current.send(JSON.stringify({ type: 'encrypted', ...encrypted }));
            return;
        }
        ws.current.send(payload);
    }, []);

    const bootstrapSession = useCallback(async () => {
        await send({ type: 'resume', last_seq_id: lastSeqId.current });
        await send({ type: 'hello' });
    }, [send]);

    const connect = useCallback(async () => {
        if (!wsUrl || ws.current?.readyState === WebSocket.CONNECTING) {
            return;
        }

        setStatus('connecting');
        const socket = new WebSocket(wsUrl);
        ws.current = socket;

        socket.onopen = async () => {
            reconnectAttempt.current = 0;
            const secureContextReady = window.isSecureContext && window.crypto?.subtle;

            if (!secureContextReady) {
                sharedSecret.current = null;
                setStatus('connected');
                await bootstrapSession();
                return;
            }

            try {
                keyPair.current = await crypto.generateKeyPair();
                const publicKey = await crypto.exportPublicKey(keyPair.current.publicKey);
                setStatus('handshaking');
                socket.send(JSON.stringify({ type: 'key_exchange', public_key: publicKey }));
            } catch (error) {
                console.error('Pocket Vibe E2EE init failed, falling back to clear text', error);
                sharedSecret.current = null;
                setStatus('connected');
                await bootstrapSession();
            }
        };

        socket.onmessage = async (event) => {
            try {
                let data = JSON.parse(event.data);

                if (data.type === 'key_exchange') {
                    sharedSecret.current = await crypto.deriveSharedSecret(keyPair.current.privateKey, data.public_key);
                    setStatus('connected');
                    addMsg({ type: 'execution.event', phase: 'secure', message: 'Secure tunnel established.' });
                    await bootstrapSession();
                    return;
                }

                if (data.type === 'encrypted' && sharedSecret.current) {
                    const decrypted = await crypto.decrypt(data, sharedSecret.current);
                    data = JSON.parse(decrypted);
                }

                if (data.type === 'pong') {
                    return;
                }

                addMsg(data);
            } catch (error) {
                console.error('Pocket Vibe websocket message error', error);
            }
        };

        socket.onclose = (event) => {
            setStatus('disconnected');
            sharedSecret.current = null;

            if (event.code === 4003) {
                return;
            }

            const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt.current);
            reconnectAttempt.current += 1;
            reconnectTimer.current = setTimeout(() => {
                void connect();
            }, delay);
        };

        socket.onerror = (error) => {
            console.error('Pocket Vibe websocket error', error);
        };
    }, [addMsg, bootstrapSession, wsUrl]);

    useEffect(() => {
        const heartbeat = setInterval(() => {
            if (status === 'connected') {
                void send({ type: 'ping' });
            }
        }, 15000);
        return () => clearInterval(heartbeat);
    }, [send, status]);

    useEffect(() => {
        void connect();
        return () => {
            clearTimeout(reconnectTimer.current);
            ws.current?.close();
        };
    }, [connect]);

    return { status, messages, send, addMsg };
}
