/**
 * E2EE crypto utilities for frontend using Web Crypto API.
 */

export async function generateKeyPair() {
    return await window.crypto.subtle.generateKey(
        { name: "X25519" },
        true,
        ["deriveKey", "deriveBits"]
    );
}

export async function exportPublicKey(key) {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function deriveSharedSecret(privateKey, peerPublicKeyB64) {
    const peerPubKeyBytes = Uint8Array.from(atob(peerPublicKeyB64), c => c.charCodeAt(0));
    const peerPublicKey = await window.crypto.subtle.importKey(
        "raw",
        peerPubKeyBytes,
        { name: "X25519" },
        true,
        []
    );

    const rawSharedSecret = await window.crypto.subtle.deriveBits(
        {
            name: "X25519",
            public: peerPublicKey
        },
        privateKey,
        256
    );

    const rawSharedSecretKey = await window.crypto.subtle.importKey(
        "raw",
        rawSharedSecret,
        { name: "HKDF" },
        false,
        ["deriveKey"]
    );

    return await window.crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("vibe-salt-2026"),
            info: new TextEncoder().encode("pocket-vibe-e2ee")
        },
        rawSharedSecretKey,
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encrypt(plaintext, sharedKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sharedKey,
        encoder.encode(plaintext)
    );

    return {
        nonce: btoa(String.fromCharCode(...iv)),
        payload: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    };
}

export async function decrypt(encryptedPayload, sharedKey) {
    const iv = Uint8Array.from(atob(encryptedPayload.nonce), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(encryptedPayload.payload), c => c.charCodeAt(0));

    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        sharedKey,
        data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
}
