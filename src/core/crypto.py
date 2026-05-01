"""E2EE crypto utilities for OpenVibe."""

import base64
import json
import os
from typing import Dict, Any, Tuple
from cryptography.hazmat.primitives.asymmetric import x25519
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

class Crypto:
    """Handles X25519 ECDH and AES-GCM encryption/decryption."""

    def __init__(self):
        # Generate our host keypair
        self.private_key = x25519.X25519PrivateKey.generate()
        self.public_key = self.private_key.public_key()

        # Public key in base64 for QR/Handshake
        self.public_key_b64 = base64.b64encode(
            self.public_key.public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw
            )
        ).decode('utf-8')

    def derive_shared_secret(self, peer_public_key_b64: str) -> bytes:
        """Derive a shared secret using ECDH and HKDF for key derivation."""
        peer_public_bytes = base64.b64decode(peer_public_key_b64)
        peer_public_key = x25519.X25519PublicKey.from_public_bytes(peer_public_bytes)
        shared_secret = self.private_key.exchange(peer_public_key)

        # Use HKDF to derive a proper encryption key from the shared secret
        derived_key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b'vibe-salt-2026',
            info=b'pocket-vibe-e2ee'
        ).derive(shared_secret)

        return derived_key

    @staticmethod
    def encrypt(plaintext: str, shared_secret: bytes) -> Dict[str, str]:
        """Encrypt plaintext using AES-256-GCM."""
        aesgcm = AESGCM(shared_secret)
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)

        return {
            "nonce": base64.b64encode(nonce).decode('utf-8'),
            "payload": base64.b64encode(ciphertext).decode('utf-8')
        }

    @staticmethod
    def decrypt(encrypted_data: Dict[str, str], shared_secret: bytes) -> str:
        """Decrypt payload using AES-256-GCM."""
        aesgcm = AESGCM(shared_secret)
        nonce = base64.b64decode(encrypted_data["nonce"])
        payload = base64.b64decode(encrypted_data["payload"])

        decrypted = aesgcm.decrypt(nonce, payload, None)
        return decrypted.decode('utf-8')
