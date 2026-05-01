"""Unit tests for the crypto module."""

import pytest
import base64
from src.core.crypto import Crypto

def test_keypair_generation():
    crypto = Crypto()
    assert crypto.public_key_b64 is not None
    assert len(crypto.public_key_b64) > 30

def test_shared_secret_derivation():
    alice = Crypto()
    bob = Crypto()

    secret_a = alice.derive_shared_secret(bob.public_key_b64)
    secret_b = bob.derive_shared_secret(alice.public_key_b64)

    assert secret_a == secret_b
    assert len(secret_a) == 32

def test_encryption_decryption_roundtrip():
    crypto = Crypto()
    alice = Crypto()
    shared_secret = crypto.derive_shared_secret(alice.public_key_b64)

    plaintext = "Hello, Secure World!"
    encrypted = Crypto.encrypt(plaintext, shared_secret)

    assert "nonce" in encrypted
    assert "payload" in encrypted

    decrypted = Crypto.decrypt(encrypted, shared_secret)
    assert decrypted == plaintext

def test_decryption_failure_with_wrong_key():
    crypto = Crypto()
    alice = Crypto()
    eve = Crypto()

    shared_secret_legit = crypto.derive_shared_secret(alice.public_key_b64)
    shared_secret_eve = crypto.derive_shared_secret(eve.public_key_b64)

    encrypted = Crypto.encrypt("Secret", shared_secret_legit)

    with pytest.raises(Exception):
        Crypto.decrypt(encrypted, shared_secret_eve)
